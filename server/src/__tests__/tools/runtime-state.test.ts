import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockGodot,
  createToolContext,
  structuredOf,
  MockGodotConnection,
} from '../helpers/mock-godot.js';
import {
  runtimeState,
  summarizeNumericField,
  summarizeStringField,
  buildTimeline,
} from '../../tools/runtime-state.js';
import { toInputSchema } from '../../core/schema.js';

describe('runtimeState tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  // ── Schema validation ────────────────────────────────────────────────────

  describe('schema validation', () => {
    it('accepts digest with no params', () => {
      expect(runtimeState.schema.safeParse({ action: 'digest' }).success).toBe(true);
    });

    it('accepts digest with all params', () => {
      expect(
        runtimeState.schema.safeParse({
          action: 'digest',
          select: 'group',
          group: 'my_watch',
          paths: ['/root/GameState', '/root/SimulationClock'],
          name: 'Player*',
          type: 'CharacterBody2D',
          max_nodes: 10,
          include: ['transform', 'velocity'],
        }).success
      ).toBe(true);
    });

    it('rejects digest with invalid select value', () => {
      expect(runtimeState.schema.safeParse({ action: 'digest', select: 'invalid' }).success).toBe(false);
    });

    it('select describe documents the 3D-aware auto fallback (#230, regression guard)', () => {
      // The fallback tier now surfaces 3D world nodes, not just CanvasItems
      // (mcp_game_bridge.gd). The schema is the only contract an agent reads, so
      // this guards the describe from silently regressing to "CanvasItems"-only.
      const serialized = JSON.stringify(toInputSchema(runtimeState.schema));
      expect(serialized).toContain('3D');
      expect(serialized).toContain('physics bodies');
      // Schema shape is unchanged — select stays the same enum (note "fallback"
      // is the internal tier auto resolves to, NOT a user-facing select value).
      expect(runtimeState.schema.safeParse({ action: 'digest', select: 'auto' }).success).toBe(true);
      expect(runtimeState.schema.safeParse({ action: 'digest', select: 'fallback' }).success).toBe(false);
    });

    it('accepts select="none" with explicit paths', () => {
      expect(
        runtimeState.schema.safeParse({ action: 'digest', select: 'none', paths: ['/root/GameState'] }).success
      ).toBe(true);
    });

    it('rejects digest with max_nodes out of range', () => {
      expect(runtimeState.schema.safeParse({ action: 'digest', max_nodes: 0 }).success).toBe(false);
      expect(runtimeState.schema.safeParse({ action: 'digest', max_nodes: 201 }).success).toBe(false);
    });

    it('accepts watch_start with specs', () => {
      expect(
        runtimeState.schema.safeParse({
          action: 'watch_start',
          specs: [{ path: '/root/Level/Player', fields: ['pos.x', 'vel.y'] }],
        }).success
      ).toBe(true);
    });

    it('rejects watch_start with hz out of range', () => {
      expect(
        runtimeState.schema.safeParse({
          action: 'watch_start',
          specs: [],
          hz: 0,
        }).success
      ).toBe(false);
      expect(
        runtimeState.schema.safeParse({
          action: 'watch_start',
          specs: [],
          hz: 61,
        }).success
      ).toBe(false);
    });

    it('accepts watch_collect and watch_stop with no params', () => {
      expect(runtimeState.schema.safeParse({ action: 'watch_collect' }).success).toBe(true);
      expect(runtimeState.schema.safeParse({ action: 'watch_stop' }).success).toBe(true);
    });

    it('accepts a signals-only watch_start (no specs)', () => {
      expect(
        runtimeState.schema.safeParse({
          action: 'watch_start',
          signals: [{ path: '/root/G', signal: 'wave_started' }],
        }).success
      ).toBe(true);
    });

    it('accepts watch_start with both specs and signals', () => {
      expect(
        runtimeState.schema.safeParse({
          action: 'watch_start',
          specs: [{ path: '/root/Player', fields: ['pos.x'] }],
          signals: [{ path: '/root/Player', signal: 'died' }],
        }).success
      ).toBe(true);
    });

    it('rejects watch_start with neither specs nor signals (incl. empty arrays)', () => {
      expect(runtimeState.schema.safeParse({ action: 'watch_start' }).success).toBe(false);
      expect(
        runtimeState.schema.safeParse({ action: 'watch_start', specs: [], signals: [] }).success
      ).toBe(false);
    });

    it('rejects more than 16 signals', () => {
      const signals = Array.from({ length: 17 }, (_, i) => ({ path: `/root/E${i}`, signal: 'fired' }));
      expect(runtimeState.schema.safeParse({ action: 'watch_start', signals }).success).toBe(false);
    });

    it('rejects a signal entry missing the signal name', () => {
      expect(
        runtimeState.schema.safeParse({ action: 'watch_start', signals: [{ path: '/root/G' }] }).success
      ).toBe(false);
    });

    it('rejects blank signal paths and names (blank entries would skew the drop detection)', () => {
      expect(
        runtimeState.schema.safeParse({ action: 'watch_start', signals: [{ path: '', signal: 'died' }] }).success
      ).toBe(false);
      expect(
        runtimeState.schema.safeParse({ action: 'watch_start', signals: [{ path: '/root/G', signal: '' }] }).success
      ).toBe(false);
    });
  });

  // ── digest ───────────────────────────────────────────────────────────────

  describe('digest', () => {
    it('calls get_runtime_state and returns structured result', async () => {
      const response = {
        scene: 'res://levels/level1.tscn',
        selection: 'group',
        entity_count: 1,
        entities: [
          {
            path: '/root/Level1/Player',
            type: 'CharacterBody2D',
            groups: ['player'],
            pos: { x: 100.5, y: 200.0 },
            vel: { x: 150.0, y: 0.0 },
          },
        ],
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'digest' }, ctx);

      expect(structuredOf(result)).toEqual(response);
      expect(mock.calls[0].command).toBe('get_runtime_state');
    });

    it('passes select, group, name, type, max_nodes, include params', async () => {
      mock.mockResponse({ scene: '', selection: 'group', entity_count: 0, entities: [] });
      const ctx = createToolContext(mock);

      await runtimeState.execute(
        {
          action: 'digest',
          select: 'group',
          group: 'my_watch',
          paths: ['/root/GameState'],
          name: 'Player',
          type: 'CharacterBody2D',
          max_nodes: 10,
          include: ['transform', 'velocity'],
        },
        ctx
      );

      const params = mock.calls[0].params;
      expect(params.select).toBe('group');
      expect(params.group).toBe('my_watch');
      expect(params.paths).toEqual(['/root/GameState']);
      expect(params.name).toBe('Player');
      expect(params.type).toBe('CharacterBody2D');
      expect(params.max_nodes).toBe(10);
      expect(params.include).toEqual(['transform', 'velocity']);
    });

    it('passes through state snapshot, available_autoloads, and unresolved_paths', async () => {
      const response = {
        scene: 'res://scenes/main.tscn',
        selection: 'none',
        entity_count: 1,
        entities: [
          { path: '/root/GameState', type: 'Node', state: { cash: 25000, tick_count: 8 } },
        ],
        available_autoloads: ['/root/GameState', '/root/SimulationClock'],
        unresolved_paths: ['/root/Nope'],
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        { action: 'digest', select: 'none', paths: ['/root/GameState', '/root/Nope'] },
        ctx
      );
      const data = structuredOf(result);

      expect(data.entities[0].state).toEqual({ cash: 25000, tick_count: 8 });
      expect(data.available_autoloads).toEqual(['/root/GameState', '/root/SimulationClock']);
      expect(data.unresolved_paths).toEqual(['/root/Nope']);
    });

    it('includes hint field in fallback selection result', async () => {
      const response = {
        scene: 'res://main.tscn',
        selection: 'fallback',
        entity_count: 2,
        entities: [{ path: '/root/Main/Sprite2D', type: 'Sprite2D' }],
        hint: 'No nodes found in group mcp_watch...',
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'digest' }, ctx);
      expect(structuredOf(result).hint).toBeDefined();
    });
  });

  // ── watch_start ──────────────────────────────────────────────────────────

  describe('watch_start', () => {
    it('calls watch_start with specs, hz, duration_ms and returns a structured confirmation', async () => {
      mock.mockResponse({ started: true, resolved_fields: 2 });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        {
          action: 'watch_start',
          specs: [{ path: '/root/Level/Player', fields: ['pos.x', 'vel.x'] }],
          hz: 30,
          duration_ms: 500,
        },
        ctx
      );

      const data = structuredOf(result);
      expect(data.started).toBe(true);
      expect(data.note).toContain('500');
      expect(data.resolved_fields).toBe(2);
      expect(data.warnings).toEqual([]);
      expect(mock.calls[0].command).toBe('watch_start');
      expect(mock.calls[0].params.hz).toBe(30);
      expect(mock.calls[0].params.duration_ms).toBe(500);
    });

    it('uses defaults for hz and duration_ms when omitted', async () => {
      mock.mockResponse({ started: true });
      const ctx = createToolContext(mock);

      await runtimeState.execute(
        { action: 'watch_start', specs: [{ path: '/root/Player', fields: ['pos.x'] }] },
        ctx
      );

      expect(mock.calls[0].params.hz).toBe(20);
      expect(mock.calls[0].params.duration_ms).toBe(1000);
    });

    it('passes signals through and defaults them to [] when omitted', async () => {
      mock.mockResponse({ started: true, resolved_fields: 1 });
      const ctx = createToolContext(mock);

      await runtimeState.execute(
        { action: 'watch_start', specs: [{ path: '/root/Player', fields: ['pos.x'] }] },
        ctx
      );
      expect(mock.calls[0].params.signals).toEqual([]);

      mock.mockResponse({ started: true, connected_signals: 1, unresolved_signals: [] });
      await runtimeState.execute(
        { action: 'watch_start', signals: [{ path: '/root/G', signal: 'wave_started' }] },
        ctx
      );
      expect(mock.calls[1].params.signals).toEqual([{ path: '/root/G', signal: 'wave_started' }]);
      expect(mock.calls[1].params.specs).toEqual([]);
    });

    it('reports the connected signal count structurally', async () => {
      mock.mockResponse({ started: true, resolved_fields: 0, connected_signals: 2, unresolved_signals: [] });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        {
          action: 'watch_start',
          signals: [
            { path: '/root/G', signal: 'wave_started' },
            { path: '/root/Player', signal: 'died' },
          ],
        },
        ctx
      );
      const data = structuredOf(result);
      expect(data.connected_signals).toBe(2);
      expect(data.unresolved_signals).toEqual([]);
      expect(data.warnings).toEqual([]);
    });

    it('passes unresolved signals through structurally and names them in warnings', async () => {
      mock.mockResponse({
        started: true,
        resolved_fields: 0,
        connected_signals: 0,
        unresolved_signals: [{ path: '/root/Bogus', signal: 'died', reason: 'node_not_found' }],
      });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        { action: 'watch_start', signals: [{ path: '/root/Bogus', signal: 'died' }] },
        ctx
      );
      const data = structuredOf(result);
      expect(data.unresolved_signals).toEqual([{ path: '/root/Bogus', signal: 'died', reason: 'node_not_found' }]);
      expect(data.warnings.some((w: string) => w.includes('/root/Bogus:died (node_not_found)'))).toBe(true);
    });

    it('does not warn about 0 fields on a signals-only watch', async () => {
      mock.mockResponse({ started: true, resolved_fields: 0, connected_signals: 1, unresolved_signals: [] });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        { action: 'watch_start', signals: [{ path: '/root/G', signal: 'wave_started' }] },
        ctx
      );
      expect(structuredOf(result).warnings).toEqual([]);
    });

    it('still warns when specs were requested but none resolved', async () => {
      mock.mockResponse({ started: true, resolved_fields: 0 });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        { action: 'watch_start', specs: [{ path: '/root/Nope', fields: ['pos.x'] }] },
        ctx
      );
      expect(structuredOf(result).warnings.some((w: string) => w.includes('0 fields resolved'))).toBe(true);
    });

    it('detects an addon that predates the timeline (signals silently ignored)', async () => {
      // Old game bridge: response has no connected_signals key at all.
      mock.mockResponse({ started: true, resolved_fields: 1 });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        {
          action: 'watch_start',
          specs: [{ path: '/root/Player', fields: ['pos.x'] }],
          signals: [{ path: '/root/G', signal: 'wave_started' }],
        },
        ctx
      );
      const data = structuredOf(result);
      expect(data.warnings.some((w: string) => w.includes('update the godot-mcp addon'))).toBe(true);
    });

    it('detects a stale editor relay dropping signal specs in transit', async () => {
      // New bridge (keys present) but fewer accounted-for signals than requested:
      // the editor-loaded relay predates the 4th wire element.
      mock.mockResponse({ started: true, resolved_fields: 0, connected_signals: 0, unresolved_signals: [] });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        {
          action: 'watch_start',
          signals: [
            { path: '/root/G', signal: 'wave_started' },
            { path: '/root/G', signal: 'score_changed' },
          ],
        },
        ctx
      );
      const data = structuredOf(result);
      expect(data.warnings.some((w: string) => w.includes('restart the Godot editor'))).toBe(true);
    });

    it('raises no skew warning when every requested signal is accounted for', async () => {
      mock.mockResponse({
        started: true,
        resolved_fields: 0,
        connected_signals: 1,
        unresolved_signals: [{ path: '/root/Bogus', signal: 'nope', reason: 'node_not_found' }],
      });
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute(
        {
          action: 'watch_start',
          signals: [
            { path: '/root/G', signal: 'wave_started' },
            { path: '/root/Bogus', signal: 'nope' },
          ],
        },
        ctx
      );
      const data = structuredOf(result);
      expect(data.warnings.some((w: string) => w.includes('restart') || w.includes('update'))).toBe(false);
    });
  });

  // ── watch_collect ────────────────────────────────────────────────────────

  describe('watch_collect', () => {
    it('summarizes numeric fields from raw samples', async () => {
      const raw = {
        window_ms: 1000,
        sample_count: 5,
        fields: {
          '/root/Player:pos.x': [
            { t_ms: 0, value: 100 },
            { t_ms: 250, value: 150 },
            { t_ms: 500, value: 200 },
            { t_ms: 750, value: 200 },
            { t_ms: 1000, value: 250 },
          ],
        },
      };
      mock.mockResponse(raw);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'watch_collect' }, ctx);
      const data = structuredOf(result);

      expect(data.window_ms).toBe(1000);
      expect(data.sample_count).toBe(5);
      const summary = data.fields['/root/Player:pos.x'];
      expect(summary.start).toBe(100);
      expect(summary.end).toBe(250);
      expect(summary.min).toBe(100);
      expect(summary.max).toBe(250);
      expect(summary.slope).toBe(150); // (250-100) / 1.0s
    });

    it('summarizes string fields and detects transitions', async () => {
      const raw = {
        window_ms: 500,
        sample_count: 3,
        fields: {
          '/root/Player:anim': [
            { t_ms: 0, value: 'idle' },
            { t_ms: 200, value: 'idle' },
            { t_ms: 350, value: 'run' },
          ],
        },
      };
      mock.mockResponse(raw);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'watch_collect' }, ctx);
      const summary = structuredOf(result).fields['/root/Player:anim'];

      expect(summary.start).toBe('idle');
      expect(summary.end).toBe('run');
      expect(summary.changes).toHaveLength(1);
      expect(summary.changes[0]).toEqual({ t_ms: 350, from: 'idle', to: 'run' });
    });

    it('merges signal events and string transitions into a time-sorted timeline', async () => {
      const raw = {
        window_ms: 1000,
        sample_count: 4,
        fields: {
          '/root/Player:anim': [
            { t_ms: 0, value: 'idle' },
            { t_ms: 400, value: 'run' },
          ],
          '/root/Player:state': [
            { t_ms: 0, value: 'alive' },
            { t_ms: 900, value: 'dead' },
          ],
          // Numeric events (zero_cross here) must stay per-field only.
          '/root/Player:vel.x': [
            { t_ms: 0, value: 0 },
            { t_ms: 600, value: 5 },
          ],
        },
        events: [
          { t_ms: 120, source: '/root/G', signal: 'wave_started', args: '[2]' },
          { t_ms: 880, source: '/root/Player', signal: 'died' },
        ],
        events_truncated: false,
      };
      mock.mockResponse(raw);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'watch_collect' }, ctx);
      const data = structuredOf(result);

      expect(data.timeline.map((e: { kind: string; t_ms: number }) => [e.t_ms, e.kind])).toEqual([
        [120, 'signal'],
        [400, 'anim_transition'],
        [880, 'signal'],
        [900, 'field_change'],
      ]);
      expect(data.timeline[0].args).toBe('[2]');
      expect(data.timeline[1]).toEqual({
        t_ms: 400, kind: 'anim_transition', source: '/root/Player', from: 'idle', to: 'run',
      });
      expect(data.timeline[3].field).toBe('state');
      expect(data.timeline_truncated).toBe(false);
      // numeric zero_cross stayed per-field
      expect(data.fields['/root/Player:vel.x'].events).toHaveLength(1);
    });

    it('keeps a stable shape against pre-timeline addons (no events key)', async () => {
      mock.mockResponse({ window_ms: 500, sample_count: 0, fields: {} });
      const ctx = createToolContext(mock);

      const data = structuredOf(await runtimeState.execute({ action: 'watch_collect' }, ctx));
      expect(data.timeline).toEqual([]);
      expect(data.timeline_truncated).toBe(false);
    });

    it('surfaces event truncation as timeline_truncated', async () => {
      mock.mockResponse({
        window_ms: 500,
        sample_count: 0,
        fields: {},
        events: [{ t_ms: 1, source: '/root/A', signal: 'spam' }],
        events_truncated: true,
      });
      const ctx = createToolContext(mock);

      const data = structuredOf(await runtimeState.execute({ action: 'watch_collect' }, ctx));
      expect(data.timeline_truncated).toBe(true);
    });
  });

  // ── watch_stop ───────────────────────────────────────────────────────────

  describe('watch_stop', () => {
    it('calls watch_stop and returns summarized result', async () => {
      const raw = {
        window_ms: 600,
        sample_count: 2,
        fields: {
          '/root/Player:vel.x': [
            { t_ms: 0, value: 0 },
            { t_ms: 600, value: 200 },
          ],
        },
      };
      mock.mockResponse(raw);
      const ctx = createToolContext(mock);

      const result = await runtimeState.execute({ action: 'watch_stop' }, ctx);

      expect(mock.calls[0].command).toBe('watch_stop');
      const summary = structuredOf(result).fields['/root/Player:vel.x'];
      expect(summary.start).toBe(0);
      expect(summary.end).toBe(200);
      expect(typeof summary.slope).toBe('number');
    });
  });
});

