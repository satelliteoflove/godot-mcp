import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import {
  getNodeProperties,
  createNode,
  updateNode,
  deleteNode,
  reparentNode,
} from '../../tools/node.js';

describe('Node Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('get_node_properties', () => {
    it('sends get_node_properties command with node_path', async () => {
      mock.mockResponse({ properties: { position: { x: 0, y: 0 } } });
      const ctx = createToolContext(mock);

      await getNodeProperties.execute({ node_path: '/root/Main/Player' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_node_properties');
      expect(mock.calls[0].params).toEqual({ node_path: '/root/Main/Player' });
    });

    it('returns formatted JSON properties', async () => {
      const properties = { position: { x: 100, y: 200 }, visible: true, name: 'Player' };
      mock.mockResponse({ properties });
      const ctx = createToolContext(mock);

      const result = await getNodeProperties.execute({ node_path: '/root/Main/Player' }, ctx);

      expect(result).toBe(JSON.stringify(properties, null, 2));
    });

    it('requires node_path', () => {
      expect(getNodeProperties.schema.safeParse({}).success).toBe(false);
      expect(getNodeProperties.schema.safeParse({ node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('create_node', () => {
    it('sends create_node command with required params', async () => {
      mock.mockResponse({ node_path: '/root/Main/NewSprite' });
      const ctx = createToolContext(mock);

      await createNode.execute({
        parent_path: '/root/Main',
        node_type: 'Sprite2D',
        node_name: 'NewSprite',
      }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('create_node');
      expect(mock.calls[0].params).toEqual({
        parent_path: '/root/Main',
        node_type: 'Sprite2D',
        node_name: 'NewSprite',
        properties: {},
      });
    });

    it('passes optional properties to Godot', async () => {
      mock.mockResponse({ node_path: '/root/Main/Enemy' });
      const ctx = createToolContext(mock);

      await createNode.execute({
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

      const result = await createNode.execute({
        parent_path: '/root/Main',
        node_type: 'Node2D',
        node_name: 'NewNode',
      }, ctx);

      expect(result).toBe('Created node: /root/Main/NewNode');
    });

    it('requires parent_path, node_type, and node_name', () => {
      const schema = createNode.schema;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ parent_path: '/root' }).success).toBe(false);
      expect(schema.safeParse({ parent_path: '/root', node_type: 'Node2D' }).success).toBe(false);
      expect(schema.safeParse({
        parent_path: '/root',
        node_type: 'Node2D',
        node_name: 'Test',
      }).success).toBe(true);
    });
  });

  describe('update_node', () => {
    it('sends update_node command with node_path and properties', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await updateNode.execute({
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

      const result = await updateNode.execute({
        node_path: '/root/Main/Enemy',
        properties: { visible: false },
      }, ctx);

      expect(result).toBe('Updated node: /root/Main/Enemy');
    });

    it('requires node_path and properties', () => {
      const schema = updateNode.schema;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ node_path: '/root' }).success).toBe(false);
      expect(schema.safeParse({
        node_path: '/root/Test',
        properties: { key: 'value' },
      }).success).toBe(true);
    });
  });

  describe('delete_node', () => {
    it('sends delete_node command with node_path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await deleteNode.execute({ node_path: '/root/Main/Obsolete' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('delete_node');
      expect(mock.calls[0].params).toEqual({ node_path: '/root/Main/Obsolete' });
    });

    it('returns confirmation with deleted path', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await deleteNode.execute({ node_path: '/root/Main/ToRemove' }, ctx);

      expect(result).toBe('Deleted node: /root/Main/ToRemove');
    });

    it('requires node_path', () => {
      expect(deleteNode.schema.safeParse({}).success).toBe(false);
      expect(deleteNode.schema.safeParse({ node_path: '/root/Test' }).success).toBe(true);
    });
  });

  describe('reparent_node', () => {
    it('sends reparent_node command with both paths', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      await reparentNode.execute({
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

      const result = await reparentNode.execute({
        node_path: '/root/Old/Node',
        new_parent_path: '/root/New',
      }, ctx);

      expect(result).toBe('Moved node /root/Old/Node to /root/New');
    });

    it('requires both node_path and new_parent_path', () => {
      const schema = reparentNode.schema;
      expect(schema.safeParse({}).success).toBe(false);
      expect(schema.safeParse({ node_path: '/root/Test' }).success).toBe(false);
      expect(schema.safeParse({
        node_path: '/root/Test',
        new_parent_path: '/root/New',
      }).success).toBe(true);
    });
  });
});
