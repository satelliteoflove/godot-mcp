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
      action: z.literal('create').describe('Create a node, or instantiate a scene as a node'),
      parent_path: z.string().describe('Path to the parent node'),
      node_name: z.string().describe('Name for the new node'),
      node_type: z
        .string()
        .optional()
        .describe('Type of node to create, e.g. "Sprite2D" (use this OR scene_path)'),
      scene_path: z
        .string()
        .optional()
        .describe('Path to scene to instantiate, e.g. "res://enemies/goblin.tscn" (use this OR node_type)'),
      properties: propertiesField,
    }),
    z.object({
      action: z.literal('update').describe('Update a node\'s properties'),
      node_path: z.string().describe('Path to the node'),
      properties: propertiesField,
    }),
    z.object({
      action: z.literal('delete').describe('Delete a node'),
      node_path: z.string().describe('Path to the node'),
    }),
    z.object({
      action: z.literal('reparent').describe('Move a node to a new parent'),
      node_path: z.string().describe('Path to the node'),
      new_parent_path: z.string().describe('Path to the new parent node'),
    }),
    z.object({
      action: z.literal('attach_script').describe('Attach a script to a node'),
      node_path: z.string().describe('Path to the node'),
      script_path: z.string().describe('Path to the script file'),
    }),
    z.object({
      action: z.literal('detach_script').describe('Detach a node\'s script'),
      node_path: z.string().describe('Path to the node'),
    }),
    z.object({
      action: z.literal('connect_signal').describe('Connect a signal to a target method'),
      node_path: z.string().describe('Path to the node emitting the signal'),
      signal_name: z.string().describe('Name of the signal, e.g. "pressed", "body_entered"'),
      target_path: z.string().describe('Path to the target node that will receive the signal'),
      method_name: z.string().describe('Name of the method to call on the target node'),
    }),
  ])
  // Constraints a discriminated union can't express on its own, so they live here:
  .refine(
    (data) => (data.action === 'find' ? !!data.name_pattern || !!data.type : true),
    { message: 'find requires name_pattern and/or type' }
  )
  .refine(
    // create needs exactly one of node_type / scene_path (XOR).
    (data) => (data.action === 'create' ? !!data.node_type !== !!data.scene_path : true),
    { message: 'create requires exactly one of node_type or scene_path' }
  );

type NodeArgs = z.infer<typeof NodeSchema>;

export const node = defineTool({
  name: 'godot_node',
  annotations: { title: 'Node', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  description:
    'Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts, connect signals',
  schema: NodeSchema,
  async execute(args: NodeArgs, { godot }) {
    switch (args.action) {
      case 'get_properties': {
        const result = await godot.sendCommand<{
          properties: Record<string, unknown>;
        }>('get_node_properties', { node_path: args.node_path });
        return structured(result.properties);
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

      case 'create': {
        const result = await godot.sendCommand<{ node_path: string }>(
          'create_node',
          {
            parent_path: args.parent_path,
            node_type: args.node_type,
            scene_path: args.scene_path,
            node_name: args.node_name,
            properties: args.properties ?? {},
          }
        );
        return `Created node: ${result.node_path}`;
      }

      case 'update': {
        await godot.sendCommand('update_node', {
          node_path: args.node_path,
          properties: args.properties ?? {},
        });
        return `Updated node: ${args.node_path}`;
      }

      case 'delete': {
        await godot.sendCommand('delete_node', { node_path: args.node_path });
        return `Deleted node: ${args.node_path}`;
      }

      case 'reparent': {
        const result = await godot.sendCommand<{ new_path: string }>('reparent_node', {
          node_path: args.node_path,
          new_parent_path: args.new_parent_path,
        });
        return `Reparented node to: ${result.new_path}`;
      }

      case 'attach_script': {
        await godot.sendCommand('attach_script', {
          node_path: args.node_path,
          script_path: args.script_path,
        });
        return `Attached ${args.script_path} to ${args.node_path}`;
      }

      case 'detach_script': {
        await godot.sendCommand('detach_script', { node_path: args.node_path });
        return `Detached script from ${args.node_path}`;
      }

      case 'connect_signal': {
        await godot.sendCommand('connect_signal', {
          node_path: args.node_path,
          signal_name: args.signal_name,
          target_path: args.target_path,
          method_name: args.method_name,
        });
        return `Connected ${args.node_path}.${args.signal_name} to ${args.target_path}.${args.method_name}()`;
      }
    }
  },
});

export const nodeTools = [node] as AnyToolDefinition[];
