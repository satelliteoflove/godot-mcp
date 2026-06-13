import { describe, it, expect, vi } from 'vitest';
import { GodotConnection } from '../../connection/websocket.js';

// Pretend we're in WSL so getDiagnosticMessage takes the WSL branch.
vi.mock('../../utils/connection-strategy.js', () => ({
  getTargetHost: () => '127.0.0.1',
  getConnectionStrategy: (port: number) => ({
    environment: 'wsl' as const,
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

// #319: when a tool is called while Godot is unreachable, the diagnostic the
// caller sees should name the actual WSL cause (bind mode / 127.0.0.1 boundary),
// not just "ensure Godot is running".
describe('connection diagnostics name the WSL bind-mode cause (#319)', () => {
  it('a never-connected client in WSL points at Bind mode: WSL', () => {
    const connection = new GodotConnection({ host: '127.0.0.1', port: 6550, autoReconnect: false });
    const message = connection.getDiagnosticMessage();
    expect(message).toMatch(/never successfully connected/i);
    expect(message).toMatch(/WSL/);
    expect(message).toMatch(/Bind mode: WSL/);
    expect(message).toMatch(/GODOT_HOST/);
  });
});
