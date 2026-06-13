import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import type { AnyToolDefinition } from '../core/types.js';

const NodeReadSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z.literal('get_properties').describe('Get a node\'s properties'),
      node_path: z.string().describe('Path to the node'),
    }),
    z.object({
      action: z
        .literal('get_scene_tree')
        .describe(
          'Full hierarchy of the open scene as the editor sees it, including children inside instanced sub-scenes (a .tscn file read cannot show those). Deep or wide scenes can be large — cap the result with max_depth and/or max_children; any node whose children are cut off carries "truncated_children": <count of omitted direct children> instead of (or alongside) "children".'
        ),
      max_depth: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Cap recursion depth (root = depth 1). Omit for the full tree.'),
      max_children: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Cap how many children are listed per node. Omit to list every child.'),
    }),
    z.object({
      action: z
        .literal('find')
        .describe(
          'Find nodes by name and/or type. Searches the RUNNING game\'s live tree when a game is playing (spawned entities included); otherwise searches the scene open in the editor.'
        ),
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
  ])
  // Constraints a discriminated union can't express on its own, so they live here:
  .refine(
    (data) => (data.action === 'find' ? !!data.name_pattern || !!data.type : true),
    { message: 'find requires name_pattern and/or type' }
  );

type NodeReadArgs = z.infer<typeof NodeReadSchema>;

const NodeEditSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update').describe('Update a node\'s properties'),
    node_path: z.string().describe('Path to the node'),
    // Required: the addon rejects an empty update, so publishing this as
    // optional would invite a guaranteed-failure call shape.
    properties: z.record(z.string(), z.unknown()).describe('Properties to set on the node'),
  }),
  z.object({
    action: z.literal('reparent').describe('Move a node to a new parent'),
    node_path: z.string().describe('Path to the node'),
    new_parent_path: z.string().describe('Path to the new parent node'),
  }),
]);

type NodeEditArgs = z.infer<typeof NodeEditSchema>;

export const nodeRead = defineTool({
  name: 'godot_node_read',
  annotations: {
    title: 'Node (read)',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'Inspect scene nodes in the editor: read a node\'s effective properties (including class defaults a .tscn read cannot show), view the full scene tree as the editor sees it (including children inside instanced sub-scenes), and find nodes by name or type. Use it to discover node paths and verify the live state of the open scene before or after making changes. It cannot modify anything; to update properties or reparent a node, use godot_node_edit.',
  schema: NodeReadSchema,
  async execute(args: NodeReadArgs, { godot }) {
    switch (args.action) {
      case 'get_properties': {
        const result = await godot.sendCommand<{
          properties: Record<string, unknown>;
        }>('get_node_properties', { node_path: args.node_path });
        return structured(result.properties);
      }

      case 'get_scene_tree': {
        const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree', {
          max_depth: args.max_depth,
          max_children: args.max_children,
        });
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
    }
  },
});

export const nodeEdit = defineTool({
  name: 'godot_node_edit',
  annotations: {
    title: 'Node (edit)',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description:
    'Modify scene nodes in the editor: update a node\'s properties, or reparent it (the editor rewrites child paths and signal connections correctly; hand-editing .tscn for a reparent does not). Use it to change existing nodes in the open scene. To inspect properties, the scene tree, or search for nodes, use godot_node_read; to add or remove nodes, or attach scripts and connect signals, edit the .tscn file directly, then verify with godot_node_read\'s get_scene_tree.',
  schema: NodeEditSchema,
  async execute(args: NodeEditArgs, { godot }) {
    switch (args.action) {
      case 'update': {
        await godot.sendCommand('update_node', {
          node_path: args.node_path,
          properties: args.properties,
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

export const nodeTools = [nodeRead, nodeEdit] as AnyToolDefinition[];