// ── buildTimeline unit tests ─────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns [] for no events and no fields', () => {
    expect(buildTimeline([], {})).toEqual([]);
  });

  it('omits args when the event carries none', () => {
    const [entry] = buildTimeline([{ t_ms: 5, source: '/root/A', signal: 'fired' }], {});
    expect(entry).toEqual({ t_ms: 5, kind: 'signal', source: '/root/A', name: 'fired' });
    expect('args' in entry).toBe(false);
  });

  it('splits field keys on the LAST colon (paths may contain colons)', () => {
    const fields = {
      '/root/Player:anim': { start: 'a', end: 'b', changes: [{ t_ms: 10, from: 'a', to: 'b' }] },
    };
    const [entry] = buildTimeline([], fields);
    expect(entry).toEqual({ t_ms: 10, kind: 'anim_transition', source: '/root/Player', from: 'a', to: 'b' });
  });

  it('orders t_ms ties deterministically: signal < anim_transition < field_change', () => {
    const fields = {
      '/root/P:state': { start: 'x', end: 'y', changes: [{ t_ms: 100, from: 'x', to: 'y' }] },
      '/root/P:anim': { start: 'a', end: 'b', changes: [{ t_ms: 100, from: 'a', to: 'b' }] },
    };
    const events = [{ t_ms: 100, source: '/root/P', signal: 'tick' }];
    expect(buildTimeline(events, fields).map((e) => e.kind)).toEqual([
      'signal',
      'anim_transition',
      'field_change',
    ]);
  });

  it('preserves emission order for same-millisecond signal bursts (stable sort)', () => {
    const events = [
      { t_ms: 100, source: '/root/G', signal: 'score_changed', args: '[111]' },
      { t_ms: 100, source: '/root/G', signal: 'wave_changed', args: '[2]' },
      { t_ms: 100, source: '/root/G', signal: 'score_changed', args: '[222]' },
    ];
    // An alphabetical tiebreak would reorder to score, score, wave and destroy
    // the real emission order — buffer order must survive the sort.
    expect(buildTimeline(events, {}).map((e) => (e.kind === 'signal' ? e.args : ''))).toEqual([
      '[111]',
      '[2]',
      '[222]',
    ]);
  });

  it('ignores numeric field summaries entirely', () => {
    const fields = {
      '/root/P:vel.x': {
        start: 0, end: 5, min: 0, max: 5, mean: 2.5, slope: 5,
        events: [{ t_ms: 50, from: 0, to: 5, kind: 'zero_cross' as const }],
      },
    };
    expect(buildTimeline([], fields)).toEqual([]);
  });
});

