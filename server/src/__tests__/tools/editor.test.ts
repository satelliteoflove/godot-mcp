import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { editor } from '../../tools/editor.js';

describe('editor tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('requires node_path for select action', () => {
      expect(editor.schema.safeParse({ action: 'select' }).success).toBe(false);
      expect(editor.schema.safeParse({ action: 'select', node_path: '/root/Test' }).success).toBe(true);
    });

    it('requires at least one param for set_viewport_2d', () => {
      expect(editor.schema.safeParse({ action: 'set_viewport_2d' }).success).toBe(false);
      expect(editor.schema.safeParse({ action: 'set_viewport_2d', zoom: 2.0 }).success).toBe(true);
    });
  });

  describe('get_state', () => {
    it('returns JSON with editor state including camera and viewport info', async () => {
      const state = {
        current_scene: 'res://main.tscn',
        is_playing: false,
        godot_version: '4.5',
        open_scenes: ['res://main.tscn', 'res://player.tscn'],
        main_screen: '2D',
        camera: { position: { x: 0, y: 0, z: 10 } },
        viewport_2d: { center: { x: 0, y: 0 }, zoom: 1.0 },
      };
      mock.mockResponse(state);
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_state' }, ctx);

      expect(JSON.parse(result as string)).toEqual(state);
    });
  });

  describe('get_selection', () => {
    it('returns formatted list or empty message', async () => {
      mock.mockResponse({ selected: [] });
      const ctx = createToolContext(mock);
      expect(await editor.execute({ action: 'get_selection' }, ctx)).toBe('No nodes selected');

      mock.mockResponse({ selected: ['/root/Main/Player', '/root/Main/Enemy'] });
      const result = await editor.execute({ action: 'get_selection' }, ctx);
      expect(result).toContain('Selected nodes:');
      expect(result).toContain('/root/Main/Player');
    });
  });

  describe('run/stop', () => {
    it('returns appropriate confirmations', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      expect(await editor.execute({ action: 'run' }, ctx)).toBe('Running project');
      expect(await editor.execute({ action: 'run', scene_path: 'res://test.tscn' }, ctx))
        .toBe('Running scene: res://test.tscn');
      expect(await editor.execute({ action: 'stop' }, ctx)).toBe('Stopped project');
    });
  });

  describe('get_debug_output', () => {
    it('returns labeled output based on source', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ output: '', source: 'editor' });
      expect(await editor.execute({ action: 'get_debug_output', source: 'editor' }, ctx))
        .toBe('No editor output');

      mock.mockResponse({ output: 'Player spawned', source: 'game' });
      const result = await editor.execute({ action: 'get_debug_output', source: 'game' }, ctx);
      expect(result).toContain('Game output:');
      expect(result).toContain('Player spawned');
    });

    it('passes clear parameter to Godot', async () => {
      mock.mockResponse({ output: 'test', source: 'game' });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_debug_output', clear: true }, ctx);
      expect(mock.calls[0].params.clear).toBe(true);
    });
  });

  describe('get_log_messages', () => {
    it('returns "No log messages" when empty', async () => {
      const ctx = createToolContext(mock);
      mock.mockResponse({ total_count: 0, returned_count: 0, messages: [] });
      expect(await editor.execute({ action: 'get_log_messages' }, ctx)).toBe('No log messages');
    });

    it('returns JSON with messages when present', async () => {
      const ctx = createToolContext(mock);
      const responseData = {
        total_count: 2,
        returned_count: 2,
        messages: [
          { timestamp: 12345, type: 'Parser Error', message: 'Could not find type', file: 'res://test.gd', line: 10, error_type: 0, frames: [] },
          { timestamp: 12346, type: 'Script Error', message: 'Type mismatch', file: 'res://test.gd', line: 15, error_type: 2, frames: [] },
        ],
      };
      mock.mockResponse(responseData);
      const result = await editor.execute({ action: 'get_log_messages' }, ctx);
      expect(JSON.parse(result as string)).toEqual(responseData);
    });

    it('passes limit param to Godot', async () => {
      const ctx = createToolContext(mock);
      mock.mockResponse({ total_count: 0, returned_count: 0, messages: [] });
      await editor.execute({ action: 'get_log_messages', limit: 10 }, ctx);
      expect(mock.calls[0].params.limit).toBe(10);
    });
  });

  describe('get_errors (deprecated alias)', () => {
    it('returns "No errors" when empty, JSON when present', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ total_count: 0, returned_count: 0, messages: [] });
      expect(await editor.execute({ action: 'get_errors' }, ctx)).toBe('No errors');

      const responseData = {
        total_count: 1,
        returned_count: 1,
        messages: [{
          timestamp: 12345,
          type: 'Parser Error',
          message: 'Could not find type',
          file: 'res://test.gd',
          line: 10,
          error_type: 0,
          frames: [],
        }],
      };
      mock.mockResponse(responseData);
      const result = await editor.execute({ action: 'get_errors' }, ctx);
      const parsed = JSON.parse(result as string);
      expect(parsed.error_count).toBe(1);
      expect(parsed.errors).toEqual(responseData.messages);
    });
  });

  describe('get_stack_trace', () => {
    it('returns "No stack trace available" when empty, JSON when present', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ error: '', error_type: '', file: '', line: 0, frames: [] });
      expect(await editor.execute({ action: 'get_stack_trace' }, ctx)).toBe('No stack trace available');

      const stackData = {
        error: 'Null instance',
        error_type: 'Runtime Error',
        file: 'res://player.gd',
        line: 42,
        frames: [{ file: 'res://player.gd', line: 42, function: '_process' }],
      };
      mock.mockResponse(stackData);
      const result = await editor.execute({ action: 'get_stack_trace' }, ctx);
      expect(JSON.parse(result as string)).toEqual(stackData);
    });
  });

  describe('screenshots', () => {
    it('returns ImageContent structure', async () => {
      const base64 = 'iVBORw0KGgoAAAANSUhEUg==';
      mock.mockResponse({ image_base64: base64, width: 800, height: 600 });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'screenshot_game' }, ctx);
      expect(result).toEqual({ type: 'image', data: base64, mimeType: 'image/png' });
    });

    it('passes viewport and max_width params for editor screenshot', async () => {
      mock.mockResponse({ image_base64: 'abc', width: 800, height: 600 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor', viewport: '2d', max_width: 800 }, ctx);
      expect(mock.calls[0].params.viewport).toBe('2d');
      expect(mock.calls[0].params.max_width).toBe(800);
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Game is not running'));
      const ctx = createToolContext(mock);

      await expect(editor.execute({ action: 'screenshot_game' }, ctx))
        .rejects.toThrow('Game is not running');
    });
  });

  describe('set_viewport_2d', () => {
    it('returns formatted confirmation with actual values', async () => {
      mock.mockResponse({ center: { x: 100.5, y: 200.5 }, zoom: 2.5 });
      const ctx = createToolContext(mock);

      const result = await editor.execute({
        action: 'set_viewport_2d',
        center_x: 100,
        center_y: 200,
        zoom: 2.5,
      }, ctx);

      expect(result).toContain('100.5');
      expect(result).toContain('200.5');
      expect(result).toContain('2.50');
    });
  });
});
