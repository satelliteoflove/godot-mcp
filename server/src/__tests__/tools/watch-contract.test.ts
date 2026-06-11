import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  createMockGodot,
  createToolContext,
  structuredOf,
  MockGodotConnection,
} from '../helpers/mock-godot.js';
import { runtimeState } from '../../tools/runtime-state.js';

// Cross-language wire-contract check for the watch lifecycle (#286).
//
// This pins the CONSUMER side: the TypeScript server's watch encode/decode must
// use exactly the key names in the shared artifact. The GDScript headless suite
// (godot/addons/godot_mcp/test/watch_contract_headless_test.gd) pins the PRODUCER
// side against the SAME file. A rename on either side now breaks its own suite
// instead of silently drifting (the TS `?? default` back-compat would otherwise
// swallow a vanished response key).
//
// The artifact is read at RUNTIME (not a static JSON import) so tsc's rootDir
// (src/) does not choke on a file outside it — the #287 lesson.
//
// KNOWN BOUNDARY: the request-key NAMES are pinned here on the SEND side; the
// editor command layer's consume of those names (runtime_state_commands.gd) and
// the editor->game positional decode are GDScript<->GDScript, off both suites'
// runtime paths. The high-value cross-language surface (response/event/sample
// keys) is pinned from both directions.

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT_PATH = resolve(HERE, '../../../../godot/addons/godot_mcp/test/watch_contract.json');

interface Shape {
  required: string[];
  optional: string[];
}
interface Contract {
  watch_start_request: Shape;
  watch_start_request_positional: string[];
  watch_start_response: Shape;
  unresolved_signal: Shape;
  watch_collect_response: Shape;
  field_sample: Shape;
  event: Shape;
}

function loadContract(): Contract {
  try {
    return JSON.parse(readFileSync(CONTRACT_PATH, 'utf8')) as Contract;
  } catch (e) {
    throw new Error(
      `Could not read the watch contract artifact at ${CONTRACT_PATH}. ` +
        `It is the single source of truth shared with the GDScript headless suite; ` +
        `if it moved, update CONTRACT_PATH here and the res:// path in the headless test. (${String(e)})`
    );
  }
}

const contract = loadContract();

// Build an object whose keys are EXACTLY the contract shape's required keys,
// pulling each value from `values`. Throws if the test fails to supply a value
// for a contract key — that forces the test fixtures to track the artifact, so a
// rename in the artifact surfaces here (not as a silently stale literal).
function objFromContract(shape: keyof Contract, values: Record<string, unknown>): Record<string, unknown> {
  const def = contract[shape] as Shape;
  const out: Record<string, unknown> = {};
  for (const key of def.required) {
    if (!(key in values)) {
      throw new Error(
        `test fixture for "${String(shape)}" is missing a value for contract key "${key}" — ` +
          `update the fixture to match watch_contract.json`
      );
    }
    out[key] = values[key];
  }
  // Optional keys (e.g. event.args) ride along only when the test supplies them.
  for (const key of def.optional ?? []) {
    if (key in values) out[key] = values[key];
  }
  return out;
}

