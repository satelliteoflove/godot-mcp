import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { scene } from '../../tools/scene.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  const filepath = join(FIXTURES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

describe('scene tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('action: get_tree', () => {
    it('sends get_scene_tree command to Godot', async () => {
      mock.mockResponse({ tree: { name: 'Root', children: [] } });
      const ctx = createToolContext(mock);

      await scene.execute({ action: 'get_tree' }, ctx);

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_scene_tree');
    });

    it('returns formatted JSON tree', async () => {
      const tree = { name: 'Main', type: 'Node2D', children: [{ name: 'Player', type: 'CharacterBody2D' }] };
      mock.mockResponse({ tree });
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);

      expect(result).toBe(JSON.stringify(tree, null, 2));
    });

    it('accepts empty params for get_tree', () => {
      const result = scene.schema.safeParse({ action: 'get_tree' });
      expect(result.success).toBe(true);
    });
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

  describe('scene tree structure (from real Godot data)', () => {
    it('returns tree with correct root node structure', async () => {
      const fixture = loadFixture('scene-tree');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);
      const parsed = JSON.parse(result as string);

      expect(parsed.name).toBe('Main');
      expect(parsed.path).toBe('/root/Main');
      expect(parsed.type).toBe('Node2D');
      expect(parsed.children).toBeInstanceOf(Array);
    });

    it('contains expected node types in hierarchy', async () => {
      const fixture = loadFixture('scene-tree');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);
      const parsed = JSON.parse(result as string);

      const nodeTypes = new Set<string>();
      function collectTypes(node: { type: string; children: unknown[] }) {
        nodeTypes.add(node.type);
        for (const child of node.children as { type: string; children: unknown[] }[]) {
          collectTypes(child);
        }
      }
      collectTypes(parsed);

      expect(nodeTypes).toContain('Node2D');
      expect(nodeTypes).toContain('CharacterBody2D');
      expect(nodeTypes).toContain('StaticBody2D');
      expect(nodeTypes).toContain('CollisionShape2D');
      expect(nodeTypes).toContain('Area2D');
      expect(nodeTypes).toContain('CanvasLayer');
      expect(nodeTypes).toContain('Label');
    });

    it('includes nested children with correct paths', async () => {
      const fixture = loadFixture('scene-tree');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);
      const parsed = JSON.parse(result as string);

      const player = parsed.children.find((n: { name: string }) => n.name === 'Player');
      expect(player).toBeDefined();
      expect(player.type).toBe('CharacterBody2D');
      expect(player.path).toBe('/root/Main/Player');
      expect(player.children.length).toBeGreaterThan(0);

      const sprite = player.children.find((n: { name: string }) => n.name === 'Sprite');
      expect(sprite).toBeDefined();
      expect(sprite.type).toBe('AnimatedSprite2D');
      expect(sprite.path).toBe('/root/Main/Player/Sprite');
    });

    it('handles deeply nested UI hierarchy', async () => {
      const fixture = loadFixture('scene-tree');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);
      const parsed = JSON.parse(result as string);

      const hud = parsed.children.find((n: { name: string }) => n.name === 'HUD');
      expect(hud).toBeDefined();
      expect(hud.type).toBe('CanvasLayer');

      const margin = hud.children[0];
      expect(margin.type).toBe('MarginContainer');

      const vbox = margin.children[0];
      expect(vbox.type).toBe('VBoxContainer');

      const labels = vbox.children;
      expect(labels.length).toBe(2);
      expect(labels.every((l: { type: string }) => l.type === 'Label')).toBe(true);
    });

    it('includes Area2D with nested collision shapes', async () => {
      const fixture = loadFixture('scene-tree');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await scene.execute({ action: 'get_tree' }, ctx);
      const parsed = JSON.parse(result as string);

      const enemy = parsed.children.find((n: { name: string }) => n.name === 'Enemy');
      expect(enemy).toBeDefined();

      const hitbox = enemy.children.find((n: { name: string }) => n.name === 'HitBox');
      expect(hitbox).toBeDefined();
      expect(hitbox.type).toBe('Area2D');
      expect(hitbox.children.length).toBe(1);
      expect(hitbox.children[0].type).toBe('CollisionShape2D');
    });
  });
});
