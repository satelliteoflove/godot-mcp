import { describe, it, expect, vi } from 'vitest';
import { createMockGodot, createToolContext } from '../helpers/mock-godot.js';
import { docs } from '../../tools/docs.js';

// These suites hit the LIVE Godot docs site (docs.ts does a real fetch). The tool
// aborts each request at FETCH_TIMEOUT_MS (15s); the heaviest test makes two
// sequential fetches, so on a slow CI network the total can exceed vitest's 5s
// default — the observed flake (a spurious red on otherwise-unrelated PRs). Raise
// the per-file timeout to comfortably cover ~2 live fetches plus margin. A truly
// unreachable docs site will still fail (by design — that is a real signal), but
// merely-slow responses no longer trip the clock.
vi.setConfig({ testTimeout: 40_000 });

describe('godot_docs tool', () => {
  describe('schema validation', () => {
    it('accepts valid version and section values', () => {
      const versions = ['stable', 'latest', '4.5', '4.4', '4.3', '4.2'];
      const sections = ['full', 'description', 'properties', 'methods', 'signals'];

      for (const version of versions) {
        expect(docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          version,
        }).success).toBe(true);
      }

      for (const section of sections) {
        expect(docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          section,
        }).success).toBe(true);
      }
    });

    it('rejects invalid version', () => {
      expect(docs.schema.safeParse({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: '3.5',
      }).success).toBe(false);
    });
  });

  describe('fetch_class (live integration)', () => {
    it('fetches class reference with section filtering', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const fullResult = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: 'stable',
        section: 'full',
      }, ctx) as string;

      const descResult = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: 'stable',
        section: 'description',
      }, ctx) as string;

      expect(fullResult).toContain('Node2D');
      expect(fullResult).toContain('Source: https://docs.godotengine.org');
      expect(descResult.length).toBeLessThan(fullResult.length);
    });

    it('handles class name case insensitively', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'SPRITE2D',
        version: 'stable',
        section: 'description',
      }, ctx);

      expect(result).toContain('Sprite2D');
    });

    it('throws error for non-existent class', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      await expect(docs.execute({
        action: 'fetch_class',
        class_name: 'NotARealClass12345',
        version: 'stable',
        section: 'full',
      }, ctx)).rejects.toThrow('not found');
    });

    it('fetches from specific version', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'TileMapLayer',
        version: '4.5',
        section: 'description',
      }, ctx);

      expect(result).toContain('/en/4.5/');
    });
  });

  describe('fetch_page (live integration)', () => {
    it('fetches tutorial page', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_page',
        path: '/tutorials/2d/2d_movement.html',
        version: 'stable',
        section: 'full',
      }, ctx) as string;

      expect(result).toContain('Source: https://docs.godotengine.org');
      expect(result.length).toBeGreaterThan(1000);
    });
  });

  describe('version auto-detection', () => {
    it('uses detected version from Godot, falls back to stable', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      mock.godotVersion = '4.5.1';
      const withVersion = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        section: 'description',
      }, ctx);
      expect(withVersion).toContain('(auto-detected: 4.5)');

      mock.godotVersion = null;
      const noVersion = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        section: 'description',
      }, ctx);
      expect(noVersion).toContain('(auto-detected: stable)');
    });

    it('explicit version overrides auto-detected', async () => {
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: '4.4',
        section: 'description',
      }, ctx);

      expect(result).not.toContain('auto-detected');
      expect(result).toContain('/en/4.4/');
    });
  });
});
