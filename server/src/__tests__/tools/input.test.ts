import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { input } from '../../tools/input.js';
import { toInputSchema } from '../../core/schema.js';
import { deriveTimeouts, INPUT_BUDGET_CAP_MS } from '../../connection/timeouts.js';

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

    it('accepts screenshot_at_ms offsets (max 8, non-negative ints)', () => {
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'fire' }],
        screenshot_at_ms: [0, 100, 300],
        screenshot_max_width: 480,
      }).success).toBe(true);
      // more than 8 offsets is rejected
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'fire' }],
        screenshot_at_ms: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      }).success).toBe(false);
      // negative offsets are rejected
      expect(input.schema.safeParse({
        action: 'sequence',
        inputs: [{ action_name: 'fire' }],
        screenshot_at_ms: [-1],
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

    it('appends a stale-project advisory when the editor-sourced map is flagged stale (#245)', async () => {
      mock.mockResponse({
        actions: [{ name: 'jump', events: ['Space'] }],
        source: 'editor',
        staleness: {
          stale: true,
          summary: 'project.godot was edited on disk: 1 input action(s) added on disk (dash). Run `godot_editor_edit restart` to reload.',
          input: { added: ['dash'] },
        },
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({ action: 'get_map' }, ctx);
      expect(result).toContain('jump: Space');
      expect(result).toContain('STALE PROJECT SETTINGS:');
      expect(result).toContain('godot_editor_edit restart');
    });

    it('appends the advisory even when the stale editor map is empty', async () => {
      mock.mockResponse({
        actions: [],
        source: 'editor',
        staleness: { stale: true, summary: 'autoload G removed on disk.' },
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({ action: 'get_map' }, ctx);
      expect(result).toContain('No custom input actions defined');
      expect(result).toContain('STALE PROJECT SETTINGS:');
    });

    it('adds no advisory for a fresh game-sourced map', async () => {
      mock.mockResponse({ actions: [{ name: 'jump', events: ['Space'] }], source: 'game' });
      const ctx = createToolContext(mock);

      const result = await input.execute({ action: 'get_map' }, ctx);
      expect(result).not.toContain('STALE PROJECT SETTINGS:');
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

      expect(result).toContain('1 input(s) executed');
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

      expect(result).toContain('2 input(s) executed');
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

    it('returns a multi-content result (summary + image blocks) when frames are captured', async () => {
      mock.mockResponse({
        completed: true,
        actions_executed: 1,
        scene: 'res://arena.tscn',
        gameplay_ms: 320,
        wall_ms: 322,
        captures: [
          { requested_ms: 50, actual_ms: 52, ok: true, image_base64: 'AAAA', width: 640, height: 360, error: '' },
          { requested_ms: 200, actual_ms: 205, ok: true, image_base64: 'BBBB', width: 640, height: 360, error: '' },
        ],
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 300 }],
        screenshot_at_ms: [50, 200],
      }, ctx);

      expect(mock.calls[0].params.screenshot_at_ms).toEqual([50, 200]);
      expect(Array.isArray(result)).toBe(true);
      const blocks = result as Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      // [summary, label, image, label, image]
      expect(blocks).toHaveLength(5);
      expect(blocks[0].type).toBe('text');
      expect(blocks[0].text).toContain('Captured 2/2 frame(s)');
      expect(blocks[2]).toEqual({ type: 'image', data: 'AAAA', mimeType: 'image/png' });
      expect(blocks[4]).toEqual({ type: 'image', data: 'BBBB', mimeType: 'image/png' });
      expect(blocks[1].text).toContain('@52ms (requested 50ms)');
    });

    it('renders a failed capture as a note, not an image block', async () => {
      mock.mockResponse({
        completed: true,
        actions_executed: 1,
        scene: 'res://arena.tscn',
        captures: [
          { requested_ms: 50, actual_ms: 51, ok: true, image_base64: 'AAAA', width: 640, height: 360, error: '' },
          { requested_ms: 200, actual_ms: 0, ok: false, image_base64: '', width: 0, height: 0, error: 'CAPTURE_FAILED: could not read viewport image' },
        ],
      });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 300 }],
        screenshot_at_ms: [50, 200],
      }, ctx);

      expect(Array.isArray(result)).toBe(true);
      const blocks = result as Array<{ type: string; text?: string }>;
      // [summary, label, image, failure-note] — only one image
      expect(blocks.filter((b) => b.type === 'image')).toHaveLength(1);
      const noteBlock = blocks.find((b) => b.type === 'text' && b.text?.includes('capture failed'));
      expect(noteBlock?.text).toContain('CAPTURE_FAILED');
      expect((blocks[0].text)).toContain('Captured 1/2 frame(s)');
    });

    it('derives a ready-wait-inclusive timeout and pushes the relay budget (#276)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1 });
      const ctx = createToolContext(mock);

      await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 300 }],
      }, ctx);

      const call = mock.calls[0];
      const t = deriveTimeouts(300, { readyWait: true }); // span 300 + folded ready-wait
      expect(call.params.relay_timeout_ms).toBe(t.relayMs);
      expect(call.opts?.timeoutMs).toBe(t.serverMs);
      // wall_budget_ms is a step-only concept; the sequence path never reads it.
      expect(call.params.wall_budget_ms).toBeUndefined();
    });

    it('factors a later capture offset into the timeout budget (#239 + #276)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1 });
      const ctx = createToolContext(mock);

      await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 100 }],
        screenshot_at_ms: [8000],
      }, ctx);

      // The 8000ms capture offset dominates the 100ms input span.
      expect(mock.calls[0].opts?.timeoutMs).toBe(deriveTimeouts(8000, { readyWait: true }).serverMs);
    });

    it('rejects a sequence whose span exceeds the single-call window, before touching the bridge', async () => {
      const ctx = createToolContext(mock);

      await expect(input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: INPUT_BUDGET_CAP_MS + 1 }],
      }, ctx)).rejects.toThrow(/single call can cover at most/);
      expect(mock.calls).toHaveLength(0);
    });
  });

  describe('joypad entries (#233)', () => {
    describe('schema', () => {
      it('accepts joy_button by name and by raw index', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ joy_button: 'a' }, { joy_button: 'dpad_up', device: 1 }, { joy_button: 5 }],
        }).success).toBe(true);
      });

      it('rejects an unknown axis name and out-of-range values', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ axis: 'left_z', value: 0.5 }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ axis: 'left_x', value: 1.5 }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ axis: 'left_x', value: -0.7 }],
        }).success).toBe(true);
      });

      it('rejects a negative value on a trigger axis (triggers range 0..1)', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ axis: 'trigger_right', value: -0.5 }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ axis: 'trigger_right', value: 0.5 }],
        }).success).toBe(true);
      });

      it('rejects action strength outside 0..1', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ action_name: 'fire', strength: 1.5 }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ action_name: 'fire', strength: 0.5 }],
        }).success).toBe(true);
      });

      it('rejects a mixed-keys entry (the strictObject discriminator pin)', () => {
        // A stripping schema would silently match the action branch and drop
        // the axis intent — exactly the bug strictObject exists to prevent.
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ action_name: 'fire', axis: 'left_x', value: 1 }],
        }).success).toBe(false);
      });

      it('accepts stick entries and mixed timelines', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [
            { stick: 'left', x: 0.5, y: 0, duration_ms: 500 },
            { joy_button: 'a', start_ms: 200 },
            { action_name: 'pause', start_ms: 900 },
          ],
        }).success).toBe(true);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ stick: 'middle', x: 0, y: 0 }],
        }).success).toBe(false);
      });
    });

    it('compiles a stick entry into a paired _x/_y axis hold on the wire', async () => {
      mock.mockResponse({ completed: true, actions_executed: 2, input_kinds: { action: 0, joy_button: 0, axis: 2 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ stick: 'right', x: 0.866, y: -0.5, device: 0, start_ms: 100, duration_ms: 1500 }],
      }, ctx);

      expect(mock.calls[0].params.inputs).toEqual([
        { axis: 'right_x', value: 0.866, device: 0, start_ms: 100, duration_ms: 1500 },
        { axis: 'right_y', value: -0.5, device: 0, start_ms: 100, duration_ms: 1500 },
      ]);
      expect(result).toContain('right_stick(0.866,-0.5)');
    });

    it('labels joypad entries in the summary line', async () => {
      mock.mockResponse({ completed: true, actions_executed: 3, input_kinds: { action: 1, joy_button: 1, axis: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [
          { joy_button: 'a', device: 0, start_ms: 0, duration_ms: 100 },
          { axis: 'trigger_right', value: 1, device: 0, start_ms: 0, duration_ms: 200 },
          { action_name: 'fire', strength: 0.5, start_ms: 0, duration_ms: 200 },
        ],
      }, ctx);

      expect(result).toContain('joy:a');
      expect(result).toContain('trigger_right=1');
      expect(result).toContain('fire@0.5');
    });

    it('warns when joypad entries were requested but the bridge echoed no input_kinds (old addon)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 0 });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ axis: 'left_x', value: 1, device: 0, start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).toContain('IGNORED');
      expect(result).toContain('predates controller injection');
    });

    it('warns when an action carries strength but the bridge echoed no input_kinds (old addon drops strength)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1 });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', strength: 0.5, start_ms: 0, duration_ms: 100 }],
      }, ctx);

      // strength is a new capability an old bridge silently ignores (fires at 1.0).
      expect(result).toContain('IGNORED');
      expect(result).toContain('analog action strength');
    });

    it('does not warn for a plain action (no strength) against an old addon', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1 });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'fire', start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).not.toContain('IGNORED');
    });

    it('does not warn when input_kinds is present, or for action-only requests against an old addon', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 1, axis: 0 } });
      const ctx = createToolContext(mock);
      const withKinds = await input.execute({
        action: 'sequence',
        inputs: [{ joy_button: 'a', device: 0, start_ms: 0, duration_ms: 100 }],
      }, ctx);
      expect(withKinds).not.toContain('IGNORED');

      const oldMock = createMockGodot();
      oldMock.mockResponse({ completed: true, actions_executed: 1 });
      const actionOnly = await input.execute({
        action: 'sequence',
        inputs: [{ action_name: 'jump', start_ms: 0, duration_ms: 100 }],
      }, createToolContext(oldMock));
      expect(actionOnly).not.toContain('IGNORED');
    });
  });

  describe('key entries (#290)', () => {
    describe('schema', () => {
      it('accepts a key by name, a modifier combo, physical, and a raw int', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ key: 'a' }, { key: 'ctrl+s' }, { key: 'escape', physical: true }, { key: 83 }],
        }).success).toBe(true);
      });

      it('rejects an empty key string', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ key: '' }],
        }).success).toBe(false);
      });

      it('rejects a key entry mixed with another discriminator (strictObject pin)', () => {
        // {key, axis, value} must not silently match a stripping branch and drop
        // an intent — the same discriminator guarantee the joypad branches rely on.
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ key: 'ctrl+s', axis: 'left_x', value: 1 }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ action_name: 'fire', key: 'a' }],
        }).success).toBe(false);
      });

      it('names the key shape in the union error for a no-discriminator entry', () => {
        const r = input.schema.safeParse({ action: 'sequence', inputs: [{ nope: 1 }] });
        expect(r.success).toBe(false);
        if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('{key, physical?}');
      });
    });

    it('passes a key entry through to the wire verbatim (no server-side expansion)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ key: 'ctrl+s', physical: true, start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(mock.calls[0].params.inputs).toEqual([
        { key: 'ctrl+s', physical: true, start_ms: 0, duration_ms: 100 },
      ]);
      expect(result).toContain('key:ctrl+s');
    });

    it('warns when key entries hit a controller-era bridge that echoes input_kinds without a key count', async () => {
      // A #289-era bridge echoes input_kinds (so the controller check passes) yet
      // silently drops key entries — only the missing `key` count catches it.
      mock.mockResponse({ completed: true, actions_executed: 0, input_kinds: { action: 0, joy_button: 0, axis: 0 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ key: 'ctrl+s', start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).toContain('IGNORED');
      expect(result).toContain('predates raw-key injection');
    });

    it('does not warn when the bridge echoes a key count', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ key: 'escape', start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).not.toContain('IGNORED');
    });
  });

  describe('look entries (#294)', () => {
    describe('schema', () => {
      it('accepts a look delta, with and without a sweep duration', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ look: [10, -4] }, { look: [200, 0], duration_ms: 500 }],
        }).success).toBe(true);
      });

      it('rejects a look with the wrong arity or a non-number payload', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ look: [1] }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ look: [1, 2, 3] }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ look: 'x' }],
        }).success).toBe(false);
      });

      it('rejects a look entry mixed with another discriminator (strictObject pin)', () => {
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ look: [1, 2], key: 'a' }],
        }).success).toBe(false);
        expect(input.schema.safeParse({
          action: 'sequence',
          inputs: [{ action_name: 'fire', look: [1, 2] }],
        }).success).toBe(false);
      });

      it('names the look shape in the union error for a no-discriminator entry', () => {
        const r = input.schema.safeParse({ action: 'sequence', inputs: [{ nope: 1 }] });
        expect(r.success).toBe(false);
        if (!r.success) expect(JSON.stringify(r.error.issues)).toContain('{look: [dx, dy]}');
      });
    });

    it('passes a look entry through to the wire verbatim (the bridge chunks any sweep)', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 0, look: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ look: [200, 0], start_ms: 0, duration_ms: 500 }],
      }, ctx);

      expect(mock.calls[0].params.inputs).toEqual([
        { look: [200, 0], start_ms: 0, duration_ms: 500 },
      ]);
      expect(result).toContain('look:200,0');
    });

    it('labels a look entry (with a negative delta) in the summary line', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 0, look: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ look: [3, -4], start_ms: 0, duration_ms: 0 }],
      }, ctx);

      expect(result).toContain('look:3,-4');
    });

    it('warns when look entries hit a bridge that echoes input_kinds without a look count', async () => {
      // A #290-era bridge echoes input_kinds (so the key check passes) yet
      // silently drops look entries — only the missing `look` count catches it.
      mock.mockResponse({ completed: true, actions_executed: 0, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 0 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ look: [100, 0], start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).toContain('IGNORED');
      expect(result).toContain('predates mouse-look injection');
    });

    it('does not warn when the bridge echoes a look count', async () => {
      mock.mockResponse({ completed: true, actions_executed: 1, input_kinds: { action: 0, joy_button: 0, axis: 0, key: 0, look: 1 } });
      const ctx = createToolContext(mock);

      const result = await input.execute({
        action: 'sequence',
        inputs: [{ look: [50, 50], start_ms: 0, duration_ms: 100 }],
      }, ctx);

      expect(result).not.toContain('IGNORED');
    });
  });

  describe('JSON Schema draft 2020-12 compliance', () => {
    // The Anthropic API validates a tool's inputSchema against JSON Schema draft
    // 2020-12, where `items` must be a single schema (tuples use `prefixItems`) and
    // `additionalItems` does not exist. The converter (core/schema.ts) emits
    // draft-07, so a z.tuple() anywhere in this tool compiles to the invalid
    // `items: [..]` tuple form and the API rejects the ENTIRE tool at connect time
    // (a failure invisible to safeParse and only seen live). Walk the converted
    // schema so that class of bug fails here instead. See the `look` entry, which
    // uses z.array(z.number()).length(2) for exactly this reason.
    function findDraft07TupleViolations(node: unknown, path: string, out: string[]): void {
      if (Array.isArray(node)) {
        node.forEach((v, i) => findDraft07TupleViolations(v, `${path}[${i}]`, out));
        return;
      }
      if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (Array.isArray(obj.items)) out.push(`${path}.items is an array (draft-07 tuple form)`);
        if ('additionalItems' in obj) out.push(`${path}.additionalItems present (draft-07 only)`);
        for (const [k, v] of Object.entries(obj)) findDraft07TupleViolations(v, `${path}.${k}`, out);
      }
    }

    it('converts to an input schema free of draft-07 tuple constructs (no z.tuple)', () => {
      const violations: string[] = [];
      findDraft07TupleViolations(toInputSchema(input.schema), '$', violations);
      expect(violations).toEqual([]);
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

    it('sizes the timeout from the typing duration and pushes the relay budget (#276)', async () => {
      mock.mockResponse({ completed: true, chars_typed: 5, submitted: false });
      const ctx = createToolContext(mock);

      await input.execute({ action: 'type_text', text: 'Hello', delay_ms: 50, submit: false }, ctx);

      const t = deriveTimeouts(5 * 50, { readyWait: true }); // 5 chars * 50ms + folded ready-wait
      expect(mock.calls[0].params.relay_timeout_ms).toBe(t.relayMs);
      expect(mock.calls[0].opts?.timeoutMs).toBe(t.serverMs);
    });
  });
});
