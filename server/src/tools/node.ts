import { z } from 'zod';
import { getGodotConnection } from '../connection/websocket.js';
import { formatError } from '../utils/errors.js';

export const nodeTools = [
  {
    name: 'get_node_properties',
    description: 'Get all properties of a node at the specified path',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node (e.g., "/root/Main/Player")',
        },
      },
      required: ['node_path'],
    },
  },
  {
    name: 'create_node',
    description: 'Create a new node as a child of an existing node',
    inputSchema: {
      type: 'object' as const,
      properties: {
        parent_path: {
          type: 'string',
          description: 'Path to the parent node',
        },
        node_type: {
          type: 'string',
          description: 'Type of node to create (e.g., "Sprite2D", "CharacterBody2D")',
        },
        node_name: {
          type: 'string',
          description: 'Name for the new node',
        },
        properties: {
          type: 'object',
          description: 'Optional properties to set on the node',
        },
      },
      required: ['parent_path', 'node_type', 'node_name'],
    },
  },
  {
    name: 'update_node',
    description: 'Update properties of an existing node',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node to update',
        },
        properties: {
          type: 'object',
          description: 'Properties to update (key-value pairs)',
        },
      },
      required: ['node_path', 'properties'],
    },
  },
  {
    name: 'delete_node',
    description: 'Delete a node from the scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node to delete',
        },
      },
      required: ['node_path'],
    },
  },
  {
    name: 'reparent_node',
    description: 'Move a node to a new parent',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node to move',
        },
        new_parent_path: {
          type: 'string',
          description: 'Path to the new parent node',
        },
      },
      required: ['node_path', 'new_parent_path'],
    },
  },
];

const GetNodePropertiesSchema = z.object({
  node_path: z.string(),
});

const CreateNodeSchema = z.object({
  parent_path: z.string(),
  node_type: z.string(),
  node_name: z.string(),
  properties: z.record(z.unknown()).optional(),
});

const UpdateNodeSchema = z.object({
  node_path: z.string(),
  properties: z.record(z.unknown()),
});

const DeleteNodeSchema = z.object({
  node_path: z.string(),
});

const ReparentNodeSchema = z.object({
  node_path: z.string(),
  new_parent_path: z.string(),
});

export async function handleNodeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const godot = getGodotConnection();

  try {
    switch (name) {
      case 'get_node_properties': {
        const { node_path } = GetNodePropertiesSchema.parse(args);
        const result = await godot.sendCommand<{ properties: Record<string, unknown> }>(
          'get_node_properties',
          { node_path }
        );
        return JSON.stringify(result.properties, null, 2);
      }

      case 'create_node': {
        const { parent_path, node_type, node_name, properties } = CreateNodeSchema.parse(args);
        const result = await godot.sendCommand<{ node_path: string }>('create_node', {
          parent_path,
          node_type,
          node_name,
          properties: properties ?? {},
        });
        return `Created node: ${result.node_path}`;
      }

      case 'update_node': {
        const { node_path, properties } = UpdateNodeSchema.parse(args);
        await godot.sendCommand('update_node', { node_path, properties });
        return `Updated node: ${node_path}`;
      }

      case 'delete_node': {
        const { node_path } = DeleteNodeSchema.parse(args);
        await godot.sendCommand('delete_node', { node_path });
        return `Deleted node: ${node_path}`;
      }

      case 'reparent_node': {
        const { node_path, new_parent_path } = ReparentNodeSchema.parse(args);
        await godot.sendCommand('reparent_node', { node_path, new_parent_path });
        return `Moved node ${node_path} to ${new_parent_path}`;
      }

      default:
        throw new Error(`Unknown node tool: ${name}`);
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}
