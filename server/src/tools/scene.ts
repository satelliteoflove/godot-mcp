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
]);

type SceneArgs = z.infer<typeof SceneSchema>;

export const scene = defineTool({
  name: 'godot_scene',
  annotations: { title: 'Scene', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Manage scenes in the editor: open a scene, or save the open scene. To create a new scene, write the .tscn file directly (omit the uid attribute; the editor assigns one on import) and open it with this tool.',
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
    }
  },
});

export const sceneTools = [scene] as AnyToolDefinition[];
