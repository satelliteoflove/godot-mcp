import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition, ImageContent } from '../core/types.js';

interface ScreenshotResponse {
  image_base64: string;
  width: number;
  height: number;
}

function toImageContent(base64: string): ImageContent {
  return {
    type: 'image',
    data: base64,
    mimeType: 'image/png',
  };
}

const EditorSchema = z
  .object({
    action: z
      .enum(['get_state', 'get_selection', 'select', 'run', 'stop', 'get_debug_output', 'screenshot_game', 'screenshot_editor'])
      .describe('Action: get_state, get_selection, select, run, stop, get_debug_output, screenshot_game, screenshot_editor'),
    node_path: z
      .string()
      .optional()
      .describe('Path to node (select only)'),
    scene_path: z
      .string()
      .optional()
      .describe('Scene to run (run only, optional)'),
    clear: z
      .boolean()
      .optional()
      .describe('Clear output buffer after reading (get_debug_output only)'),
    viewport: z
      .enum(['2d', '3d'])
      .optional()
      .describe('Which editor viewport to capture (screenshot_editor only)'),
    max_width: z
      .number()
      .optional()
      .describe('Maximum width in pixels for screenshot (screenshot_game, screenshot_editor)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'select':
          return !!data.node_path;
        default:
          return true;
      }
    },
    { message: 'select action requires node_path' }
  );

type EditorArgs = z.infer<typeof EditorSchema>;

export const editor = defineTool({
  name: 'editor',
  description:
    'Control the Godot editor: get state, manage selection, run/stop project, get debug output, capture screenshots',
  schema: EditorSchema,
  async execute(args: EditorArgs, { godot }) {
    switch (args.action) {
      case 'get_state': {
        const result = await godot.sendCommand<{
          current_scene: string | null;
          is_playing: boolean;
          godot_version: string;
        }>('get_editor_state');
        return JSON.stringify(result, null, 2);
      }

      case 'get_selection': {
        const result = await godot.sendCommand<{ selected: string[] }>(
          'get_selected_nodes'
        );
        if (result.selected.length === 0) {
          return 'No nodes selected';
        }
        return `Selected nodes:\n${result.selected.map((p) => `  - ${p}`).join('\n')}`;
      }

      case 'select': {
        await godot.sendCommand('select_node', { node_path: args.node_path });
        return `Selected node: ${args.node_path}`;
      }

      case 'run': {
        await godot.sendCommand('run_project', { scene_path: args.scene_path });
        return args.scene_path ? `Running scene: ${args.scene_path}` : 'Running project';
      }

      case 'stop': {
        await godot.sendCommand('stop_project');
        return 'Stopped project';
      }

      case 'get_debug_output': {
        const result = await godot.sendCommand<{ output: string }>(
          'get_debug_output',
          { clear: args.clear ?? false }
        );
        if (!result.output || result.output.trim() === '') {
          return 'No debug output';
        }
        return `Debug output:\n\`\`\`\n${result.output}\n\`\`\``;
      }

      case 'screenshot_game': {
        const result = await godot.sendCommand<ScreenshotResponse>(
          'capture_game_screenshot',
          { max_width: args.max_width }
        );
        return toImageContent(result.image_base64);
      }

      case 'screenshot_editor': {
        const result = await godot.sendCommand<ScreenshotResponse>(
          'capture_editor_screenshot',
          { viewport: args.viewport, max_width: args.max_width }
        );
        return toImageContent(result.image_base64);
      }
    }
  },
});

export const editorTools = [editor] as AnyToolDefinition[];
