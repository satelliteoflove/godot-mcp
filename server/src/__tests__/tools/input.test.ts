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

    it('rejects negative timing values', () => {
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'jump', start_ms: -1 }],
      }).success).toBe(false);
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'jump', duration_ms: -1 }],
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
  });
});
