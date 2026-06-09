import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { input } from '../../tools/input.js';

describe('input tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('sequence requires non-empty inputs array', () => {
      expect(input.schema.safeParse({ action: 'sequence' }).success).toBe(false);
      expect(input.schema.safeParse({ action: 'sequence', inputs: [] }).success).toBe(false);
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'jump' }],
      }).success).toBe(true);
    });

    it('type_text requires non-empty text', () => {
      expect(input.schema.safeParse({ action: 'type_text' }).success).toBe(false);
      expect(input.schema.safeParse({ action: 'type_text', text: '' }).success).toBe(false);
      expect(input.schema.safeParse({ action: 'type_text', text: 'Hello' }).success).toBe(true);
    });

    it('rejects negative timing values', () => {
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'jump', start_ms: -1 }],
      }).success).toBe(false);
      expect(input.schema.safeParse({
        action: 'type_text',
        text: 'Hello',
        delay_ms: -1,
      }).success).toBe(false);
    });

    it('accepts an optional report array of expression strings', () => {
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'fire' }],
        report: ['G.shots', 'G.wave'],
      }).success).toBe(true);
      // report must be strings, not arbitrary values
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'fire' }],
        report: [1, 2],
      }).success).toBe(false);
    });
  });

  describe('get_map', () => {
    it('returns formatted action list', async () => {
      mock.mockResponse({
        actions: [
          { name: 'jump', events: ['Space', 'Joypad Button 0'] },
          { name: 'move_left', events: ['A', 'Left'] },
        ],
        source: 'game',
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({ action: 'get_map' }, ctx);
      expect(result).toContain('jump: Space, Joypad Button 0');
      expect(result).toContain('move_left: A, Left');
      expect(result).toContain('source: game');
    });

    it('returns message when no actions defined', async () => {
      mock.mockResponse({ actions: [], source: 'editor' });
      const ctx = createToolContext(mock);

      const result = await input.execute({ action: 'get_map' }, ctx);
      expect(result).toContain('No custom input actions defined');
    });
  });

  describe('sequence', () => {
    it('executes single tap and returns confirmation', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1 });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'jump', start_ms: 0, duration_ms: 0 }],
      }, ctx);

      expect(result).toContain('1 action(s) executed');
      expect(result).toContain('jump');
      expect(mock.calls[0].params.inputs).toHaveLength(1);
    });

    it('executes complex choreography with timing', async () => {
      mock.mockResponse({ completed: true, actions_executed: 2 });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [
          { action_name: 'move_forward', start_ms: 0, duration_ms: 1000 },
          { action_name: 'jump', start_ms: 500, duration_ms: 250 },
        ],
      }, ctx);

      expect(result).toContain('2 action(s) executed');
      expect(result).toContain('move_forward, jump');
      expect(result).toContain('1000ms');
    });

    it('throws on error response', async () => {
      mock.mockResponse({ completed: false, actions_executed: 0, error: 'Unknown action: invalid' });
      const ctx = createToolContext(mock);

      await expect(input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'invalid', start_ms: 0, duration_ms: 0 }],
      }, ctx)).rejects.toThrow('Unknown action: invalid');
    });

    it('passes report expressions through and surfaces before -> after deltas', async () => {
      mock.mockResponse({
        completed: true,
        actions_executed: 1,
        scene: 'res://arena.tscn',
        tree_paused: false,
        frozen: false,
        gameplay_ms: 210,
        wall_ms: 212,
        report: {
          'G.shots': { before: 42, after: 47, changed: true },
          'G.wave': { before: 2, after: 2, changed: false },
        },
        any_changed: true,
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 100 }],
        report: ['G.shots', 'G.wave'],
      }, ctx);

      expect(mock.calls[0].params.report).toEqual(['G.shots', 'G.wave']);
      expect(result).toContain('G.shots: 42 -> 47  (changed)');
      expect(result).toContain('G.wave: 2 -> 2  (no change)');
      expect(result).toContain('scene res://arena.tscn');
      expect(result).not.toContain('may have had no effect');
    });

    it('flags a probable no-op when nothing the probe watched changed', async () => {
      // The headline #240 case: a long sequence that ran while the player was dead.
      mock.mockResponse({
        completed: true,
        actions_executed: 12,
        scene: 'res://arena.tscn',
        tree_paused: false,
        frozen: false,
        gameplay_ms: 12700,
        wall_ms: 12710,
        report: { 'G.shots': { before: 99, after: 99, changed: false } },
        any_changed: false,
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 12000 }],
        report: ['G.shots'],
      }, ctx);

      expect(result).toContain('G.shots: 99 -> 99  (no change)');
      expect(result).toContain('may have had no effect');
    });

    it('warns when the tree was paused for the sequence (no gameplay advanced)', async () => {
      mock.mockResponse({
        completed: true,
        actions_executed: 2,
        scene: 'res://arena.tscn',
        tree_paused: true,
        frozen: false,
        gameplay_ms: 0,
        wall_ms: 2000,
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'move_left', start_ms: 0, duration_ms: 1000 }],
      }, ctx);

      expect(result).toContain('PAUSED');
      expect(result).toContain('gameplay 0ms / wall 2000ms');
    });
  });

  describe('type_text', () => {
    it('types text and returns character count', async () => {
      mock.mockResponse({ completed: true, chars_typed: 5, submitted: false });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'type_text',
        text: 'Hello',
        delay_ms: 50,
        submit: false,
      }, ctx);

      expect(result).toContain('5 character(s)');
      expect(result).not.toContain('submitted');
      expect(mock.calls[0].params.text).toBe('Hello');
    });

    it('types text with submit sends Enter and indicates submission', async () => {
      mock.mockResponse({ completed: true, chars_typed: 5, submitted: true });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'type_text',
        text: 'Hello',
        delay_ms: 50,
        submit: true,
      }, ctx);

      expect(result).toContain('5 character(s)');
      expect(result).toContain('submitted');
      expect(mock.calls[0].params.submit).toBe(true);
    });

    it('throws on error response', async () => {
      mock.mockResponse({ completed: false, chars_typed: 0, submitted: false, error: 'No focused element' });
      const ctx = createToolContext(mock);

      await expect(input.execute({
        action: 'type_text',
        text: 'Test',
        delay_ms: 50,
        submit: false,
      }, ctx)).rejects.toThrow('No focused element');
    });
  });
});
