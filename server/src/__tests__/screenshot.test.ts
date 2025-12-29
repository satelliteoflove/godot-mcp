import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from './helpers/mock-godot.js';
import {
  screenshotTools,
  captureGameScreenshot,
  captureEditorScreenshot,
} from '../tools/screenshot.js';

describe('Screenshot Tools', () => {
  describe('tool definitions', () => {
    it('exports two tools', () => {
      expect(screenshotTools).toHaveLength(2);
    });

    it('has capture_game_screenshot tool', () => {
      const tool = screenshotTools.find((t) => t.name === 'capture_game_screenshot');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('running');
    });

    it('has capture_editor_screenshot tool', () => {
      const tool = screenshotTools.find((t) => t.name === 'capture_editor_screenshot');
      expect(tool).toBeDefined();
      expect(tool?.description).toContain('editor');
    });
  });

  describe('schemas', () => {
    it('capture_game_screenshot accepts max_width', () => {
      const result = captureGameScreenshot.schema.safeParse({ max_width: 800 });
      expect(result.success).toBe(true);
    });

    it('capture_game_screenshot allows empty params', () => {
      const result = captureGameScreenshot.schema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('capture_editor_screenshot accepts viewport and max_width', () => {
      const result = captureEditorScreenshot.schema.safeParse({ viewport: '2d', max_width: 1280 });
      expect(result.success).toBe(true);
    });

    it('capture_editor_screenshot rejects invalid viewport', () => {
      const result = captureEditorScreenshot.schema.safeParse({ viewport: 'invalid' });
      expect(result.success).toBe(false);
    });

    it('capture_editor_screenshot accepts 3d viewport', () => {
      const result = captureEditorScreenshot.schema.safeParse({ viewport: '3d' });
      expect(result.success).toBe(true);
    });
  });

  describe('capture_game_screenshot execution', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('sends capture_game_screenshot command', async () => {
      mock.mockResponse({ image_base64: 'abc123', width: 800, height: 600 });
      const ctx = createToolContext(mock);

      await captureGameScreenshot.execute({}, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('capture_game_screenshot');
    });

    it('passes max_width parameter', async () => {
      mock.mockResponse({ image_base64: 'abc123', width: 640, height: 480 });
      const ctx = createToolContext(mock);

      await captureGameScreenshot.execute({ max_width: 640 }, ctx);

      expect(mock.calls[0].params.max_width).toBe(640);
    });

    it('returns ImageContent with correct structure', async () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      mock.mockResponse({ image_base64: base64Data, width: 1, height: 1 });
      const ctx = createToolContext(mock);

      const result = await captureGameScreenshot.execute({}, ctx);

      expect(result).toEqual({
        type: 'image',
        data: base64Data,
        mimeType: 'image/png',
      });
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Game is not running'));
      const ctx = createToolContext(mock);

      await expect(captureGameScreenshot.execute({}, ctx)).rejects.toThrow('Game is not running');
    });
  });

  describe('capture_editor_screenshot execution', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('sends capture_editor_screenshot command', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await captureEditorScreenshot.execute({}, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('capture_editor_screenshot');
    });

    it('passes viewport parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await captureEditorScreenshot.execute({ viewport: '2d' }, ctx);

      expect(mock.calls[0].params.viewport).toBe('2d');
    });

    it('passes 3d viewport parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      await captureEditorScreenshot.execute({ viewport: '3d' }, ctx);

      expect(mock.calls[0].params.viewport).toBe('3d');
    });

    it('passes max_width parameter', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 1280, height: 720 });
      const ctx = createToolContext(mock);

      await captureEditorScreenshot.execute({ max_width: 1280 }, ctx);

      expect(mock.calls[0].params.max_width).toBe(1280);
    });

    it('passes both viewport and max_width', async () => {
      mock.mockResponse({ image_base64: 'xyz789', width: 800, height: 600 });
      const ctx = createToolContext(mock);

      await captureEditorScreenshot.execute({ viewport: '2d', max_width: 800 }, ctx);

      expect(mock.calls[0].params.viewport).toBe('2d');
      expect(mock.calls[0].params.max_width).toBe(800);
    });

    it('returns ImageContent with correct structure', async () => {
      const base64Data = 'editorScreenshotBase64Data';
      mock.mockResponse({ image_base64: base64Data, width: 1920, height: 1080 });
      const ctx = createToolContext(mock);

      const result = await captureEditorScreenshot.execute({}, ctx);

      expect(result).toEqual({
        type: 'image',
        data: base64Data,
        mimeType: 'image/png',
      });
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Editor viewport not available'));
      const ctx = createToolContext(mock);

      await expect(captureEditorScreenshot.execute({}, ctx)).rejects.toThrow(
        'Editor viewport not available'
      );
    });
  });
});
