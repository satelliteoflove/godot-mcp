import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createMockGodot,
  createToolContext,
  MockGodotConnection,
} from '../helpers/mock-godot.js';
import { resource, resourceTools } from '../../tools/resource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  const filepath = join(FIXTURES_DIR, `${name}.json`);
  return JSON.parse(readFileSync(filepath, 'utf-8'));
}

describe('resource tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('tool definitions', () => {
    it('exports one tool', () => {
      expect(resourceTools).toHaveLength(1);
    });

    it('has resource tool with get_info action', () => {
      expect(resource.name).toBe('resource');
      expect(resource.description).toContain('Resource');
    });
  });

  describe('schema validation', () => {
    it('requires action and resource_path for get_info', () => {
      expect(resource.schema.safeParse({ action: 'get_info' }).success).toBe(false);
    });

    it('accepts valid action and resource_path', () => {
      expect(
        resource.schema.safeParse({ action: 'get_info', resource_path: 'res://test.tres' }).success
      ).toBe(true);
    });

    it('accepts optional max_depth', () => {
      const result = resource.schema.safeParse({
        action: 'get_info',
        resource_path: 'res://test.tres',
        max_depth: 2,
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional include_internal', () => {
      const result = resource.schema.safeParse({
        action: 'get_info',
        resource_path: 'res://test.tres',
        include_internal: true,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid max_depth type', () => {
      const result = resource.schema.safeParse({
        action: 'get_info',
        resource_path: 'res://test.tres',
        max_depth: 'deep',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('action: get_info', () => {
    it('sends correct command name', async () => {
      mock.mockResponse({ resource_path: 'res://test.tres', resource_type: 'Resource' });
      const ctx = createToolContext(mock);

      await resource.execute({ action: 'get_info', resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].command).toBe('get_resource_info');
    });

    it('applies default max_depth of 1', async () => {
      mock.mockResponse({ resource_path: 'res://test.tres', resource_type: 'Resource' });
      const ctx = createToolContext(mock);

      await resource.execute({ action: 'get_info', resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].params.max_depth).toBe(1);
    });

    it('applies default include_internal of false', async () => {
      mock.mockResponse({ resource_path: 'res://test.tres', resource_type: 'Resource' });
      const ctx = createToolContext(mock);

      await resource.execute({ action: 'get_info', resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].params.include_internal).toBe(false);
    });

    it('passes custom max_depth', async () => {
      mock.mockResponse({ resource_path: 'res://test.tres', resource_type: 'Resource' });
      const ctx = createToolContext(mock);

      await resource.execute({ action: 'get_info', resource_path: 'res://test.tres', max_depth: 0 }, ctx);

      expect(mock.calls[0].params.max_depth).toBe(0);
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Resource not found: res://missing.tres'));
      const ctx = createToolContext(mock);

      await expect(
        resource.execute({ action: 'get_info', resource_path: 'res://missing.tres' }, ctx)
      ).rejects.toThrow('Resource not found');
    });
  });

  describe('SpriteFrames response structure (from real Godot data)', () => {
    it('returns correct structure at max_depth=1', async () => {
      const fixture = loadFixture('resource-spriteframes');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await resource.execute(
        { action: 'get_info', resource_path: 'res://player/player_sprites.tres' },
        ctx
      );
      const parsed = JSON.parse(result as string);

      expect(parsed.resource_type).toBe('SpriteFrames');
      expect(parsed.type_specific).toBeDefined();
      expect(parsed.type_specific.animations).toBeInstanceOf(Array);
      expect(parsed.type_specific.animations.length).toBe(5);
    });

    it('includes frame details with AtlasTexture regions at depth 1', async () => {
      const fixture = loadFixture('resource-spriteframes');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await resource.execute(
        { action: 'get_info', resource_path: 'res://player/player_sprites.tres' },
        ctx
      );
      const parsed = JSON.parse(result as string);

      const runAnim = parsed.type_specific.animations.find(
        (a: { name: string }) => a.name === 'run'
      );
      expect(runAnim).toBeDefined();
      expect(runAnim.frame_count).toBe(8);
      expect(runAnim.fps).toBe(12);
      expect(runAnim.loop).toBe(true);
      expect(runAnim.frames).toHaveLength(8);

      const firstFrame = runAnim.frames[0];
      expect(firstFrame.texture_type).toBe('AtlasTexture');
      expect(firstFrame.atlas_source).toBe('res://sprites/player/hero.png');
      expect(firstFrame.region).toEqual({ x: 26, y: 314, width: 44, height: 46 });
    });

    it('omits frame details at max_depth=0', async () => {
      const fixture = loadFixture('resource-spriteframes-depth0');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await resource.execute(
        { action: 'get_info', resource_path: 'res://player/player_sprites.tres', max_depth: 0 },
        ctx
      );
      const parsed = JSON.parse(result as string);

      const idleAnim = parsed.type_specific.animations.find(
        (a: { name: string }) => a.name === 'idle'
      );
      expect(idleAnim).toBeDefined();
      expect(idleAnim.name).toBe('idle');
      expect(idleAnim.frame_count).toBe(1);
      expect(idleAnim.fps).toBe(10);
      expect(idleAnim.loop).toBe(true);
      expect(idleAnim.frames).toBeUndefined();
    });

    it('correctly identifies non-looping animations', async () => {
      const fixture = loadFixture('resource-spriteframes');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await resource.execute(
        { action: 'get_info', resource_path: 'res://player/player_sprites.tres' },
        ctx
      );
      const parsed = JSON.parse(result as string);

      const damageAnim = parsed.type_specific.animations.find(
        (a: { name: string }) => a.name === 'damage'
      );
      expect(damageAnim.loop).toBe(false);
    });
  });

  describe('Texture2D response structure (from real Godot data)', () => {
    it('returns dimensions and type for CompressedTexture2D', async () => {
      const fixture = loadFixture('resource-texture');
      mock.mockResponse(fixture);
      const ctx = createToolContext(mock);

      const result = await resource.execute(
        { action: 'get_info', resource_path: 'res://sprites/player/hero.png' },
        ctx
      );
      const parsed = JSON.parse(result as string);

      expect(parsed.resource_type).toBe('CompressedTexture2D');
      expect(parsed.type_specific.width).toBe(1026);
      expect(parsed.type_specific.height).toBe(1280);
      expect(parsed.type_specific.texture_type).toBe('CompressedTexture2D');
      expect(parsed.type_specific.load_path).toContain('.godot/imported/');
    });
  });
});
