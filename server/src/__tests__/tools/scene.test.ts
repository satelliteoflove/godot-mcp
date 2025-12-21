import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { getSceneTree, openScene, saveScene, createScene } from '../../tools/scene.js';

describe('Scene Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('get_scene_tree', () => {
    it('sends get_scene_tree command to Godot', async () => {
      mock.mockResponse({ tree: { name: 'Root', children: [] } });
      const ctx = createToolContext(mock);

      await getSceneTree.execute({}, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_scene_tree');
    });

    it('returns formatted JSON tree', async () => {
      const tree = { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D' }] };
      mock.mockResponse({ tree });
      const ctx = createToolContext(mock);

      const result = await getSceneTree.execute({}, ctx);

      expect(result).toBe(JSON.stringify(tree, null, 2));
    });

    it('accepts empty params', () => {
      const result = getSceneTree.schema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('open_scene', () => {
    it('sends open_scene command with scene_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await openScene.execute({ scene_path: 'res://scenes/main.tscn' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('open_scene');
      expect(mock.calls[0].params).toEqual({ scene_path: 'res://scenes/main.tscn' });
    });

    it('returns confirmation message with path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await openScene.execute({ scene_path: 'res://levels/level1.tscn' }, ctx);

      expect(result).toBe('Opened scene: res://levels/level1.tscn');
    });

    it('requires scene_path param', () => {
      const result = openScene.schema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts valid scene_path', () => {
      const result = openScene.schema.safeParse({ scene_path: 'res://test.tscn' });
      expect(result.success).toBe(true);
    });
  });

  describe('save_scene', () => {
    it('sends save_scene command', async () => {
      mock.mockResponse({ path: 'res://scenes/saved.tscn' });
      const ctx = createToolContext(mock);

      await saveScene.execute({}, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('save_scene');
    });

    it('passes optional path param', async () => {
      mock.mockResponse({ path: 'res://new_location.tscn' });
      const ctx = createToolContext(mock);

      await saveScene.execute({ path: 'res://new_location.tscn' }, ctx);

      expect(mock.calls[0].params).toEqual({ path: 'res://new_location.tscn' });
    });

    it('returns saved path from Godot response', async () => {
      mock.mockResponse({ path: 'res://scenes/current.tscn' });
      const ctx = createToolContext(mock);

      const result = await saveScene.execute({}, ctx);

      expect(result).toBe('Saved scene: res://scenes/current.tscn');
    });

    it('accepts empty params', () => {
      const result = saveScene.schema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('create_scene', () => {
    it('sends create_scene command with all params', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await createScene.execute({
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

      await createScene.execute({
        root_type: 'Control',
        scene_path: 'res://ui/menu.tscn',
      }, ctx);

      expect(mock.calls[0].params.root_name).toBe('Control');
    });

    it('returns confirmation message', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await createScene.execute({
        root_type: 'Node3D',
        scene_path: 'res://levels/world.tscn',
      }, ctx);

      expect(result).toBe('Created scene: res://levels/world.tscn with root node type Node3D');
    });

    it('requires root_type and scene_path', () => {
      expect(createScene.schema.safeParse({}).success).toBe(false);
      expect(createScene.schema.safeParse({ root_type: 'Node2D' }).success).toBe(false);
      expect(createScene.schema.safeParse({ scene_path: 'res://test.tscn' }).success).toBe(false);
    });

    it('accepts valid params', () => {
      const result = createScene.schema.safeParse({
        root_type: 'Node2D',
        scene_path: 'res://test.tscn',
      });
      expect(result.success).toBe(true);
    });
  });
});
