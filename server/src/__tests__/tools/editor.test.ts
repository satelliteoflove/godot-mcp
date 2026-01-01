import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { editor, editorTools } from '../../tools/editor.js';

describe('editor tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('tool definitions', () => {
    it('exports one tool', () => {
      expect(editorTools).toHaveLength(1);
    });

    it('has editor tool with expected actions', () => {
      expect(editor.name).toBe('editor');
      expect(editor.description).toContain('state');
      expect(editor.description).toContain('screenshot');
    });
  });

  describe('action: get_state', () => {
    it('sends get_editor_state command', async () => {
      mock.mockResponse({
        current_scene: 'res://main.tscn',
        is_playing: false,
        godot_version: '4.5',
        open_scenes: ['res://main.tscn'],
        main_screen: '2D',
      });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_state' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_editor_state');
    });

    it('returns JSON state with all fields', async () => {
      const state = {
        current_scene: 'res://main.tscn',
        is_playing: true,
        godot_version: '4.5',
        open_scenes: ['res://main.tscn', 'res://player.tscn'],
        main_screen: 'Script',
      };
      mock.mockResponse(state);
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_state' }, ctx);

      expect(result).toBe(JSON.stringify(state, null, 2));
    });

    it('includes open_scenes and main_screen in response', async () => {
      const state = {
        current_scene: 'res://main.tscn',
        is_playing: false,
        godot_version: '4.5',
        open_scenes: ['res://main.tscn', 'res://enemy.tscn'],
        main_screen: '3D',
      };
      mock.mockResponse(state);
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_state' }, ctx);
      const parsed = JSON.parse(result as string);

      expect(parsed.open_scenes).toEqual(['res://main.tscn', 'res://enemy.tscn']);
      expect(parsed.main_screen).toBe('3D');
    });
  });

  describe('action: get_selection', () => {
    it('sends get_selected_nodes command', async () => {
      mock.mockResponse({ selected: ['/root/Main/Player'] });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_selection' }, ctx);

      expect(mock.calls[0].command).toBe('get_selected_nodes');
    });

    it('returns formatted list of selected nodes', async () => {
      mock.mockResponse({ selected: ['/root/Main/Player', '/root/Main/Enemy'] });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_selection' }, ctx);

      expect(result).toContain('Selected nodes:');
      expect(result).toContain('/root/Main/Player');
      expect(result).toContain('/root/Main/Enemy');
    });

    it('returns message when no nodes selected', async () => {
      mock.mockResponse({ selected: [] });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_selection' }, ctx);

      expect(result).toBe('No nodes selected');
    });
  });

  describe('action: select', () => {
    it('sends select_node command with node_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'select', node_path: '/root/Main/Player' }, ctx);

      expect(mock.calls[0].command).toBe('select_node');
      expect(mock.calls[0].params.node_path).toBe('/root/Main/Player');
    });

    it('returns confirmation', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'select', node_path: '/root/Main/Enemy' }, ctx);

      expect(result).toBe('Selected node: /root/Main/Enemy');
    });

    it('requires node_path', () => {
      expect(editor.schema.safeParse({ action: 'select' }).success).toBe(false);
      expect(editor.schema.safeParse({ action: 'select', node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('action: run', () => {
    it('sends run_project command', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'run' }, ctx);

      expect(mock.calls[0].command).toBe('run_project');
    });

    it('passes optional scene_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'run', scene_path: 'res://test.tscn' }, ctx);

      expect(mock.calls[0].params.scene_path).toBe('res://test.tscn');
    });

    it('returns confirmation with scene path when provided', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'run', scene_path: 'res://test.tscn' }, ctx);

      expect(result).toBe('Running scene: res://test.tscn');
    });

    it('returns confirmation without scene path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'run' }, ctx);

      expect(result).toBe('Running project');
    });
  });

  describe('action: stop', () => {
    it('sends stop_project command', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'stop' }, ctx);

      expect(mock.calls[0].command).toBe('stop_project');
    });

    it('returns confirmation', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'stop' }, ctx);

      expect(result).toBe('Stopped project');
    });
  });

  describe('action: get_debug_output', () => {
    it('sends get_debug_output command', async () => {
      mock.mockResponse({ output: 'Debug message' });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_debug_output' }, ctx);

      expect(mock.calls[0].command).toBe('get_debug_output');
    });

    it('passes clear parameter', async () => {
      mock.mockResponse({ output: 'Debug message' });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_debug_output', clear: true }, ctx);

      expect(mock.calls[0].params.clear).toBe(true);
    });

    it('returns formatted output', async () => {
      mock.mockResponse({ output: 'Error: Something went wrong' });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_debug_output' }, ctx);

      expect(result).toContain('Debug output:');
      expect(result).toContain('Error: Something went wrong');
    });

    it('returns message when no output', async () => {
      mock.mockResponse({ output: '' });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_debug_output' }, ctx);

      expect(result).toBe('No debug output');
    });
  });

  describe('action: get_performance', () => {
    it('sends get_performance_metrics command', async () => {
      mock.mockResponse({ fps: 60 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'get_performance' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_performance_metrics');
    });

    it('returns JSON formatted response', async () => {
      const metrics = { fps: 60, frame_time_ms: 16.67 };
      mock.mockResponse(metrics);
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'get_performance' }, ctx);

      expect(result).toBe(JSON.stringify(metrics, null, 2));
    });
  });

  describe('action: screenshot_game', () => {
    it('sends capture_game_screenshot command', async () => {
      mock.mockResponse({ image_base64: 'abc123', width: 800, height: 600 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_game' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('capture_game_screenshot');
    });

    it('passes max_width parameter', async () => {
      mock.mockResponse({ image_base64: 'abc123', width: 640, height: 480 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_game', max_width: 640 }, ctx);

      expect(mock.calls[0].params.max_width).toBe(640);
    });

    it('returns ImageContent with correct structure', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mock.mockResponse({ image_base64: base64Data, width: 1, height: 1 });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'screenshot_game' }, ctx);

      expect(result).toEqual({
        type: 'image',
        data: base64Data,
        mimeType: 'image/png',
      });
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Game is not running'));
      const ctx = createToolContext(mock);

      await expect(editor.execute({ action: 'screenshot_game' }, ctx)).rejects.toThrow('Game is not running');
    });
  });

  describe('action: screenshot_editor', () => {
    it('sends capture_editor_screenshot command', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('capture_editor_screenshot');
    });

    it('passes viewport parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor', viewport: '2d' }, ctx);

      expect(mock.calls[0].params.viewport).toBe('2d');
    });

    it('passes 3d viewport parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor', viewport: '3d' }, ctx);

      expect(mock.calls[0].params.viewport).toBe('3d');
    });

    it('passes max_width parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1280, height: 720 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor', max_width: 1280 }, ctx);

      expect(mock.calls[0].params.max_width).toBe(1280);
    });

    it('passes both viewport and max_width', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 800, height: 600 });
      const ctx = createToolContext(mock);

      await editor.execute({ action: 'screenshot_editor', viewport: '2d', max_width: 800 }, ctx);

      expect(mock.calls[0].params.viewport).toBe('2d');
      expect(mock.calls[0].params.max_width).toBe(800);
    });

    it('returns ImageContent with correct structure', async () => {
      const base64Data = 'editorScreenshotBase64Data';
      mock.mockResponse({ image_base64: base64Data, width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      const result = await editor.execute({ action: 'screenshot_editor' }, ctx);

      expect(result).toEqual({
        type: 'image',
        data: base64Data,
        mimeType: 'image/png',
      });
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Editor viewport not available'));
      const ctx = createToolContext(mock);

      await expect(editor.execute({ action: 'screenshot_editor' }, ctx)).rejects.toThrow(
        'Editor viewport not available'
      );
    });
  });
});
