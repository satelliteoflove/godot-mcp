import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import type { AnyToolDefinition } from '../core/types.js';

interface ResourceInfoResult {
  resource_path: string;
  resource_type: string;
  type_specific?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}

const ResourceSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('get_info').describe('Inspect a Resource file by path'),
    resource_path: z
      .string()
      .describe('Resource path (e.g., "res://player/sprites.tres")'),
    max_depth: z
      .number()
      .optional()
      .describe('Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources'),
    include_internal: z
      .boolean()
      .optional()
      .describe('Include internal properties starting with underscore (default: false)'),
  }),
]);

type ResourceArgs = z.infer<typeof ResourceSchema>;

export const resource = defineTool({
  name: 'godot_resource',
  annotations: { title: 'Resource Inspector', readOnlyHint: true, openWorldHint: false },
  description:
    'Inspect a Resource file by path with type-aware structured output (SpriteFrames animations, TileSet, Material, Texture2D, etc.). Use it for imported or binary resources (.res, .scn, compressed textures) that a plain file read cannot parse, or when you want sub-resources resolved into the engine\'s view rather than raw .tres text. For nodes inside a scene, use godot_node_read instead.',
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
        return structured(result);
      }
    }
  },
});

export const resourceTools = [resource] as AnyToolDefinition[];
