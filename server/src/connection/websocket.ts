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

const DEFAULT_PORT = 6550;
const DEFAULT_HOST = 'localhost';
const COMMAND_TIMEOUT_MS = 30000;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

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

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.isClosing = false;
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.reconnectAttempt = 0;
        this.startPingInterval();
        this.emit('connected');
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('pong', () => {
        this.clearPongTimeout();
      });

      this.ws.on('close', () => {
        this.cleanup();
        this.emit('disconnected');
        if (this.autoReconnect && !this.isClosing) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error) => {
        this.emit('error', error);
        if (!this.isConnected) {
          reject(new GodotConnectionError(`Failed to connect: ${error.message}`));
        }
      });
    });
  }

  disconnect(): void {
    this.isClosing = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  async sendCommand<T = unknown>(command: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.isConnected) {
      throw new GodotConnectionError('Not connected to Godot');
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
      } catch {
        // connect() will schedule another reconnect on failure
      }
    }, delay);
  }

  private cleanup(): void {
    this.stopPingInterval();

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
    console.error(`[godot-mcp] Invalid GODOT_PORT "${value}", using default`);
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
    console.error('[godot-mcp] Connected to Godot');
  });

  connection.on('disconnected', () => {
    console.error('[godot-mcp] Disconnected from Godot');
  });

  connection.on('reconnecting', ({ attempt, delay }) => {
    console.error(`[godot-mcp] Reconnecting (attempt ${attempt}) in ${delay}ms...`);
  });

  connection.on('error', (error) => {
    console.error(`[godot-mcp] Connection error: ${error.message}`);
  });

  try {
    await connection.connect();
  } catch (error) {
    console.error(`[godot-mcp] Initial connection failed, will retry: ${error}`);
  }
}
