import { z } from 'zod';
import { getGodotConnection } from '../connection/websocket.js';
import { formatError } from '../utils/errors.js';

export const sceneTools = [
  {
    name: 'get_scene_tree',
    description: 'Get the full hierarchy of nodes in the currently open scene',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'open_scene',
    description: 'Open a scene file in the editor',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_path: {
          type: 'string',
          description: 'Path to the scene file (e.g., "res://scenes/main.tscn")',
        },
      },
      required: ['scene_path'],
    },
  },
  {
    name: 'save_scene',
    description: 'Save the currently open scene',
    inputSchema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Optional path to save as (defaults to current scene path)',
        },
      },
      required: [],
    },
  },
  {
    name: 'create_scene',
    description: 'Create a new scene with a root node',
    inputSchema: {
      type: 'object' as const,
      properties: {
        root_type: {
          type: 'string',
          description: 'Type of the root node (e.g., "Node2D", "Node3D", "Control")',
        },
        root_name: {
          type: 'string',
          description: 'Name of the root node',
        },
        scene_path: {
          type: 'string',
          description: 'Path to save the scene (e.g., "res://scenes/new_scene.tscn")',
        },
      },
      required: ['root_type', 'scene_path'],
    },
  },
];

const GetSceneTreeSchema = z.object({});

const OpenSceneSchema = z.object({
  scene_path: z.string(),
});

const SaveSceneSchema = z.object({
  path: z.string().optional(),
});

const CreateSceneSchema = z.object({
  root_type: z.string(),
  root_name: z.string().optional(),
  scene_path: z.string(),
});

export async function handleSceneTool(name: string, args: Record<string, unknown>): Promise<string> {
  const godot = getGodotConnection();

  try {
    switch (name) {
      case 'get_scene_tree': {
        GetSceneTreeSchema.parse(args);
        const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree');
        return JSON.stringify(result.tree, null, 2);
      }

      case 'open_scene': {
        const { scene_path } = OpenSceneSchema.parse(args);
        await godot.sendCommand('open_scene', { scene_path });
        return `Opened scene: ${scene_path}`;
      }

      case 'save_scene': {
        const { path } = SaveSceneSchema.parse(args);
        const result = await godot.sendCommand<{ path: string }>('save_scene', { path });
        return `Saved scene: ${result.path}`;
      }

      case 'create_scene': {
        const { root_type, root_name, scene_path } = CreateSceneSchema.parse(args);
        await godot.sendCommand('create_scene', {
          root_type,
          root_name: root_name ?? root_type,
          scene_path,
        });
        return `Created scene: ${scene_path} with root node type ${root_type}`;
      }

      default:
        throw new Error(`Unknown scene tool: ${name}`);
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}
