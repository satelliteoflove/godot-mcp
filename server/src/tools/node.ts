import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import type { AnyToolDefinition } from '../core/types.js';

const propertiesField = z
  .record(z.string(), z.unknown())
  .optional()
  .describe('Properties to set on the node');

const NodeSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('get_properties').describe('Get a node\'s properties'),
      node_path: z.string().describe('Path to the node'),
    }),
    z.object({
      action: z
        .literal('get_scene_tree')
        .describe(
          'Full hierarchy of the open scene as the editor sees it, including children inside instanced sub-scenes (a .tscn file read cannot show those)'
        ),
    }),
    z.object({
      action: z.literal('find').describe('Find nodes by name and/or type'),
      name_pattern: z
        .string()
        .optional()
        .describe('Glob pattern to match node names, e.g. "*Spawner*", "Turret?"'),
      type: z
        .string()
        .optional()
        .describe('Filter by node type, e.g. "CharacterBody2D", "Area2D"'),
      root_path: z
        .string()
        .optional()
        .describe('Path to start search from (defaults to scene root)'),
    }),
    z.object({
      action: z.literal('update').describe('Update a node\'s properties'),
      node_path: z.string().describe('Path to the node'),
      properties: propertiesField,
    }),
    z.object({
      action: z.literal('reparent').describe('Move a node to a new parent'),
      node_path: z.string().describe('Path to the node'),
      new_parent_path: z.string().describe('Path to the new parent node'),
    }),
  ])
  // Constraints a discriminated union can't express on its own, so they live here:
  .refine(
    (data) => (data.action === 'find' ? !!data.name_pattern || !!data.type : true),
    { message: 'find requires name_pattern and/or type' }
  );

type NodeArgs = z.infer<typeof NodeSchema>;

export const node = defineTool({
  name: 'godot_node',
  annotations: { title: 'Node', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Inspect and modify scene nodes in the editor: read effective properties (including class defaults a .tscn read cannot show), view the full scene tree, find nodes, update properties, and reparent (the editor rewrites child paths and signal connections correctly; hand-editing .tscn for a reparent does not). To add or remove nodes, or attach scripts and connect signals, edit the .tscn file directly, then verify with get_scene_tree.',
  schema: NodeSchema,
  async execute(args: NodeArgs, { godot }) {
    switch (args.action) {
      case 'get_properties': {
        const result = await godot.sendCommand<{
          properties: Record<string, unknown>;
        }>('get_node_properties', { node_path: args.node_path });
        return structured(result.properties);
      }

      case 'get_scene_tree': {
        const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree');
        return structured(result.tree as Record<string, unknown>);
      }

      case 'find': {
        const result = await godot.sendCommand<{
          matches: Array<{ path: string; type: string }>;
          count: number;
        }>('find_nodes', {
          name_pattern: args.name_pattern,
          type: args.type,
          root_path: args.root_path,
        });
        if (result.count === 0) {
          return 'No matching nodes found';
        }
        const lines = result.matches.map((m) => `${m.path} (${m.type})`);
        return `Found ${result.count} nodes:\n${lines.join('\n')}`;
      }

      case 'update': {
        await godot.sendCommand('update_node', {
          node_path: args.node_path,
          properties: args.properties ?? {},
        });
        return `Updated node: ${args.node_path}`;
      }

      case 'reparent': {
        const result = await godot.sendCommand<{ new_path: string }>('reparent_node', {
          node_path: args.node_path,
          new_parent_path: args.new_parent_path,
        });
        return `Reparented node to: ${result.new_path}`;
      }
    }
  },
});

export const nodeTools = [node] as AnyToolDefinition[];
