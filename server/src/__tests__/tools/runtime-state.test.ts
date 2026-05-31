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
} from '../../tools/runtime-state.js';

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
    it('calls watch_start with specs, hz, duration_ms and returns confirmation', async () => {
      mock.mockResponse({ started: true });
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

      expect(typeof result).toBe('string');
      expect(result).toContain('500');
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
