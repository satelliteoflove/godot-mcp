import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const getSceneTree = defineTool({
  name: 'get_scene_tree',
  description: 'Get the full hierarchy of nodes in the currently open scene',
  schema: z.object({}),
  async execute(_, { godot }) {
    const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree');
    return JSON.stringify(result.tree, null, 2);
  },
});

export const openScene = defineTool({
  name: 'open_scene',
  description: 'Open a scene file in the editor',
  schema: z.object({
    scene_path: z
      .string()
      .describe('Path to the scene file (e.g., "res://scenes/main.tscn")'),
  }),
  async execute({ scene_path }, { godot }) {
    await godot.sendCommand('open_scene', { scene_path });
    return `Opened scene: ${scene_path}`;
  },
});

export const saveScene = defineTool({
  name: 'save_scene',
  description: 'Save the currently open scene',
  schema: z.object({
    path: z
      .string()
      .optional()
      .describe('Optional path to save as (defaults to current scene path)'),
  }),
  async execute({ path }, { godot }) {
    const result = await godot.sendCommand<{ path: string }>('save_scene', {
      path,
    });
    return `Saved scene: ${result.path}`;
  },
});

export const createScene = defineTool({
  name: 'create_scene',
  description: 'Create a new scene with a root node',
  schema: z.object({
    root_type: z
      .string()
      .describe('Type of the root node (e.g., "Node2D", "Node3D", "Control")'),
    root_name: z.string().optional().describe('Name of the root node'),
    scene_path: z
      .string()
      .describe('Path to save the scene (e.g., "res://scenes/new_scene.tscn")'),
  }),
  async execute({ root_type, root_name, scene_path }, { godot }) {
    await godot.sendCommand('create_scene', {
      root_type,
      root_name: root_name ?? root_type,
      scene_path,
    });
    return `Created scene: ${scene_path} with root node type ${root_type}`;
  },
});

export const sceneTools = [
  getSceneTree,
  openScene,
  saveScene,
  createScene,
] as AnyToolDefinition[];
