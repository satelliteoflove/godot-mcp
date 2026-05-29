import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition, ImageContent, Vector3 } from '../core/types.js';

interface ScreenshotResponse {
  image_base64: string;
  width: number;
  height: number;
}

interface CameraInfo {
  position: Vector3;
  rotation: Vector3;
  forward: Vector3;
  fov: number;
  near: number;
  far: number;
  projection: string;
  size?: number;
}

interface Viewport2DInfo {
  center: { x: number; y: number };
  zoom: number;
  size: { width: number; height: number };
}

function toImageContent(base64: string): ImageContent {
  return {
    type: 'image',
    data: base64,
    mimeType: 'image/png',
  };
}

const EditorSchema = z
  .discriminatedUnion('action', [
    z.object({ action: z.literal('get_state').describe('Get editor state: current scene, play state, version, camera, viewport') }),
    z.object({ action: z.literal('get_selection').describe('Get the currently selected nodes') }),
    z.object({
      action: z.literal('select').describe('Select a node in the editor'),
      node_path: z.string().describe('Path to node to select'),
    }),
    z.object({
      action: z.literal('run').describe('Run the project'),
      scene_path: z.string().optional().describe('Scene to run (optional, defaults to main scene)'),
    }),
    z.object({ action: z.literal('stop').describe('Stop the running project') }),
    z.object({
      action: z.literal('get_log_messages').describe('Get editor/game log messages'),
      clear: z.boolean().optional().describe('Clear buffer after reading'),
      limit: z.number().int().positive().optional().describe('Maximum number of messages to return (default: 50)'),
    }),
    z.object({ action: z.literal('get_stack_trace').describe('Get the most recent error stack trace') }),
    z.object({
      action: z.literal('screenshot_game').describe('Capture a screenshot of the running game'),
      max_width: z.number().optional().describe('Maximum width in pixels for the screenshot'),
    }),
    z.object({
      action: z.literal('screenshot_editor').describe('Capture a screenshot of an editor viewport'),
      viewport: z.enum(['2d', '3d']).optional().describe('Which editor viewport to capture'),
      max_width: z.number().optional().describe('Maximum width in pixels for the screenshot'),
    }),
    z.object({
      action: z.literal('set_viewport_2d').describe('Center and zoom the 2D editor viewport'),
      center_x: z.number().optional().describe('X coordinate to center the 2D viewport on'),
      center_y: z.number().optional().describe('Y coordinate to center the 2D viewport on'),
      zoom: z.number().positive().optional().describe('Zoom level, e.g. 1.0 = 100%, 2.0 = 200%'),
    }),
  ])
  // Constraint a discriminated union can't express on its own, so it lives here:
  .refine(
    (data) =>
      data.action === 'set_viewport_2d'
        ? data.center_x !== undefined || data.center_y !== undefined || data.zoom !== undefined
        : true,
    { message: 'set_viewport_2d requires at least one of center_x, center_y, or zoom' }
  );

type EditorArgs = z.infer<typeof EditorSchema>;

interface LogMessage {
  timestamp: number;
  type: string;
  message: string;
  file: string;
  line: number;
  function: string;
  error_type: number; // 0=error, 1=warning (push_warning), 2=script, 3=shader
  frames: Array<{ file: string; line: number; function: string }>;
}

interface LogMessagesResponse {
  total_count: number;
  returned_count: number;
  messages: LogMessage[];
}

export const editor = defineTool({
  name: 'godot_editor',
  annotations: { title: 'Editor Control', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Control the Godot editor: get state, manage selection, run/stop project, capture screenshots, read log messages and stack traces, control 2D viewport',
  schema: EditorSchema,
  async execute(args: EditorArgs, { godot }) {
    switch (args.action) {
      case 'get_state': {
        const result = await godot.sendCommand<{
          current_scene: string | null;
          is_playing: boolean;
          godot_version: string;
          open_scenes: string[];
          main_screen: string;
          camera?: CameraInfo;
          viewport_2d?: Viewport2DInfo;
        }>('get_editor_state');
        return JSON.stringify(result);
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

      case 'get_log_messages': {
        const result = await godot.sendCommand<LogMessagesResponse>(
          'get_log_messages',
          {
            clear: args.clear ?? false,
            limit: args.limit ?? 50,
          }
        );
        if (result.returned_count === 0) {
          return 'No log messages';
        }
        return JSON.stringify(result);
      }

      case 'get_stack_trace': {
        const result = await godot.sendCommand<{
          error: string;
          error_type: string;
          file: string;
          line: number;
          frames: Array<{ file: string; line: number; function: string }>;
        }>('get_stack_trace');
        if (!result.error && result.frames.length === 0) {
          return 'No stack trace available';
        }
        return JSON.stringify(result);
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

      case 'set_viewport_2d': {
        const result = await godot.sendCommand<{
          center: { x: number; y: number };
          zoom: number;
        }>('set_2d_viewport', {
          center_x: args.center_x ?? 0,
          center_y: args.center_y ?? 0,
          zoom: args.zoom ?? 1.0,
        });
        return `2D viewport set to center (${result.center.x.toFixed(1)}, ${result.center.y.toFixed(1)}) at ${result.zoom.toFixed(2)}x zoom`;
      }
    }
  },
});

export const editorTools = [editor] as AnyToolDefinition[];
