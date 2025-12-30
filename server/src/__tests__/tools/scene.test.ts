import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { scene } from '../../tools/scene.js';

describe('scene tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('action: open', () => {
    it('sends open_scene command with scene_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await scene.execute({ action: 'open', scene_path: 'res://scenes/main.tscn' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('open_scene');
      expect(mock.calls[0].params).toEqual({ scene_path: 'res://scenes/main.tscn' });
    });

    it('returns confirmation message with path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'open', scene_path: 'res://levels/level1.tscn' }, ctx);

      expect(result).toBe('Opened scene: res://levels/level1.tscn');
    });

    it('requires scene_path for open', () => {
      expect(scene.schema.safeParse({ action: 'open' }).success).toBe(false);
      expect(scene.schema.safeParse({ action: 'open', scene_path: 'res://test.tscn' }).success).toBe(true);
    });
  });

  describe('action: save', () => {
    it('sends save_scene command', async () => {
      mock.mockResponse({ path: 'res://scenes/saved.tscn' });
      const ctx = createToolContext(mock);

      await scene.execute({ action: 'save' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('save_scene');
    });

    it('passes optional path param', async () => {
      mock.mockResponse({ path: 'res://new_location.tscn' });
      const ctx = createToolContext(mock);

      await scene.execute({ action: 'save', scene_path: 'res://new_location.tscn' }, ctx);

      expect(mock.calls[0].params).toEqual({ path: 'res://new_location.tscn' });
    });

    it('returns saved path from Godot response', async () => {
      mock.mockResponse({ path: 'res://scenes/current.tscn' });
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'save' }, ctx);

      expect(result).toBe('Saved scene: res://scenes/current.tscn');
    });

    it('accepts empty scene_path for save', () => {
      const result = scene.schema.safeParse({ action: 'save' });
      expect(result.success).toBe(true);
    });
  });

  describe('action: create', () => {
    it('sends create_scene command with all params', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await scene.execute({
        action: 'create',
        root_type: 'Node2D',
        root_name: 'GameRoot',
        scene_path: 'res://scenes/game.tscn',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('create_scene');
      expect(mock.calls[0].params).toEqual({
        root_type: 'Node2D',
        root_name: 'GameRoot',
        scene_path: 'res://scenes/game.tscn',
      });
    });

    it('uses root_type as default root_name', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await scene.execute({
        action: 'create',
        root_type: 'Control',
        scene_path: 'res://ui/menu.tscn',
      }, ctx);

      expect(mock.calls[0].params.root_name).toBe('Control');
    });

    it('returns confirmation message', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await scene.execute({
        action: 'create',
        root_type: 'Node3D',
        scene_path: 'res://levels/world.tscn',
      }, ctx);

      expect(result).toBe('Created scene: res://levels/world.tscn with root node type Node3D');
    });

    it('requires root_type and scene_path for create', () => {
      expect(scene.schema.safeParse({ action: 'create' }).success).toBe(false);
      expect(scene.schema.safeParse({ action: 'create', root_type: 'Node2D' }).success).toBe(false);
      expect(scene.schema.safeParse({ action: 'create', scene_path: 'res://test.tscn' }).success).toBe(false);
      expect(scene.schema.safeParse({
        action: 'create',
        root_type: 'Node2D',
        scene_path: 'res://test.tscn',
      }).success).toBe(true);
    });
  });
});
