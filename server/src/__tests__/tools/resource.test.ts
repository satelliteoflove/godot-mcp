import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { resource } from '../../tools/resource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), 'utf-8'));
}

describe('resource tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('requires resource_path for get_info', () => {
      expect(resource.schema.safeParse({ action: 'get_info' }).success).toBe(false);
      expect(resource.schema.safeParse({
        action: 'get_info',
        resource_path: 'res://test.tres',
      }).success).toBe(true);
    });

    it('accepts optional max_depth and include_internal', () => {
      expect(resource.schema.safeParse({
        action: 'get_info',
        resource_path: 'res://test.tres',
        max_depth: 2,
        include_internal: true,
      }).success).toBe(true);
    });
  });

  describe('get_info', () => {
    it('applies default max_depth=1 and include_internal=false', async () => {
      mock.mockResponse({ resource_path: 'res://test.tres', resource_type: 'Resource' });
      const ctx = createToolContext(mock);

      await resource.execute({ action: 'get_info', resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].params.max_depth).toBe(1);
      expect(mock.calls[0].params.include_internal).toBe(false);
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Resource not found: res://missing.tres'));
      const ctx = createToolContext(mock);

      await expect(resource.execute({
        action: 'get_info',
        resource_path: 'res://missing.tres',
      }, ctx)).rejects.toThrow('Resource not found');
    });
  });

  describe('SpriteFrames fixture (real Godot response structure)', () => {
    it('parses animation data with frame details at depth 1', async () => {
      mock.mockResponse(loadFixture('resource-spriteframes'));
      const ctx = createToolContext(mock);

      const result = await resource.execute({
        action: 'get_info',
        resource_path: 'res://player/player_sprites.tres',
      }, ctx);
      const parsed = JSON.parse(result as string);

      expect(parsed.resource_type).toBe('SpriteFrames');
      expect(parsed.type_specific.animations).toHaveLength(5);

      const runAnim = parsed.type_specific.animations.find((a: { name: string }) => a.name === 'run');
      expect(runAnim.frame_count).toBe(8);
      expect(runAnim.fps).toBe(12);
      expect(runAnim.frames[0].texture_type).toBe('AtlasTexture');
      expect(runAnim.frames[0].region).toEqual({ x: 26, y: 314, width: 44, height: 46 });
    });

    it('omits frame details at max_depth=0', async () => {
      mock.mockResponse(loadFixture('resource-spriteframes-depth0'));
      const ctx = createToolContext(mock);

      const result = await resource.execute({
        action: 'get_info',
        resource_path: 'res://player/player_sprites.tres',
        max_depth: 0,
      }, ctx);
      const parsed = JSON.parse(result as string);

      const idleAnim = parsed.type_specific.animations.find((a: { name: string }) => a.name === 'idle');
      expect(idleAnim.frame_count).toBe(1);
      expect(idleAnim.frames).toBeUndefined();
    });

    it('correctly identifies non-looping animations', async () => {
      mock.mockResponse(loadFixture('resource-spriteframes'));
      const ctx = createToolContext(mock);

      const result = await resource.execute({
        action: 'get_info',
        resource_path: 'res://player/player_sprites.tres',
      }, ctx);
      const parsed = JSON.parse(result as string);

      const damageAnim = parsed.type_specific.animations.find((a: { name: string }) => a.name === 'damage');
      expect(damageAnim.loop).toBe(false);
    });
  });

  describe('Texture2D fixture (real Godot response structure)', () => {
    it('parses texture dimensions and type', async () => {
      mock.mockResponse(loadFixture('resource-texture'));
      const ctx = createToolContext(mock);

      const result = await resource.execute({
        action: 'get_info',
        resource_path: 'res://sprites/player/hero.png',
      }, ctx);
      const parsed = JSON.parse(result as string);

      expect(parsed.resource_type).toBe('CompressedTexture2D');
      expect(parsed.type_specific.width).toBe(1026);
      expect(parsed.type_specific.height).toBe(1280);
    });
  });
});
