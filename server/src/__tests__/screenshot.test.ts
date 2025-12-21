import { describe, it, expect } from 'vitest';
import { screenshotTools } from '../tools/screenshot.js';

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
      const tool = screenshotTools.find((t) => t.name === 'capture_game_screenshot');
      const result = tool?.schema.safeParse({ max_width: 800 });
      expect(result?.success).toBe(true);
    });

    it('capture_game_screenshot allows empty params', () => {
      const tool = screenshotTools.find((t) => t.name === 'capture_game_screenshot');
      const result = tool?.schema.safeParse({});
      expect(result?.success).toBe(true);
    });

    it('capture_editor_screenshot accepts viewport and max_width', () => {
      const tool = screenshotTools.find((t) => t.name === 'capture_editor_screenshot');
      const result = tool?.schema.safeParse({ viewport: '2d', max_width: 1280 });
      expect(result?.success).toBe(true);
    });

    it('capture_editor_screenshot rejects invalid viewport', () => {
      const tool = screenshotTools.find((t) => t.name === 'capture_editor_screenshot');
      const result = tool?.schema.safeParse({ viewport: 'invalid' });
      expect(result?.success).toBe(false);
    });
  });
});
