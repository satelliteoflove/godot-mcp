import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface AABB {
  position: Vector3;
  size: Vector3;
  end: Vector3;
}

interface SpatialNodeInfo {
  path: string;
  type: string;
  global_position: Vector3;
  global_rotation: Vector3;
  global_scale: Vector3;
  visible: boolean;
  aabb?: AABB;
  global_aabb?: AABB;
}

const Vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

const AABBInputSchema = z.object({
  position: Vector3Schema.describe('Min corner of the AABB'),
  size: Vector3Schema.describe('Size of the AABB'),
});

const Scene3DSchema = z
  .object({
    action: z
      .enum(['get_spatial_info', 'get_bounds'])
      .describe('Action: get_spatial_info (node spatial data), get_bounds (combined AABB)'),
    node_path: z
      .string()
      .optional()
      .describe('Path to the Node3D (required for get_spatial_info)'),
    root_path: z
      .string()
      .optional()
      .describe('Path to search root (get_bounds only, defaults to scene root)'),
    include_children: z
      .boolean()
      .optional()
      .default(false)
      .describe('Include child nodes (get_spatial_info only)'),
    type_filter: z
      .string()
      .optional()
      .describe('Filter by node type, e.g. "MeshInstance3D" (get_spatial_info only)'),
    max_results: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Limit number of results (get_spatial_info only). Defaults to 50 when include_children=true. Set higher (e.g., 500) if needed.'
      ),
    within_aabb: AABBInputSchema.optional().describe(
      'Only include nodes whose global position is within this AABB (get_spatial_info only)'
    ),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'get_spatial_info':
          return !!data.node_path;
        case 'get_bounds':
          return true;
        default:
          return false;
      }
    },
    {
      message:
        'Missing required fields for action. get_spatial_info requires node_path.',
    }
  );

type Scene3DArgs = z.infer<typeof Scene3DSchema>;

function formatVector3(v: Vector3): string {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

function formatAABB(aabb: AABB): string {
  return `pos: ${formatVector3(aabb.position)}, size: ${formatVector3(aabb.size)}`;
}

export const scene3d = defineTool({
  name: 'scene3d',
  description:
    'Get spatial information for 3D nodes: global transforms, bounding boxes, visibility. Use get_spatial_info for node details, get_bounds for combined AABB of a subtree.',
  schema: Scene3DSchema,
  async execute(args: Scene3DArgs, { godot }) {
    switch (args.action) {
      case 'get_spatial_info': {
        const DEFAULT_LIMIT = 50;
        let effectiveLimit = args.max_results;
        if (effectiveLimit === undefined && args.include_children) {
          effectiveLimit = DEFAULT_LIMIT;
        }

        const result = await godot.sendCommand<{
          nodes: SpatialNodeInfo[];
          count: number;
          truncated?: boolean;
          max_results?: number;
        }>('get_spatial_info', {
          node_path: args.node_path,
          include_children: args.include_children,
          type_filter: args.type_filter,
          max_results: effectiveLimit,
          within_aabb: args.within_aabb,
        });

        if (result.count === 0) {
          return 'No matching Node3D nodes found';
        }

        const lines = result.nodes.map((n) => {
          let line = `${n.path} (${n.type})\n`;
          line += `  position: ${formatVector3(n.global_position)}\n`;
          line += `  rotation: ${formatVector3(n.global_rotation)} rad\n`;
          line += `  scale: ${formatVector3(n.global_scale)}\n`;
          line += `  visible: ${n.visible}`;
          if (n.global_aabb) {
            line += `\n  global_aabb: ${formatAABB(n.global_aabb)}`;
          }
          return line;
        });

        let output = `Found ${result.count} Node3D node(s):\n\n${lines.join('\n\n')}`;
        if (result.truncated) {
          const limitNote =
            args.max_results === undefined
              ? ` Set max_results higher (e.g., 100 or 500) to see more.`
              : '';
          output += `\n\n(Results truncated at ${result.max_results}.${limitNote})`;
        }
        return output;
      }

      case 'get_bounds': {
        const result = await godot.sendCommand<{
          root_path: string;
          node_count: number;
          combined_aabb: AABB;
        }>('get_scene_bounds', {
          root_path: args.root_path,
        });

        return (
          `Scene bounds for ${result.root_path}:\n` +
          `  Visual nodes: ${result.node_count}\n` +
          `  Combined AABB: ${formatAABB(result.combined_aabb)}\n` +
          `  Min: ${formatVector3(result.combined_aabb.position)}\n` +
          `  Max: ${formatVector3(result.combined_aabb.end)}`
        );
      }
    }
  },
});

export const scene3dTools = [scene3d] as AnyToolDefinition[];
