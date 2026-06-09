import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import { GodotConnection } from '../../connection/websocket.js';
import { getServerVersion } from '../../version.js';

// Keep diagnostics hermetic (no WSL detection / no child processes) and quiet.
vi.mock('../../utils/connection-strategy.js', () => ({
  getTargetHost: () => '127.0.0.1',
  getConnectionStrategy: (port: number) => ({
    environment: 'native' as const,
    targetHost: '127.0.0.1',
    wsUrl: `ws://127.0.0.1:${port}`,
  }),
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warning: vi.fn(),
    warningRateLimited: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
  },
}));

// Application close codes the Godot addon uses on the bridge.
const CLOSE_CODE_ALREADY_CONNECTED = 4001;
const CLOSE_CODE_REPLACED = 4003;

/**
 * Stand up a throwaway WebSocket server that plays the role of the Godot bridge.
 * The supplied handler decides what to do with each incoming client socket.
 */
async function startFakeBridge(
  onConnection: (socket: WsSocket) => void
): Promise<{ wss: WebSocketServer; port: number }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(wss, 'listening');
  wss.on('connection', onConnection);
  const port = (wss.address() as AddressInfo).port;
  return { wss, port };
}

/** Resolve when `event` fires on `emitter`, reject if it doesn't within `ms`. */
function waitForEvent(emitter: GodotConnection, event: string, ms = 3000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      emitter.off(event, handler);
      reject(new Error(`Timed out waiting for "${event}" event`));
    }, ms);
    const handler = () => {
      clearTimeout(timer);
      resolve();
    };
    emitter.once(event, handler);
  });
}

describe('GodotConnection contention handling (#237)', () => {
  let connection: GodotConnection | null = null;
  let wss: WebSocketServer | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Tear the client down first so its reconnect timer is cleared before the
    // bridge goes away (otherwise it would reconnect to a dead port).
    connection?.disconnect();
    connection = null;
    if (wss) {
      await new Promise<void>((resolve) => wss!.close(() => resolve()));
      wss = null;
    }
  });

  it('reconnects after being replaced by a newer client (4003), instead of latching dead', async () => {
    // Bridge replaces whoever connects: closes the socket with the REPLACED code.
    const bridge = await startFakeBridge((socket) => {
      socket.on('message', () => socket.close(CLOSE_CODE_REPLACED, 'Replaced by new client'));
    });
    wss = bridge.wss;

    connection = new GodotConnection({ host: '127.0.0.1', port: bridge.port });
    const reconnecting = waitForEvent(connection, 'reconnecting');

    await connection.connect().catch(() => {});
    // The whole point of #237: a replaced client must schedule a reconnect.
    await expect(reconnecting).resolves.toBeUndefined();
    expect(connection.getDiagnostics().lastDisconnectReason).toBe('replaced_by_new_client');
  });

  it('keeps retrying when rejected because another client is connected (4001)', async () => {
    const bridge = await startFakeBridge((socket) => {
      socket.on('message', () => socket.close(CLOSE_CODE_ALREADY_CONNECTED, 'Another client is already connected'));
    });
    wss = bridge.wss;

    connection = new GodotConnection({ host: '127.0.0.1', port: bridge.port });
    const reconnecting = waitForEvent(connection, 'reconnecting');

    await connection.connect().catch(() => {});
    await expect(reconnecting).resolves.toBeUndefined();
    expect(connection.getDiagnostics().lastDisconnectReason).toBe('rejected_another_client');
    expect(connection.getDiagnostics().rejectionCount).toBe(1);
  });

  it('no longer tells a replaced client to restart; reports automatic recovery', async () => {
    const bridge = await startFakeBridge((socket) => {
      socket.on('message', () => socket.close(CLOSE_CODE_REPLACED, 'Replaced by new client'));
    });
    wss = bridge.wss;

    connection = new GodotConnection({ host: '127.0.0.1', port: bridge.port });
    const reconnecting = waitForEvent(connection, 'reconnecting');
    await connection.connect().catch(() => {});
    await reconnecting;

    const message = connection.getDiagnosticMessage();
    expect(message).not.toMatch(/no longer active/i);
    expect(message).toMatch(/reconnect/i);
  });
});

describe('GodotConnection per-request timeout (#276)', () => {
  let connection: GodotConnection | null = null;
  let wss: WebSocketServer | null = null;

  afterEach(async () => {
    connection?.disconnect();
    connection = null;
    if (wss) {
      await new Promise<void>((resolve) => wss!.close(() => resolve()));
      wss = null;
    }
  });

  // Reply to the handshake (so connect() resolves immediately and without a
  // version-mismatch), then let the supplied handler deal with real commands.
  async function bridgeAfterHandshake(
    onCommand: (socket: WsSocket, msg: { id: string; command: string }) => void
  ): Promise<{ wss: WebSocketServer; port: number }> {
    return startFakeBridge((socket) => {
      socket.on('message', (raw) => {
        let msg: { id: string; command: string } | undefined;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!msg) return;
        if (msg.command === 'mcp_handshake') {
          socket.send(JSON.stringify({ id: msg.id, status: 'success', result: { addon_version: getServerVersion() } }));
          return;
        }
        onCommand(socket, msg);
      });
    });
  }

  it('rejects after opts.timeoutMs when the bridge never answers the command', async () => {
    // Drop every non-handshake command on the floor.
    const bridge = await bridgeAfterHandshake(() => {});
    wss = bridge.wss;
    connection = new GodotConnection({ host: '127.0.0.1', port: bridge.port, autoReconnect: false });
    await connection.connect();

    const start = Date.now();
    await expect(connection.sendCommand('get_runtime_state', {}, { timeoutMs: 150 })).rejects.toThrow();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(120);
    expect(elapsed).toBeLessThan(2000);
  });

  it('does not fire early when given a generous opts.timeoutMs', async () => {
    // Answer the command after a short delay; a 1s budget must not trip on it.
    const bridge = await bridgeAfterHandshake((socket, msg) => {
      setTimeout(() => socket.send(JSON.stringify({ id: msg.id, status: 'success', result: { ok: true } })), 100);
    });
    wss = bridge.wss;
    connection = new GodotConnection({ host: '127.0.0.1', port: bridge.port, autoReconnect: false });
    await connection.connect();

    const result = await connection.sendCommand<{ ok: boolean }>('get_runtime_state', {}, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
  });
});
