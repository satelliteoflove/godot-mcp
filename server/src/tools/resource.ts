import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

interface ResourceInfoResult {
  resource_path: string;
  resource_type: string;
  type_specific?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

const ResourceSchema = z
  .object({
    action: z
      .enum(['get_info'])
      .describe('Action: get_info'),
    resource_path: z
      .string()
      .optional()
      .describe('Resource path (e.g., "res://player/sprites.tres") (get_info)'),
    max_depth: z
      .number()
      .optional()
      .describe(
        'Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources (get_info)'
      ),
    include_internal: z
      .boolean()
      .optional()
      .describe('Include internal properties starting with underscore (get_info, default: false)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'get_info':
          return !!data.resource_path;
        default:
          return false;
      }
    },
    { message: 'get_info action requires resource_path' }
  );

type ResourceArgs = z.infer<typeof ResourceSchema>;

export const resource = defineTool({
  name: 'resource',
  description:
    'Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.',
  schema: ResourceSchema,
  async execute(args: ResourceArgs, { godot }) {
    switch (args.action) {
      case 'get_info': {
        const result = await godot.sendCommand<ResourceInfoResult>(
          'get_resource_info',
          {
            resource_path: args.resource_path,
            max_depth: args.max_depth ?? 1,
            include_internal: args.include_internal ?? false,
          }
        );
        return JSON.stringify(result, null, 2);
      }
    }
  },
});

export const resourceTools = [resource] as AnyToolDefinition[];
