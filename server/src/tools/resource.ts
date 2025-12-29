import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

interface ResourceInfoResult {
  resource_path: string;
  resource_type: string;
  type_specific?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

export const getResourceInfo = defineTool({
  name: 'get_resource_info',
  description:
    'Load and inspect any Godot Resource by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc. Falls back to generic property inspection for unknown types.',
  schema: z.object({
    resource_path: z
      .string()
      .describe('Resource path (e.g., "res://player/sprites.tres")'),
    max_depth: z
      .number()
      .optional()
      .describe(
        'Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources'
      ),
    include_internal: z
      .boolean()
      .optional()
      .describe('Include internal properties starting with underscore (default: false)'),
  }),
  async execute({ resource_path, max_depth, include_internal }, { godot }) {
    const result = await godot.sendCommand<ResourceInfoResult>(
      'get_resource_info',
      {
        resource_path,
        max_depth: max_depth ?? 1,
        include_internal: include_internal ?? false,
      }
    );
    return JSON.stringify(result, null, 2);
  },
});

export const resourceTools = [getResourceInfo] as AnyToolDefinition[];
