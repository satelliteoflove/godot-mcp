import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { scene } from '../../tools/scene.js';

describe('scene tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('requires scene_path for open', () => {
      expect(scene.schema.safeParse({ action: 'open' }).success).toBe(false);
      expect(scene.schema.safeParse({ action: 'open', scene_path: 'res://test.tscn' }).success).toBe(true);
    });

    it('rejects the removed create action', () => {
      expect(scene.schema.safeParse({
        action: 'create',
        root_type: 'Node2D',
        scene_path: 'res://test.tscn',
      }).success).toBe(false);
    });

    it('save works with or without scene_path', () => {
      expect(scene.schema.safeParse({ action: 'save' }).success).toBe(true);
      expect(scene.schema.safeParse({ action: 'save', scene_path: 'res://new.tscn' }).success).toBe(true);
    });
  });

  describe('open/save actions', () => {
    it('open returns confirmation with path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'open', scene_path: 'res://main.tscn' }, ctx);
      expect(result).toBe('Opened scene: res://main.tscn');
    });

    it('save returns path from Godot response and passes optional path', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ path: 'res://current.tscn' });
      expect(await scene.execute({ action: 'save' }, ctx)).toBe('Saved scene: res://current.tscn');

      mock.mockResponse({ path: 'res://new.tscn' });
      await scene.execute({ action: 'save', scene_path: 'res://new.tscn' }, ctx);
      expect(mock.calls[1].params).toEqual({ path: 'res://new.tscn' });
    });
  });
});
