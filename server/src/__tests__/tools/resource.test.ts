import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMockGodot,
  createToolContext,
  MockGodotConnection,
} from '../helpers/mock-godot.js';
import { getResourceInfo } from '../../tools/resource.js';

describe('Resource Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('get_resource_info', () => {
    it('sends get_resource_info command with resource_path', async () => {
      mock.mockResponse({
        resource_path: 'res://player/sprites.tres',
        resource_type: 'SpriteFrames',
        type_specific: { animations: [] },
      });
      const ctx = createToolContext(mock);

      await getResourceInfo.execute(
        { resource_path: 'res://player/sprites.tres' },
        ctx
      );

      expect(mock.calls).toHaveLength(1);
      expect(mock.calls[0].command).toBe('get_resource_info');
      expect(mock.calls[0].params).toEqual({
        resource_path: 'res://player/sprites.tres',
        max_depth: 1,
        include_internal: false,
      });
    });

    it('passes max_depth parameter', async () => {
      mock.mockResponse({
        resource_path: 'res://test.tres',
        resource_type: 'Resource',
      });
      const ctx = createToolContext(mock);

      await getResourceInfo.execute(
        { resource_path: 'res://test.tres', max_depth: 2 },
        ctx
      );

      expect(mock.calls[0].params.max_depth).toBe(2);
    });

    it('passes include_internal parameter', async () => {
      mock.mockResponse({
        resource_path: 'res://test.tres',
        resource_type: 'Resource',
      });
      const ctx = createToolContext(mock);

      await getResourceInfo.execute(
        { resource_path: 'res://test.tres', include_internal: true },
        ctx
      );

      expect(mock.calls[0].params.include_internal).toBe(true);
    });

    it('requires resource_path', () => {
      expect(getResourceInfo.schema.safeParse({}).success).toBe(false);
      expect(
        getResourceInfo.schema.safeParse({ resource_path: 'res://test.tres' })
          .success
      ).toBe(true);
    });

    it('returns formatted JSON for SpriteFrames', async () => {
      const response = {
        resource_path: 'res://player/player_sprites.tres',
        resource_type: 'SpriteFrames',
        type_specific: {
          animations: [
            {
              name: 'idle',
              frame_count: 1,
              fps: 10.0,
              loop: true,
              frames: [
                {
                  index: 0,
                  duration: 1.0,
                  texture_type: 'AtlasTexture',
                  atlas_source: 'res://sprites/player.png',
                  region: { x: 26, y: 144, width: 44, height: 46 },
                },
              ],
            },
          ],
        },
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await getResourceInfo.execute(
        { resource_path: 'res://player/player_sprites.tres' },
        ctx
      );

      expect(result).toBe(JSON.stringify(response, null, 2));
    });

    it('returns formatted JSON for Texture2D', async () => {
      const response = {
        resource_path: 'res://sprites/player.png',
        resource_type: 'CompressedTexture2D',
        type_specific: {
          width: 512,
          height: 512,
          texture_type: 'CompressedTexture2D',
          load_path: 'res://sprites/player.png',
        },
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await getResourceInfo.execute(
        { resource_path: 'res://sprites/player.png' },
        ctx
      );

      expect(result).toBe(JSON.stringify(response, null, 2));
    });

    it('returns generic properties for unknown resource types', async () => {
      const response = {
        resource_path: 'res://custom.tres',
        resource_type: 'CustomResource',
        properties: {
          custom_value: 42,
          custom_string: 'hello',
        },
      };
      mock.mockResponse(response);
      const ctx = createToolContext(mock);

      const result = await getResourceInfo.execute(
        { resource_path: 'res://custom.tres' },
        ctx
      );

      expect(result).toBe(JSON.stringify(response, null, 2));
    });

    it('uses default max_depth of 1', async () => {
      mock.mockResponse({
        resource_path: 'res://test.tres',
        resource_type: 'Resource',
      });
      const ctx = createToolContext(mock);

      await getResourceInfo.execute({ resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].params.max_depth).toBe(1);
    });

    it('uses default include_internal of false', async () => {
      mock.mockResponse({
        resource_path: 'res://test.tres',
        resource_type: 'Resource',
      });
      const ctx = createToolContext(mock);

      await getResourceInfo.execute({ resource_path: 'res://test.tres' }, ctx);

      expect(mock.calls[0].params.include_internal).toBe(false);
    });
  });
});
