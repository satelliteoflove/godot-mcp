import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const NodeSchema = z
  .object({
    action: z
      .enum(['get_properties', 'create', 'update', 'delete', 'reparent', 'attach_script', 'detach_script'])
      .describe(
        'Action: get_properties, create, update, delete, reparent, attach_script, detach_script'
      ),
    node_path: z
      .string()
      .optional()
      .describe(
        'Path to the node (required for: get_properties, update, delete, reparent, attach_script, detach_script)'
      ),
    parent_path: z
      .string()
      .optional()
      .describe('Path to the parent node (create only)'),
    node_type: z
      .string()
      .optional()
      .describe(
        'Type of node to create, e.g. "Sprite2D" (create only, use this OR scene_path)'
      ),
    scene_path: z
      .string()
      .optional()
      .describe(
        'Path to scene to instantiate, e.g. "res://enemies/goblin.tscn" (create only, use this OR node_type)'
      ),
    node_name: z
      .string()
      .optional()
      .describe('Name for the new node (create only)'),
    properties: z
      .record(z.unknown())
      .optional()
      .describe('Properties to set (create, update)'),
    new_parent_path: z
      .string()
      .optional()
      .describe('Path to the new parent node (reparent only)'),
    script_path: z
      .string()
      .optional()
      .describe('Path to the script file (attach_script only)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'get_properties':
        case 'update':
        case 'delete':
        case 'detach_script':
          return !!data.node_path;
        case 'create':
          return (
            !!data.parent_path &&
            !!data.node_name &&
            !!data.node_type !== !!data.scene_path
          );
        case 'reparent':
          return !!data.node_path && !!data.new_parent_path;
        case 'attach_script':
          return !!data.node_path && !!data.script_path;
        default:
          return false;
      }
    },
    {
      message:
        'Missing required fields for action. get_properties/update/delete/detach_script need node_path; create needs parent_path, node_name, and either node_type OR scene_path; reparent needs node_path and new_parent_path; attach_script needs node_path and script_path',
    }
  );

type NodeArgs = z.infer<typeof NodeSchema>;

export const node = defineTool({
  name: 'node',
  description:
    'Manage scene nodes: get properties, create, update, delete, reparent, attach/detach scripts',
  schema: NodeSchema,
  async execute(args: NodeArgs, { godot }) {
    switch (args.action) {
      case 'get_properties': {
        const result = await godot.sendCommand<{
          properties: Record<string, unknown>;
        }>('get_node_properties', { node_path: args.node_path });
        return JSON.stringify(result.properties, null, 2);
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
        await godot.sendCommand('reparent_node', {
          node_path: args.node_path,
          new_parent_path: args.new_parent_path,
        });
        return `Moved node ${args.node_path} to ${args.new_parent_path}`;
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
    }
  },
});

export const nodeTools = [node] as AnyToolDefinition[];
