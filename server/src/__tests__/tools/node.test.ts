import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { node } from '../../tools/node.js';

describe('node tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('requires node_path for get_properties/update', () => {
      const actionsNeedingNodePath = ['get_properties', 'update'];
      for (const action of actionsNeedingNodePath) {
        expect(node.schema.safeParse({ action }).success).toBe(false);
        expect(node.schema.safeParse({ action, node_path: '/root/Test' }).success).toBe(true);
      }
    });

    it('get_scene_tree takes no parameters', () => {
      expect(node.schema.safeParse({ action: 'get_scene_tree' }).success).toBe(true);
    });

    it('requires new_parent_path for reparent', () => {
      expect(node.schema.safeParse({
        action: 'reparent',
        node_path: '/root/Test',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'reparent',
        node_path: '/root/Test',
        new_parent_path: '/root/New',
      }).success).toBe(true);
    });

    it('rejects the removed create/delete/script/signal actions', () => {
      expect(node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_type: 'Node2D',
        node_name: 'Test',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'delete',
        node_path: '/root/Obsolete',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'attach_script',
        node_path: '/root/Test',
        script_path: 'res://test.gd',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'connect_signal',
        node_path: '/root/Button',
        signal_name: 'pressed',
        target_path: '/root/Main',
        method_name: '_on_pressed',
      }).success).toBe(false);
    });
  });

  describe('get_properties', () => {
    it('returns formatted JSON properties', async () => {
      const properties = { position: { x: 100, y: 200 }, visible: true };
      mock.mockResponse({ properties });
      const ctx = createToolContext(mock);

      const result = await node.execute({ action: 'get_properties', node_path: '/root/Player' }, ctx);
      expect(structuredOf(result)).toEqual(properties);
    });
  });

  describe('get_scene_tree', () => {
    it('returns the full tree from the editor', async () => {
      const tree = {
        name: 'Main',
        type: 'Node2D',
        children: [{ name: 'Player', type: 'CharacterBody2D' }],
      };
      mock.mockResponse({ tree });
      const ctx = createToolContext(mock);

      const result = await node.execute({ action: 'get_scene_tree' }, ctx);
      expect(structuredOf(result)).toEqual(tree);
      expect(mock.calls[0].command).toBe('get_scene_tree');
    });
  });

  describe('update/reparent', () => {
    it('returns appropriate confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({});
      expect(await node.execute({
        action: 'update',
        node_path: '/root/Player',
        properties: { health: 100 },
      }, ctx)).toBe('Updated node: /root/Player');

      mock.mockResponse({ new_path: '/root/New/Node' });
      expect(await node.execute({
        action: 'reparent',
        node_path: '/root/Old/Node',
        new_parent_path: '/root/New',
      }, ctx)).toBe('Reparented node to: /root/New/Node');
    });
  });
});
