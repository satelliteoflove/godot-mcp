import { describe, it, expect } from 'vitest';
import { createMockGodot, createToolContext } from '../helpers/mock-godot.js';
import { docs, docsTools } from '../../tools/docs.js';

describe('godot_docs tool', () => {
  describe('tool definitions', () => {
    it('exports one tool', () => {
      expect(docsTools).toHaveLength(1);
    });

    it('has correct name and description', () => {
      expect(docs.name).toBe('godot_docs');
      expect(docs.description).toContain('Godot Engine documentation');
    });
  });

  describe('schema validation', () => {
    it('requires action', () => {
      expect(docs.schema.safeParse({}).success).toBe(false);
    });

    it('requires class_name for fetch_class', () => {
      const result = docs.schema.safeParse({ action: 'fetch_class' });
      expect(result.success).toBe(true);
    });

    it('requires path for fetch_page', () => {
      const result = docs.schema.safeParse({ action: 'fetch_page' });
      expect(result.success).toBe(true);
    });

    it('accepts valid version values', () => {
      const versions = ['stable', 'latest', '4.5', '4.4', '4.3', '4.2'];
      for (const version of versions) {
        const result = docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          version,
        });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid version', () => {
      const result = docs.schema.safeParse({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: '3.5',
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid section values', () => {
      const sections = ['full', 'description', 'properties', 'methods', 'signals'];
      for (const section of sections) {
        const result = docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          section,
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('fetch_class action (live integration)', () => {
    it('fetches CharacterBody2D class reference', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'CharacterBody2D', version: 'stable', section: 'description' },
        ctx
      );

      expect(result).toContain('CharacterBody2D');
      expect(result).toContain('Source: https://docs.godotengine.org');
      expect(result).toContain('Approx tokens:');
    });

    it('returns smaller content with section filter', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const fullResult = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'full' },
        ctx
      )) as string;

      const descResult = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'description' },
        ctx
      )) as string;

      expect(descResult.length).toBeLessThan(fullResult.length);
      expect(descResult).toContain('Node2D');
      expect(descResult).toContain('Description');
    });

    it('handles class name case insensitively', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'SPRITE2D', version: 'stable', section: 'description' },
        ctx
      );

      expect(result).toContain('Sprite2D');
    });

    it('throws error for non-existent class', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      await expect(
        docs.execute(
          { action: 'fetch_class', class_name: 'NotARealClass12345', version: 'stable', section: 'full' },
          ctx
        )
      ).rejects.toThrow('not found');
    });

    it('fetches from specific version', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'TileMapLayer', version: '4.5', section: 'description' },
        ctx
      );

      expect(result).toContain('https://docs.godotengine.org/en/4.5/');
      expect(result).toContain('TileMapLayer');
    });
  });

  describe('fetch_page action (live integration)', () => {
    it('fetches tutorial page', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = (await docs.execute(
        {
          action: 'fetch_page',
          path: '/tutorials/2d/2d_movement.html',
          version: 'stable',
          section: 'full',
        },
        ctx
      )) as string;

      expect(result).toContain('Source: https://docs.godotengine.org');
      expect(result.length).toBeGreaterThan(1000);
    });
  });

  describe('version auto-detection', () => {
    it('uses detected version from Godot connection', async () => {
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', section: 'description' },
        ctx
      );

      expect(result).toContain('(auto-detected: 4.5)');
      expect(result).toContain('/en/4.5/');
    });

    it('falls back to stable when not connected', async () => {
      const mock = createMockGodot();
      mock.godotVersion = null;
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', section: 'description' },
        ctx
      );

      expect(result).toContain('(auto-detected: stable)');
      expect(result).toContain('/en/stable/');
    });

    it('uses explicit version over auto-detected', async () => {
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: '4.4', section: 'description' },
        ctx
      );

      expect(result).not.toContain('auto-detected');
      expect(result).toContain('/en/4.4/');
    });
  });
});