// ── summarizeNumericField unit tests ─────────────────────────────────────────

describe('summarizeNumericField', () => {
  it('returns zeros for empty input', () => {
    const r = summarizeNumericField([], 1000);
    expect(r).toEqual({ start: 0, end: 0, min: 0, max: 0, mean: 0, slope: 0, events: [] });
  });

  it('handles single sample', () => {
    const r = summarizeNumericField([{ t_ms: 0, value: 42 }], 1000);
    expect(r.start).toBe(42);
    expect(r.end).toBe(42);
    expect(r.slope).toBe(0);
  });

  it('computes slope correctly', () => {
    const samples = [
      { t_ms: 0, value: 0 },
      { t_ms: 1000, value: 100 },
    ];
    const r = summarizeNumericField(samples, 1000);
    expect(r.slope).toBe(100); // 100 units/sec
  });

  it('detects sign change events', () => {
    const samples = [
      { t_ms: 0, value: 10 },
      { t_ms: 500, value: -10 },
    ];
    const r = summarizeNumericField(samples, 1000);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].kind).toBe('sign_change');
    expect(r.events[0].t_ms).toBe(500);
  });

  it('detects zero-crossing events', () => {
    const samples = [
      { t_ms: 0, value: 0 },
      { t_ms: 100, value: 5 },
    ];
    const r = summarizeNumericField(samples, 1000);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].kind).toBe('zero_cross');
  });

  it('computes correct min/max/mean for constant value', () => {
    const samples = [
      { t_ms: 0, value: 7 },
      { t_ms: 500, value: 7 },
      { t_ms: 1000, value: 7 },
    ];
    const r = summarizeNumericField(samples, 1000);
    expect(r.min).toBe(7);
    expect(r.max).toBe(7);
    expect(r.mean).toBe(7);
    expect(r.slope).toBe(0);
  });
});