describe('watch wire contract (#286)', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  it('the contract artifact is well-formed', () => {
    const shapes: (keyof Contract)[] = [
      'watch_start_request',
      'watch_start_response',
      'unresolved_signal',
      'watch_collect_response',
      'field_sample',
      'event',
    ];
    for (const shape of shapes) {
      const s = contract[shape] as Shape;
      expect(Array.isArray(s.required), shape).toBe(true);
      expect(s.required.length, shape).toBeGreaterThan(0);
      expect(Array.isArray(s.optional), shape).toBe(true);
    }
    // The editor->game positional order must name the same keys as the request.
    expect([...contract.watch_start_request_positional].sort()).toEqual(
      [...contract.watch_start_request.required].sort()
    );
  });

  // ── Request: what the server SENDS ─────────────────────────────────────────

  it('watch_start sends exactly the watch_start_request keys', async () => {
    mock.mockResponse(
      objFromContract('watch_start_response', {
        started: true,
        resolved_fields: 0,
        connected_signals: 0,
        unresolved_signals: [],
      })
    );
    const ctx = createToolContext(mock);

    await runtimeState.execute(
      { action: 'watch_start', specs: [], hz: 20, duration_ms: 1000, signals: [] },
      ctx
    );

    const call = mock.calls.find((c) => c.command === 'watch_start');
    expect(call, 'watch_start command was sent').toBeDefined();
    expect(Object.keys(call!.params).sort()).toEqual([...contract.watch_start_request.required].sort());
  });

  // ── watch_start response: what the server READS ────────────────────────────

  it('watch_start reads the watch_start_response / unresolved_signal keys', async () => {
    const startResp = objFromContract('watch_start_response', {
      started: true,
      resolved_fields: 2,
      connected_signals: 1,
      unresolved_signals: [
        objFromContract('unresolved_signal', {
          path: '/root/Missing',
          signal: 'fired',
          reason: 'node_not_found',
        }),
      ],
    });
    mock.mockResponse(startResp);
    const ctx = createToolContext(mock);

    const data = structuredOf(
      await runtimeState.execute(
        { action: 'watch_start', signals: [{ path: '/root/Missing', signal: 'fired' }] },
        ctx
      )
    );

    // Each assertion proves the TS decode read a specific contract key.
    expect(data.resolved_fields).toBe(2); // resolved_fields
    expect(data.connected_signals).toBe(1); // connected_signals
    expect(data.unresolved_signals).toHaveLength(1); // unresolved_signals
    expect(data.unresolved_signals[0]).toMatchObject({
      path: '/root/Missing', // unresolved_signal.path
      signal: 'fired', // unresolved_signal.signal
      reason: 'node_not_found', // unresolved_signal.reason
    });
  });

  // ── watch_collect response: what the server READS ──────────────────────────

  it('watch_collect decodes exactly the watch_collect_response / event / field_sample keys', async () => {
    const raw = objFromContract('watch_collect_response', {
      window_ms: 1000,
      sample_count: 2,
      fields: {
        '/root/Player:hp': [
          objFromContract('field_sample', { t_ms: 0, value: 100 }),
          objFromContract('field_sample', { t_ms: 500, value: 80 }),
        ],
      },
      events: [objFromContract('event', { t_ms: 120, source: '/root/G', signal: 'hit', args: '[2]' })],
      events_truncated: true,
      events_dropped: 7,
      events_dropped_by_signal: { '/root/G:hit': 7 },
      fields_truncated: { '/root/Player:hp': true },
    });
    mock.mockResponse(raw);
    const ctx = createToolContext(mock);

    const data = structuredOf(await runtimeState.execute({ action: 'watch_collect' }, ctx));

    // Top-level collect keys (each assertion = the TS decode read that key):
    expect(data.window_ms).toBe(1000); // window_ms
    expect(data.sample_count).toBe(2); // sample_count
    expect(data.events_dropped).toBe(7); // events_dropped
    expect(data.events_dropped_by_signal).toEqual({ '/root/G:hit': 7 }); // events_dropped_by_signal
    expect(data.timeline_truncated).toBe(true); // events_truncated -> timeline_truncated

    // events + event-dict keys: the signal landed in the timeline with its args.
    const signalEntry = data.timeline.find((e: { kind: string }) => e.kind === 'signal');
    expect(signalEntry).toMatchObject({
      t_ms: 120, // event.t_ms
      source: '/root/G', // event.source
      name: 'hit', // event.signal (renamed to `name` in the timeline entry)
      args: '[2]', // event.args (optional)
    });

    // fields + field_sample keys: the field summary reflects the sampled values,
    // and fields_truncated surfaced as samples_truncated.
    const hp = data.fields['/root/Player:hp'];
    expect(hp).toBeDefined(); // fields
    expect(hp.start).toBe(100); // field_sample.t_ms/value drove the summary
    expect(hp.end).toBe(80);
    expect(hp.samples_truncated).toBe(true); // fields_truncated
  });
});
