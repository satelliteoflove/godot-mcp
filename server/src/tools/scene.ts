import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const SceneSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open').describe('Open a scene file'),
    scene_path: z.string().describe('Path to scene file to open'),
  }),
  z.object({
    action: z.literal('save').describe('Save the current scene'),
    scene_path: z
      .string()
      .optional()
      .describe('Path to save to (defaults to the current scene path)'),
  }),
  z.object({
    action: z.literal('create').describe('Create a new scene'),
    scene_path: z.string().describe('Path for the new scene file'),
    root_type: z.string().describe('Type of root node, e.g. "Node2D"'),
    root_name: z.string().optional().describe('Name of root node (defaults to root_type)'),
  }),
]);

type SceneArgs = z.infer<typeof SceneSchema>;

export const scene = defineTool({
  name: 'godot_scene',
  annotations: { title: 'Scene', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
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
        const result = await godot.sendCommand<{ path: string; uid: string }>('create_scene', {
          root_type: args.root_type,
          root_name: args.root_name ?? args.root_type,
          scene_path: args.scene_path,
        });
        return `Created scene: ${result.path} with root node type ${args.root_type}\nUID: ${result.uid}`;
      }
    }
  },
});

export const sceneTools = [scene] as AnyToolDefinition[];
