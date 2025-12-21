import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const getNodeProperties = defineTool({
  name: 'get_node_properties',
  description: 'Get all properties of a node at the specified path',
  schema: z.object({
    node_path: z
      .string()
      .describe('Path to the node (e.g., "/root/Main/Player")'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      properties: Record<string, unknown>;
    }>('get_node_properties', { node_path });
    return JSON.stringify(result.properties, null, 2);
  },
});

export const createNode = defineTool({
  name: 'create_node',
  description: 'Create a new node as a child of an existing node',
  schema: z.object({
    parent_path: z.string().describe('Path to the parent node'),
    node_type: z
      .string()
      .describe('Type of node to create (e.g., "Sprite2D", "CharacterBody2D")'),
    node_name: z.string().describe('Name for the new node'),
    properties: z
      .record(z.unknown())
      .optional()
      .describe('Optional properties to set on the node'),
  }),
  async execute({ parent_path, node_type, node_name, properties }, { godot }) {
    const result = await godot.sendCommand<{ node_path: string }>(
      'create_node',
      {
        parent_path,
        node_type,
        node_name,
        properties: properties ?? {},
      }
    );
    return `Created node: ${result.node_path}`;
  },
});

export const updateNode = defineTool({
  name: 'update_node',
  description: 'Update properties of an existing node',
  schema: z.object({
    node_path: z.string().describe('Path to the node to update'),
    properties: z
      .record(z.unknown())
      .describe('Properties to update (key-value pairs)'),
  }),
  async execute({ node_path, properties }, { godot }) {
    await godot.sendCommand('update_node', { node_path, properties });
    return `Updated node: ${node_path}`;
  },
});

export const deleteNode = defineTool({
  name: 'delete_node',
  description: 'Delete a node from the scene',
  schema: z.object({
    node_path: z.string().describe('Path to the node to delete'),
  }),
  async execute({ node_path }, { godot }) {
    await godot.sendCommand('delete_node', { node_path });
    return `Deleted node: ${node_path}`;
  },
});

export const reparentNode = defineTool({
  name: 'reparent_node',
  description: 'Move a node to a new parent',
  schema: z.object({
    node_path: z.string().describe('Path to the node to move'),
    new_parent_path: z.string().describe('Path to the new parent node'),
  }),
  async execute({ node_path, new_parent_path }, { godot }) {
    await godot.sendCommand('reparent_node', { node_path, new_parent_path });
    return `Moved node ${node_path} to ${new_parent_path}`;
  },
});

export const nodeTools = [
  getNodeProperties,
  createNode,
  updateNode,
  deleteNode,
  reparentNode,
] as AnyToolDefinition[];
