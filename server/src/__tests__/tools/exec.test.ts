import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { exec } from '../../tools/exec.js';
import { deriveTimeouts, EXEC_BUDGET_CAP_MS } from '../../connection/timeouts.js';

describe('godot_exec tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('run requires a non-empty source within the size cap', () => {
      expect(exec.schema.safeParse({ action: 'run' }).success).toBe(false);
      expect(exec.schema.safeParse({ action: 'run', source: '' }).success).toBe(false);
      expect(exec.schema.safeParse({ action: 'run', source: 'return 1' }).success).toBe(true);
      expect(exec.schema.safeParse({ action: 'run', source: 'x'.repeat(16_384) }).success).toBe(true);
      expect(exec.schema.safeParse({ action: 'run', source: 'x'.repeat(16_385) }).success).toBe(false);
    });

    it('run enforces the published budget cap', () => {
      expect(exec.schema.safeParse({ action: 'run', source: 'pass', budget_ms: EXEC_BUDGET_CAP_MS }).success).toBe(true);
      expect(exec.schema.safeParse({ action: 'run', source: 'pass', budget_ms: EXEC_BUDGET_CAP_MS + 1 }).success).toBe(false);
      expect(exec.schema.safeParse({ action: 'run', source: 'pass', budget_ms: 0 }).success).toBe(false);
    });

    it('remove requires a name; list and clear take no extra arguments', () => {
      expect(exec.schema.safeParse({ action: 'remove' }).success).toBe(false);
      expect(exec.schema.safeParse({ action: 'remove', name: '' }).success).toBe(false);
      expect(exec.schema.safeParse({ action: 'remove', name: 'GodGuard' }).success).toBe(true);
      expect(exec.schema.safeParse({ action: 'list' }).success).toBe(true);
      expect(exec.schema.safeParse({ action: 'clear' }).success).toBe(true);
    });
  });

  describe('run', () => {
    it('forwards the source and returns the structured result', async () => {
      mock.mockResponse({ completed: true, result: 5, duration_ms: 2, holder_children: 0 });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'run', source: 'G.wave = 5\nreturn G.wave' }, ctx);

      expect(mock.calls[0].command).toBe('exec_run');
      expect(mock.calls[0].params.source).toBe('G.wave = 5\nreturn G.wave');
      const data = structuredOf(result);
      expect(data.completed).toBe(true);
      expect(data.result).toBe(5);
    });

    it('passes runtime_errors through (the call still completes)', async () => {
      mock.mockResponse({
        completed: true,
        result: null,
        duration_ms: 1,
        holder_children: 0,
        runtime_errors: ["Invalid access to property or key 'foo' on a base object of type 'Nil'."],
      });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'run', source: 'var x = null\nreturn x.foo' }, ctx);
      const data = structuredOf(result);
      expect(data.completed).toBe(true);
      expect(data.runtime_errors).toHaveLength(1);
    });

    it('derives the timeout cascade from budget_ms and pushes the relay budget', async () => {
      mock.mockResponse({ completed: true, result: null, duration_ms: 0, holder_children: 0 });
      const ctx = createToolContext(mock);

      await exec.execute({ action: 'run', source: 'pass', budget_ms: 5000 }, ctx);
      const call = mock.calls[0];
      const t = deriveTimeouts(5000); // no ready-wait, same class as game_time
      expect(call.params.relay_timeout_ms).toBe(t.relayMs);
      expect(call.opts?.timeoutMs).toBe(t.serverMs);
      // No wall budget: a synchronous script cannot be aborted, so none is pretended.
      expect(call.params.wall_budget_ms).toBeUndefined();
    });

    it('defaults the budget to 10s when omitted', async () => {
      mock.mockResponse({ completed: true, result: null, duration_ms: 0, holder_children: 0 });
      const ctx = createToolContext(mock);

      await exec.execute({ action: 'run', source: 'pass' }, ctx);
      expect(mock.calls[0].opts?.timeoutMs).toBe(deriveTimeouts(10_000).serverMs);
    });

    it('propagates a bridge-side rejection (denylist, compile error)', async () => {
      mock.mockError(new Error("DENIED_TOKEN: source contains 'OS.execute'"));
      const ctx = createToolContext(mock);

      await expect(
        exec.execute({ action: 'run', source: 'OS.execute("cmd", [])' }, ctx),
      ).rejects.toThrow('DENIED_TOKEN');
    });
  });

  describe('lifecycle', () => {
    it('list returns the structured holder inventory', async () => {
      mock.mockResponse({
        nodes: [{ name: 'GodGuard', class: 'Timer', script_chars: 0, age_ms: 4200, processing: true }],
        count: 1,
      });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'list' }, ctx);
      expect(mock.calls[0].command).toBe('exec_list');
      const data = structuredOf(result);
      expect(data.count).toBe(1);
      expect(data.nodes[0].name).toBe('GodGuard');
    });

    it('list keeps the structured shape when the holder is empty', async () => {
      mock.mockResponse({ nodes: [], count: 0 });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'list' }, ctx);
      const data = structuredOf(result);
      expect(data.count).toBe(0);
      expect(data.nodes).toEqual([]);
    });

    it('remove forwards the name and returns the structured result', async () => {
      mock.mockResponse({ removed: true, name: 'GodGuard', remaining: 0 });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'remove', name: 'GodGuard' }, ctx);
      expect(mock.calls[0].command).toBe('exec_remove');
      expect(mock.calls[0].params.name).toBe('GodGuard');
      const data = structuredOf(result);
      expect(data.removed).toBe(true);
      expect(data.remaining).toBe(0);
    });

    it('remove propagates NOT_FOUND from the bridge', async () => {
      mock.mockError(new Error("NOT_FOUND: no exec node named 'Bogus' (have: GodGuard)"));
      const ctx = createToolContext(mock);

      await expect(exec.execute({ action: 'remove', name: 'Bogus' }, ctx)).rejects.toThrow('NOT_FOUND');
    });

    it('clear reports the removed count', async () => {
      mock.mockResponse({ removed_count: 2 });
      const ctx = createToolContext(mock);

      const result = await exec.execute({ action: 'clear' }, ctx);
      expect(mock.calls[0].command).toBe('exec_clear');
      expect(result).toContain('Removed 2');
    });
  });
});
