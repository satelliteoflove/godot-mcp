import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const SceneSchema = z
  .object({
    action: z
      .enum(['open', 'save', 'create'])
      .describe('Action: open, save, create'),
    scene_path: z
      .string()
      .optional()
      .describe('Path to scene file (required for: open, create; optional for: save)'),
    root_type: z
      .string()
      .optional()
      .describe('Type of root node, e.g. "Node2D" (create only)'),
    root_name: z
      .string()
      .optional()
      .describe('Name of root node (create only, defaults to root_type)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'save':
          return true;
        case 'open':
          return !!data.scene_path;
        case 'create':
          return !!data.scene_path && !!data.root_type;
        default:
          return false;
      }
    },
    {
      message:
        'Missing required fields for action. open needs scene_path; create needs scene_path and root_type',
    }
  );

type SceneArgs = z.infer<typeof SceneSchema>;

export const scene = defineTool({
  name: 'scene',
  description: 'Manage scenes: open, save, or create scenes',
  schema: SceneSchema,
  async execute(args: SceneArgs, { godot }) {
    switch (args.action) {
      case 'open': {
        await godot.sendCommand('open_scene', { scene_path: args.scene_path });
        return `Opened scene: ${args.scene_path}`;
      }

      case 'save': {
        const result = await godot.sendCommand<{ path: string }>('save_scene', {
          path: args.scene_path,
        });
        return `Saved scene: ${result.path}`;
      }

      case 'create': {
        await godot.sendCommand('create_scene', {
          root_type: args.root_type,
          root_name: args.root_name ?? args.root_type,
          scene_path: args.scene_path,
        });
        return `Created scene: ${args.scene_path} with root node type ${args.root_type}`;
      }
    }
  },
});

export const sceneTools = [scene] as AnyToolDefinition[];
