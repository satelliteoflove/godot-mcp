import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { node } from '../../tools/node.js';

describe('node tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('requires node_path for get_properties/update/delete/detach_script', () => {
      const actionsNeedingNodePath = ['get_properties', 'update', 'delete', 'detach_script'];
      for (const action of actionsNeedingNodePath) {
        expect(node.schema.safeParse({ action }).success).toBe(false);
        expect(node.schema.safeParse({ action, node_path: '/root/Test' }).success).toBe(true);
      }
    });

    it('requires parent_path, node_name, and either node_type or scene_path for create', () => {
      expect(node.schema.safeParse({ action: 'create' }).success).toBe(false);
      expect(node.schema.safeParse({ action: 'create', parent_path: '/root' }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_type: 'Node2D',
        node_name: 'Test',
      }).success).toBe(true);
      expect(node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        scene_path: 'res://enemy.tscn',
        node_name: 'Enemy',
      }).success).toBe(true);
    });

    it('rejects create when both node_type and scene_path provided', () => {
      expect(node.schema.safeParse({
        action: 'create',
        parent_path: '/root',
        node_type: 'Node2D',
        scene_path: 'res://scene.tscn',
        node_name: 'Test',
      }).success).toBe(false);
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

    it('requires script_path for attach_script', () => {
      expect(node.schema.safeParse({
        action: 'attach_script',
        node_path: '/root/Test',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'attach_script',
        node_path: '/root/Test',
        script_path: 'res://test.gd',
      }).success).toBe(true);
    });

    it('requires all params for connect_signal', () => {
      expect(node.schema.safeParse({
        action: 'connect_signal',
        node_path: '/root/Button',
        signal_name: 'pressed',
        target_path: '/root/Main',
      }).success).toBe(false);
      expect(node.schema.safeParse({
        action: 'connect_signal',
        node_path: '/root/Button',
        signal_name: 'pressed',
        target_path: '/root/Main',
        method_name: '_on_pressed',
      }).success).toBe(true);
    });
  });

  describe('get_properties', () => {
    it('returns formatted JSON properties', async () => {
      const properties = { position: { x: 100, y: 200 }, visible: true };
      mock.mockResponse({ properties });
      const ctx = createToolContext(mock);

      const result = await node.execute({ action: 'get_properties', node_path: '/root/Player' }, ctx);
      expect(JSON.parse(result as string)).toEqual(properties);
    });
  });

  describe('create', () => {
    it('returns created node path and passes properties', async () => {
      mock.mockResponse({ node_path: '/root/Main/NewNode' });
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'create',
        parent_path: '/root/Main',
        node_type: 'Node2D',
        node_name: 'NewNode',
        properties: { position: { x: 50, y: 100 } },
      }, ctx);

      expect(result).toBe('Created node: /root/Main/NewNode');
      expect(mock.calls[0].params.properties).toEqual({ position: { x: 50, y: 100 } });
    });

    it('passes scene_path for instantiating scenes', async () => {
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

  describe('update/delete/reparent', () => {
    it('returns appropriate confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({});
      expect(await node.execute({
        action: 'update',
        node_path: '/root/Player',
        properties: { health: 100 },
      }, ctx)).toBe('Updated node: /root/Player');

      mock.mockResponse({});
      expect(await node.execute({
        action: 'delete',
        node_path: '/root/Obsolete',
      }, ctx)).toBe('Deleted node: /root/Obsolete');

      mock.mockResponse({ new_path: '/root/New/Node' });
      expect(await node.execute({
        action: 'reparent',
        node_path: '/root/Old/Node',
        new_parent_path: '/root/New',
      }, ctx)).toBe('Reparented node to: /root/New/Node');
    });
  });

  describe('script operations', () => {
    it('attach_script returns confirmation with paths', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'attach_script',
        node_path: '/root/Player',
        script_path: 'res://scripts/player.gd',
      }, ctx);

      expect(result).toBe('Attached res://scripts/player.gd to /root/Player');
    });

    it('detach_script returns confirmation', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'detach_script',
        node_path: '/root/Player',
      }, ctx);

      expect(result).toBe('Detached script from /root/Player');
    });
  });

  describe('connect_signal', () => {
    it('returns formatted connection confirmation', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await node.execute({
        action: 'connect_signal',
        node_path: '/root/Button',
        signal_name: 'pressed',
        target_path: '/root/Main',
        method_name: '_on_button_pressed',
      }, ctx);

      expect(result).toBe('Connected /root/Button.pressed to /root/Main._on_button_pressed()');
    });
  });
});
