import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  Request,
  Response,
  ResponseSchema,
  createRequest,
  isSuccessResponse,
  isErrorResponse,
} from './protocol.js';
import {
  GodotConnectionError,
  GodotCommandError,
  GodotTimeoutError,
} from '../utils/errors.js';
import { getServerVersion } from '../version.js';
import { logger } from '../utils/logger.js';

const DEFAULT_PORT = 6550;
const DEFAULT_HOST = 'localhost';
const COMMAND_TIMEOUT_MS = 30000;
const HANDSHAKE_TIMEOUT_MS = 5000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

const CLOSE_CODE_ALREADY_CONNECTED = 4001;

export type DisconnectReason =
  | 'never_connected'
  | 'rejected_another_client'
  | 'connection_refused'
  | 'connection_lost'
  | 'closed_normally'
  | 'error';

export interface ConnectionDiagnostics {
  currentState: 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
  lastDisconnectReason: DisconnectReason;
  rejectionCount: number;
  reconnectAttempts: number;
  lastErrorMessage: string | null;
  url: string;
}

export type HandshakeStatus = 'pending' | 'success' | 'failed' | 'timeout';

export interface HandshakeResult {
  addonVersion: string;
  godotVersion: string;
  projectPath: string;
  projectName: string;
  handshakeStatus: HandshakeStatus;
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

export interface GodotConnectionOptions {
  host?: string;
  port?: number;
  autoReconnect?: boolean;
}

export class GodotConnection extends EventEmitter {
  private ws: WebSocket | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;
  private isClosing = false;
  private handshakeResult: HandshakeResult | null = null;

  private lastDisconnectReason: DisconnectReason = 'never_connected';
  private rejectionCount = 0;
  private lastErrorMessage: string | null = null;
  private currentState: 'connected' | 'disconnected' | 'connecting' | 'reconnecting' = 'disconnected';

  private readonly host: string;
  private readonly port: number;
  private readonly autoReconnect: boolean;

