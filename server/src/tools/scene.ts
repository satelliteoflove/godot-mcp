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
    action: z
      .literal('reload')
      .describe(
        "Reload an open scene from disk, discarding the editor's unsaved in-memory copy. Use after editing a .tscn file directly to refresh the editor without a full restart; the scene must already be open.",
      ),
    scene_path: z
      .string()
      .optional()
      .describe('Path of the open scene to reload (defaults to the current scene)'),
  }),
]);

type SceneArgs = z.infer<typeof SceneSchema>;

export const scene = defineTool({
  name: 'godot_scene',
  annotations: { title: 'Scene', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  description:
    'Manage scenes in the editor: open a scene, save the open scene, or reload an open scene from disk after you edit its .tscn directly (so the editor picks up the change without a full restart). To create a new scene, write the .tscn file directly — header [gd_scene format=3] without a uid (the editor assigns one when it imports the file), then one [node name="X" type="Node2D"] block per node — and open it with this tool.',
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

      case 'reload': {
        const result = await godot.sendCommand<{ path: string }>('reload_scene', {
          scene_path: args.scene_path,
        });
        return `Reloaded scene from disk: ${result.path}`;
      }
    }
  },
});

export const sceneTools = [scene] as AnyToolDefinition[];