// ── summarizeStringField unit tests ──────────────────────────────────────────

describe('summarizeStringField', () => {
  it('returns empty result for empty input', () => {
    const r = summarizeStringField([]);
    expect(r).toEqual({ start: '', end: '', changes: [] });
  });

  it('returns no changes for constant value', () => {
    const samples = [
      { t_ms: 0, value: 'idle' },
      { t_ms: 500, value: 'idle' },
    ];
    const r = summarizeStringField(samples);
    expect(r.start).toBe('idle');
    expect(r.end).toBe('idle');
    expect(r.changes).toHaveLength(0);
  });

  it('detects a single transition', () => {
    const samples = [
      { t_ms: 0, value: 'idle' },
      { t_ms: 350, value: 'run' },
    ];
    const r = summarizeStringField(samples);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toEqual({ t_ms: 350, from: 'idle', to: 'run' });
  });

  it('detects multiple transitions in sequence', () => {
    const samples = [
      { t_ms: 0, value: 'idle' },
      { t_ms: 200, value: 'run' },
      { t_ms: 400, value: 'jump' },
      { t_ms: 600, value: 'fall' },
    ];
    const r = summarizeStringField(samples);
    expect(r.start).toBe('idle');
    expect(r.end).toBe('fall');
    expect(r.changes).toHaveLength(3);
  });
});