  constructor(options: GodotConnectionOptions = {}) {
    super();
    this.host = options.host ?? DEFAULT_HOST;
    this.port = options.port ?? DEFAULT_PORT;
    this.autoReconnect = options.autoReconnect ?? true;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get url(): string {
    return `ws://${this.host}:${this.port}`;
  }

  get addonVersion(): string | null {
    return this.handshakeResult?.addonVersion ?? null;
  }

  get projectPath(): string | null {
    return this.handshakeResult?.projectPath ?? null;
  }

  get projectName(): string | null {
    return this.handshakeResult?.projectName ?? null;
  }

  get godotVersion(): string | null {
    return this.handshakeResult?.godotVersion ?? null;
  }

  get serverVersion(): string {
    return getServerVersion();
  }

  get versionsMatch(): boolean {
    if (!this.handshakeResult) return false;
    return this.handshakeResult.addonVersion === this.serverVersion;
  }

  getDiagnostics(): ConnectionDiagnostics {
    return {
      currentState: this.currentState,
      lastDisconnectReason: this.lastDisconnectReason,
      rejectionCount: this.rejectionCount,
      reconnectAttempts: this.reconnectAttempt,
      lastErrorMessage: this.lastErrorMessage,
      url: this.url,
    };
  }

  getDiagnosticMessage(): string {
    const diag = this.getDiagnostics();
    const lines: string[] = [];

    switch (diag.lastDisconnectReason) {
      case 'rejected_another_client':
        lines.push('Status: Connection rejected (another client already connected)');
        if (diag.rejectionCount > 1) {
          lines.push(`Details: ${diag.rejectionCount} connection attempts rejected`);
        }
        lines.push('Suggestion: Multiple MCP server processes may be running.');
        lines.push('  Check: ps aux | grep godot-mcp (macOS/Linux)');
        lines.push('  Check: Get-Process -Name node | ? CommandLine -Like "*godot-mcp*" (Windows)');
        lines.push('  Fix: Kill all godot-mcp processes and restart your MCP client');
        break;

      case 'connection_refused':
        lines.push(`Status: Cannot reach Godot at ${diag.url}`);
        lines.push('Suggestion: Ensure Godot is running with the MCP addon enabled.');
        break;

      case 'connection_lost':
        lines.push('Status: Connection to Godot was lost');
        if (diag.reconnectAttempts > 0) {
          lines.push(`Details: ${diag.reconnectAttempts} reconnection attempts made`);
        }
        lines.push('Suggestion: Check if Godot is still running.');
        break;

      case 'never_connected':
        lines.push(`Status: Never successfully connected to Godot at ${diag.url}`);
        lines.push('Suggestion: Ensure Godot is running with the MCP addon enabled.');
        break;

      case 'error':
        lines.push('Status: Connection error');
        if (diag.lastErrorMessage) {
          lines.push(`Details: ${diag.lastErrorMessage}`);
        }
        break;

      default:
        lines.push(`Status: Disconnected (${diag.lastDisconnectReason})`);
    }

    return lines.join('\n');
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.isClosing = false;
      this.currentState = this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
      this.ws = new WebSocket(this.url);

      this.ws.on('open', async () => {
        this.reconnectAttempt = 0;
        this.startPingInterval();

        try {
          await this.performHandshake();
          this.currentState = 'connected';
        } catch (error) {
          this.currentState = 'connected';
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error('Handshake failed (addon may be outdated)', { error: errorMessage });
          this.emit('handshake_failed', { error: errorMessage });
        }

        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('pong', () => {
        this.clearPongTimeout();
      });

      this.ws.on('close', (code, reason) => {
        const wasConnected = this.currentState === 'connected';
        this.currentState = 'disconnected';

        if (code === CLOSE_CODE_ALREADY_CONNECTED) {
          this.lastDisconnectReason = 'rejected_another_client';
          this.rejectionCount++;
          const reasonStr = reason?.toString() || 'Another client is already connected';
          logger.critical('Connection rejected: another client already connected', {
            reason: reasonStr,
            suggestion: 'Multiple MCP server processes may be running',
            diagnostics: {
              macLinux: 'ps aux | grep godot-mcp',
              windows: 'Get-Process -Name node | ? CommandLine -Like "*godot-mcp*"',
            },
          });
        } else if (wasConnected) {
          this.lastDisconnectReason = 'connection_lost';
        } else if (this.lastDisconnectReason === 'never_connected') {
          this.lastDisconnectReason = 'connection_refused';
        }

        this.cleanup();
        this.emit('disconnected');
        if (this.autoReconnect && !this.isClosing) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        this.lastErrorMessage = error.message;
        if (error.message.includes('ECONNREFUSED')) {
          this.lastDisconnectReason = 'connection_refused';
        } else {
          this.lastDisconnectReason = 'error';
        }
        this.emit('error', error);
        if (!this.isConnected) {
          reject(new GodotConnectionError(`Failed to connect: ${error.message}`));
        }
      });
    });
  }

  disconnect(): void {
    this.isClosing = true;
    this.lastDisconnectReason = 'closed_normally';
    this.currentState = 'disconnected';
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async sendCommand<T = unknown>(command: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.isConnected) {
      const diagnosticMessage = this.getDiagnosticMessage();
      throw new GodotConnectionError(`Not connected to Godot\n${diagnosticMessage}`);
    }

    const request = createRequest(command, params);

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new GodotTimeoutError(command, COMMAND_TIMEOUT_MS));
      }, COMMAND_TIMEOUT_MS);

