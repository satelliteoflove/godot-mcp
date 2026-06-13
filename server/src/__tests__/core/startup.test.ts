import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { main } from '../../index.js';
import { registry } from '../../core/registry.js';

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

// #319: a slow/unreachable Godot host (e.g. WSL2 hitting a Windows firewall
// that drops the SYN) must not delay the MCP transport handshake. We model the
// worst case — a Godot connect that NEVER resolves — and assert startup still
// completes and the full tool list is registered. If main() ever awaits the
// Godot connection before connecting the transport again, beforeAll hangs and
// this whole describe block times out.
describe('server startup (#319)', () => {
  const fakeTransport = {
    started: false,
    async start() {
      this.started = true;
    },
    async send() {},
    async close() {},
  };
  let godotConnectStarted = false;
  let mainResolved = false;

  beforeAll(async () => {
    await main({
      createTransport: () => fakeTransport as unknown as Transport,
      connectGodot: () => {
        godotConnectStarted = true;
        return new Promise<void>(() => {}); // never resolves — host unreachable
      },
    });
    mainResolved = true;
  });

  it('connects the MCP transport without waiting on the Godot connection', () => {
    expect(mainResolved).toBe(true);
    expect(fakeTransport.started).toBe(true);
  });

  it('still kicks off the Godot connection in the background', () => {
    expect(godotConnectStarted).toBe(true);
  });

  it('registers the full tool list regardless of Godot reachability', () => {
    const names = registry.getToolList().map((t) => t.name);
    // A read tool and a write tool, to prove the whole set registered (not a
    // read-only or empty subset) before any connection was established.
    expect(names).toContain('godot_node_read');
    expect(names).toContain('godot_exec');
    expect(names.length).toBeGreaterThanOrEqual(20);
  });
});
