import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { node } from '../../tools/node.js';

describe('node tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('action: get_properties', () => {
    it('sends get_node_properties command with node_path', async () => {
      mock.mockResponse({ properties: { position: { x: 0, y: 0 } } });
      const ctx = createToolContext(mock);

      await node.execute({ action: 'get_properties', node_path: '/root/Main/Player' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_node_properties');
      expect(mock.calls[0].params).toEqual({ node_path: '/root/Main/Player' });
    });

    it('returns formatted JSON properties', async () => {
      const properties = { position: { x: 100, y: 200 }, visible: true, name: 'Player' };
      mock.mockResponse({ properties });
      const ctx = createToolContext(mock);

      const result = await node.execute({ action: 'get_properties', node_path: '/root/Main/Player' }, ctx);

      expect(result).toBe(JSON.stringify(properties, null, 2));
    });

    it('requires node_path for get_properties', () => {
      expect(node.schema.safeParse({ action: 'get_properties' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'get_properties', node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('action: create', () => {
    it('sends create_node command with required params', async () => {
      mock.mockResponse({ node_path: '/root/Main/NewSprite' });
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'create',
        parent_path: '/root/Main',
        node_type: 'Sprite2D',
        node_name: 'NewSprite',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('create_node');
      expect(mock.calls[0].params).toEqual({
        parent_path: '/root/Main',
        node_type: 'Sprite2D',
        scene_path: undefined,
        node_name: 'NewSprite',
        properties: {},
      });
    });

    it('passes optional properties to Godot', async () => {
      mock.mockResponse({ node_path: '/root/Main/Enemy' });
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'create',
        parent_path: '/root/Main',
        node_type: 'CharacterBody2D',
        node_name: 'Enemy',
        properties: { position: { x: 50, y: 100 }, scale: { x: 2, y: 2 } },
      }, ctx);

      expect(mock.calls[0].params.properties).toEqual({
        position: { x: 50, y: 100 },
        scale: { x: 2, y: 2 },
      });
    });

    it('returns created node path', async () => {
      mock.mockResponse({ node_path: '/root/Main/NewNode' });
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'create',
        parent_path: '/root/Main',
        node_type: 'Node2D',
        node_name: 'NewNode',
      }, ctx);

      expect(result).toBe('Created node: /root/Main/NewNode');
    });

    it('requires parent_path and node_name', () => {
      expect(node.schema.safeParse({ action: 'create' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'create', parent_path: '/root' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'create', parent_path: '/root', node_type: 'Node2D' }).success).toBe(false);
    });

    it('accepts node_type for creating new nodes', () => {
      const result = node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_type: 'Node2D',
        node_name: 'Test',
      });
      expect(result.success).toBe(true);
    });

    it('accepts scene_path for instantiating scenes', () => {
      const result = node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        scene_path: 'res://enemies/goblin.tscn',
        node_name: 'Goblin',
      });
      expect(result.success).toBe(true);
    });

    it('rejects when both node_type and scene_path are provided', () => {
      const result = node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_type: 'Node2D',
        scene_path: 'res://scene.tscn',
        node_name: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('rejects when neither node_type nor scene_path is provided', () => {
      const result = node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_name: 'Test',
      });
      expect(result.success).toBe(false);
    });

    it('passes scene_path to Godot when instantiating', async () => {
      mock.mockResponse({ node_path: '/root/Main/Goblin' });
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'create',
        parent_path: '/root/Main',
        scene_path: 'res://enemies/goblin.tscn',
        node_name: 'Goblin',
      }, ctx);

      expect(mock.calls[0].params.scene_path).toBe('res://enemies/goblin.tscn');
      expect(mock.calls[0].params.node_type).toBeUndefined();
    });
  });

  describe('action: update', () => {
    it('sends update_node command with node_path and properties', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'update',
        node_path: '/root/Main/Player',
        properties: { health: 100, speed: 200 },
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('update_node');
      expect(mock.calls[0].params).toEqual({
        node_path: '/root/Main/Player',
        properties: { health: 100, speed: 200 },
      });
    });

    it('returns confirmation with node path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'update',
        node_path: '/root/Main/Enemy',
        properties: { visible: false },
      }, ctx);

      expect(result).toBe('Updated node: /root/Main/Enemy');
    });

    it('requires node_path for update', () => {
      expect(node.schema.safeParse({ action: 'update' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'update', node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('action: delete', () => {
    it('sends delete_node command with node_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await node.execute({ action: 'delete', node_path: '/root/Main/Obsolete' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('delete_node');
      expect(mock.calls[0].params).toEqual({ node_path: '/root/Main/Obsolete' });
    });

    it('returns confirmation with deleted path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({ action: 'delete', node_path: '/root/Main/ToRemove' }, ctx);

      expect(result).toBe('Deleted node: /root/Main/ToRemove');
    });

    it('requires node_path for delete', () => {
      expect(node.schema.safeParse({ action: 'delete' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'delete', node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('action: reparent', () => {
    it('sends reparent_node command with both paths', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'reparent',
        node_path: '/root/Main/Child',
        new_parent_path: '/root/Main/NewParent',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('reparent_node');
      expect(mock.calls[0].params).toEqual({
        node_path: '/root/Main/Child',
        new_parent_path: '/root/Main/NewParent',
      });
    });

    it('returns confirmation with both paths', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'reparent',
        node_path: '/root/Old/Node',
        new_parent_path: '/root/New',
      }, ctx);

      expect(result).toBe('Moved node /root/Old/Node to /root/New');
    });

    it('requires both node_path and new_parent_path for reparent', () => {
      expect(node.schema.safeParse({ action: 'reparent' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'reparent', node_path: '/root/Test' }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'reparent',
        node_path: '/root/Test',
        new_parent_path: '/root/New',
      }).success).toBe(true);
    });
  });

  describe('action: attach_script', () => {
    it('sends attach_script command with node_path and script_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'attach_script',
        node_path: '/root/Main/Player',
        script_path: 'res://scripts/player.gd',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('attach_script');
      expect(mock.calls[0].params).toEqual({
        node_path: '/root/Main/Player',
        script_path: 'res://scripts/player.gd',
      });
    });

    it('returns confirmation message', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'attach_script',
        node_path: '/root/Main/Enemy',
        script_path: 'res://scripts/enemy.gd',
      }, ctx);

      expect(result).toBe('Attached res://scripts/enemy.gd to /root/Main/Enemy');
    });

    it('requires both node_path and script_path', () => {
      expect(node.schema.safeParse({ action: 'attach_script' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'attach_script', node_path: '/root/Test' }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'attach_script',
        node_path: '/root/Test',
        script_path: 'res://test.gd',
      }).success).toBe(true);
    });
  });

  describe('action: detach_script', () => {
    it('sends detach_script command with node_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await node.execute({
        action: 'detach_script',
        node_path: '/root/Main/Player',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('detach_script');
      expect(mock.calls[0].params).toEqual({ node_path: '/root/Main/Player' });
    });

    it('returns confirmation message', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'detach_script',
        node_path: '/root/Main/Enemy',
      }, ctx);

      expect(result).toBe('Detached script from /root/Main/Enemy');
    });

    it('requires node_path', () => {
      expect(node.schema.safeParse({ action: 'detach_script' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'detach_script', node_path: '/root/Test' }).success).toBe(true);
    });
  });
});