      this.pendingRequests.set(request.id, {
        resolve: resolve as (result: unknown) => void,
        reject,
        timeoutId,
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  private async performHandshake(): Promise<void> {
    const request = createRequest('mcp_handshake', {
      server_version: this.serverVersion,
    });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        this.handshakeResult = {
          addonVersion: 'unknown',
          godotVersion: 'unknown',
          projectPath: '',
          projectName: '',
          handshakeStatus: 'timeout',
        };
        reject(new GodotTimeoutError('mcp_handshake', HANDSHAKE_TIMEOUT_MS));
      }, HANDSHAKE_TIMEOUT_MS);

      this.pendingRequests.set(request.id, {
        resolve: (result: unknown) => {
          const data = result as {
            addon_version?: string;
            godot_version?: string;
            project_path?: string;
            project_name?: string;
          };

          this.handshakeResult = {
            addonVersion: data.addon_version ?? 'unknown',
            godotVersion: data.godot_version ?? 'unknown',
            projectPath: data.project_path ?? '',
            projectName: data.project_name ?? '',
            handshakeStatus: 'success',
          };

          if (!this.versionsMatch) {
            this.emit('version_mismatch', {
              serverVersion: this.serverVersion,
              addonVersion: this.handshakeResult.addonVersion,
              projectPath: this.handshakeResult.projectPath,
            });
          }

          resolve();
        },
        reject,
        timeoutId,
      });

      this.ws!.send(JSON.stringify(request));
    });
  }

  private handleMessage(data: string): void {
    let parsed: unknown;
    let responseId: string | undefined;

    try {
      parsed = JSON.parse(data);
      if (typeof parsed === 'object' && parsed !== null && 'id' in parsed) {
        responseId = String((parsed as Record<string, unknown>).id);
      }
    } catch {
      this.emit('error', new Error(`Invalid JSON from Godot: ${data}`));
      return;
    }

    const validationResult = ResponseSchema.safeParse(parsed);
    if (!validationResult.success) {
      const pending = responseId ? this.pendingRequests.get(responseId) : undefined;
      if (pending) {
        this.pendingRequests.delete(responseId!);
        clearTimeout(pending.timeoutId);
        pending.reject(new GodotConnectionError(`Malformed response: ${validationResult.error.message}`));
      } else {
        this.emit('error', new Error(`Invalid response (no matching request): ${data}`));
      }
      return;
    }

    const response = validationResult.data;
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);
    clearTimeout(pending.timeoutId);

    if (isSuccessResponse(response)) {
      pending.resolve(response.result);
    } else if (isErrorResponse(response)) {
      pending.reject(new GodotCommandError(response.error.code, response.error.message));
    }
  }

  private startPingInterval(): void {
    this.stopPingInterval();
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.ws!.ping();
        this.pongTimeout = setTimeout(() => {
          this.emit('error', new Error('Pong timeout - connection may be dead'));
          this.ws?.terminate();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;

    this.emit('reconnecting', { attempt: this.reconnectAttempt, delay });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      try {
        await this.connect();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warningRateLimited('reconnect-fail', 'Reconnection attempt failed', {
          attempt: this.reconnectAttempt,
          error: errorMessage,
        });
      }
    }, delay);
  }

  private cleanup(): void {
    this.stopPingInterval();
    this.handshakeResult = null;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new GodotConnectionError('Connection closed'));
    }
    this.pendingRequests.clear();
  }
}

let globalConnection: GodotConnection | null = null;

function parsePortEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const port = parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    logger.warning('Invalid GODOT_PORT, using default', { value, default: DEFAULT_PORT });
    return undefined;
  }
  return port;
}

function parseHostEnv(value: string | undefined): string | undefined {
  if (!value || value.trim() === '') return undefined;
  return value.trim();
}

export function getGodotConnection(): GodotConnection {
  if (!globalConnection) {
    globalConnection = new GodotConnection({
      host: parseHostEnv(process.env.GODOT_HOST),
      port: parsePortEnv(process.env.GODOT_PORT),
    });
  }
  return globalConnection;
}

export async function initializeConnection(): Promise<void> {
  const connection = getGodotConnection();

  connection.on('connected', () => {
    logger.info('Connected to Godot');
  });

  connection.on('disconnected', () => {
    logger.warning('Disconnected from Godot');
  });

  connection.on('reconnecting', ({ attempt, delay }) => {
    logger.warningRateLimited('reconnect', 'Reconnecting to Godot', { attempt, delayMs: delay });
  });

  connection.on('error', (error) => {
    logger.error('Connection error', { error: error.message });
  });

  connection.on('version_mismatch', ({ serverVersion, addonVersion, projectPath }) => {
    console.error(`[godot-mcp] Version mismatch: server=${serverVersion}, addon=${addonVersion}`);
    console.error(`[godot-mcp] Update addon with: npx @satelliteoflove/godot-mcp --install-addon "${projectPath}"`);
    logger.notice('Version mismatch detected', {
      serverVersion,
      addonVersion,
      suggestion: 'Run: npx @satelliteoflove/godot-mcp --install-addon <project-path>',
    });
  });

  connection.on('handshake_failed', ({ error }) => {
    logger.error('Handshake failed', {
      error,
      advisory: 'The addon may be outdated or incompatible. Connection will continue but some features may not work.',
    });
  });

  try {
    await connection.connect();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warning('Initial connection failed, will retry', { error: errorMessage });
  }
}
