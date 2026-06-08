import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { gameTime } from '../../tools/game-time.js';

describe('game_time tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('step requires exactly one of duration_ms or frames', () => {
      expect(gameTime.schema.safeParse({ action: 'step' }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step', duration_ms: 500, frames: 10 }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step', duration_ms: 500 }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'step', frames: 1 }).success).toBe(true);
    });

    it('step enforces the bridge-side caps', () => {
      expect(gameTime.schema.safeParse({ action: 'step', duration_ms: 20000 }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'step', duration_ms: 20001 }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step', frames: 1200 }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'step', frames: 1201 }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step', duration_ms: 0 }).success).toBe(false);
    });

    it('step accepts an input timeline', () => {
      expect(gameTime.schema.safeParse({
        action: 'step',
        duration_ms: 500,
        inputs: [{ action_name: 'fire', start_ms: 100, duration_ms: 200 }],
      }).success).toBe(true);
    });

    it('step_until requires a non-empty until expression', () => {
      expect(gameTime.schema.safeParse({ action: 'step_until' }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: '' }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'G.wave > 1' }).success).toBe(true);
    });

    it('step_until caps max_ms and accepts report expressions and an input timeline', () => {
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'true', max_ms: 20000 }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'true', max_ms: 20001 }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'true', max_ms: 0 }).success).toBe(false);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'true', report: ['G.wave', 'G.score'] }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'step_until', until: 'true', report: [''] }).success).toBe(false);
      expect(gameTime.schema.safeParse({
        action: 'step_until',
        until: 'true',
        inputs: [{ action_name: 'move_up', start_ms: 0, duration_ms: 500 }],
      }).success).toBe(true);
    });

    it('freeze, thaw, and status take no extra arguments', () => {
      expect(gameTime.schema.safeParse({ action: 'freeze' }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'thaw' }).success).toBe(true);
      expect(gameTime.schema.safeParse({ action: 'status' }).success).toBe(true);
    });
  });

  describe('freeze', () => {
    it('reports a fresh freeze', async () => {
      mock.mockResponse({ frozen: true, was_frozen: false, game_paused: false });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'freeze' }, ctx);
      expect(result).toContain('Frozen');
      expect(result).not.toContain('already frozen');
      expect(mock.calls[0].command).toBe('game_time_freeze');
    });

    it('notes idempotent re-freeze and an open pause menu', async () => {
      mock.mockResponse({ frozen: true, was_frozen: true, game_paused: true });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'freeze' }, ctx);
      expect(result).toContain('already frozen');
      expect(result).toContain('pause menu is open');
    });
  });

  describe('step', () => {
    it('forwards window parameters and inputs, returns structured result', async () => {
      mock.mockResponse({
        completed: true,
        frozen: true,
        elapsed_ms: 517,
        gameplay_ms: 517,
        frames: 31,
        physics_ticks: 31,
        game_paused: false,
        events_fired: 2,
      });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({
        action: 'step',
        duration_ms: 500,
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(mock.calls[0].command).toBe('game_time_step');
      expect(mock.calls[0].params.duration_ms).toBe(500);
      expect(mock.calls[0].params.inputs).toHaveLength(1);
      const data = structuredOf(result);
      expect(data.elapsed_ms).toBe(517);
      expect(data.events_fired).toBe(2);
    });

    it('surfaces pause transitions from the game layer', async () => {
      mock.mockResponse({
        completed: true,
        frozen: true,
        elapsed_ms: 500,
        gameplay_ms: 120,
        frames: 30,
        physics_ticks: 7,
        game_paused: true,
        pause_transitions: [{ at_ms: 120, paused: true }],
      });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'step', duration_ms: 500 }, ctx);
      const data = structuredOf(result);
      expect(data.pause_transitions).toHaveLength(1);
      expect(data.game_paused).toBe(true);
      expect(data.gameplay_ms).toBe(120);
    });
  });

  describe('step_until', () => {
    it('forwards the predicate and report, and surfaces a met result with its readings', async () => {
      mock.mockResponse({
        completed: true,
        frozen: true,
        elapsed_ms: 4317,
        gameplay_ms: 4317,
        frames: 259,
        physics_ticks: 259,
        game_paused: false,
        predicate_met: true,
        report: { 'G.wave': 1 },
      });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({
        action: 'step_until',
        until: 'tree.get_nodes_in_group("enemies").size() >= 1',
        max_ms: 8000,
        report: ['G.wave'],
      }, ctx);

      expect(mock.calls[0].command).toBe('game_time_step_until');
      expect(mock.calls[0].params.until).toBe('tree.get_nodes_in_group("enemies").size() >= 1');
      expect(mock.calls[0].params.max_ms).toBe(8000);
      expect(mock.calls[0].params.report).toEqual(['G.wave']);
      const data = structuredOf(result);
      expect(data.predicate_met).toBe(true);
      expect(data.report).toEqual({ 'G.wave': 1 });
      expect(data.elapsed_ms).toBe(4317);
    });

    it('reports predicate_met false when the cap is hit first', async () => {
      mock.mockResponse({
        completed: true,
        frozen: true,
        elapsed_ms: 8000,
        gameplay_ms: 8000,
        frames: 480,
        physics_ticks: 480,
        game_paused: false,
        predicate_met: false,
        report: { 'G.wave': 3 },
      });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'step_until', until: 'G.wave > 5', max_ms: 8000, report: ['G.wave'] }, ctx);
      const data = structuredOf(result);
      expect(data.predicate_met).toBe(false);
      expect(data.report).toEqual({ 'G.wave': 3 });
    });

    it('propagates a bridge-side predicate rejection', async () => {
      mock.mockError(new Error('predicate failed to evaluate: Invalid named index'));
      const ctx = createToolContext(mock);

      await expect(
        gameTime.execute({ action: 'step_until', until: 'Bogus.foo > 1' }, ctx),
      ).rejects.toThrow('predicate failed to evaluate');
    });
  });

  describe('thaw', () => {
    it('reports the frozen duration', async () => {
      mock.mockResponse({ frozen: false, was_frozen: true, game_paused: false, frozen_wall_ms: 42000 });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'thaw' }, ctx);
      expect(result).toContain('42000ms');
      expect(mock.calls[0].command).toBe('game_time_thaw');
    });

    it('is idempotent when not frozen', async () => {
      mock.mockResponse({ frozen: false, was_frozen: false, game_paused: false });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'thaw' }, ctx);
      expect(result).toContain('Was not frozen');
    });
  });

  describe('status', () => {
    it('returns the structured freeze state', async () => {
      mock.mockResponse({
        frozen: true,
        game_paused: false,
        tree_paused: true,
        engine_time_scale: 1.0,
        physics_ticks_per_second: 60,
        frozen_wall_ms: 12345,
        freeze_transitions: 0,
        launched_frozen: true,
      });
      const ctx = createToolContext(mock);

      const result = await gameTime.execute({ action: 'status' }, ctx);
      expect(mock.calls[0].command).toBe('game_time_status');
      const data = structuredOf(result);
      expect(data.frozen).toBe(true);
      expect(data.frozen_wall_ms).toBe(12345);
      expect(data.launched_frozen).toBe(true);
    });
  });
});
