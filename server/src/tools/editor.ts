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
  .object({
    action: z
      .enum(['get_state', 'get_selection', 'select', 'run', 'stop', 'get_debug_output', 'get_errors', 'get_stack_trace', 'get_performance', 'screenshot_game', 'screenshot_editor', 'set_viewport_2d'])
      .describe('Action: get_state, get_selection, select, run, stop, get_debug_output, get_errors, get_stack_trace, get_performance, screenshot_game, screenshot_editor, set_viewport_2d'),
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
      .describe('Clear buffer after reading (get_debug_output, get_errors)'),
    source: z
      .enum(['editor', 'game'])
      .optional()
      .describe('Output source: "editor" for editor panel messages (script errors, loading failures), "game" for running game output. If omitted, returns game output when running, else editor output.'),
    viewport: z
      .enum(['2d', '3d'])
      .optional()
      .describe('Which editor viewport to capture (screenshot_editor only)'),
    max_width: z
      .number()
      .optional()
      .describe('Maximum width in pixels for screenshot (screenshot_game, screenshot_editor)'),
    center_x: z
      .number()
      .optional()
      .describe('X coordinate to center the 2D viewport on (set_viewport_2d only)'),
    center_y: z
      .number()
      .optional()
      .describe('Y coordinate to center the 2D viewport on (set_viewport_2d only)'),
    zoom: z
      .number()
      .positive()
      .optional()
      .describe('Zoom level for 2D viewport, e.g. 1.0 = 100%, 2.0 = 200% (set_viewport_2d only)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'select':
          return !!data.node_path;
        case 'set_viewport_2d':
          return data.center_x !== undefined || data.center_y !== undefined || data.zoom !== undefined;
        default:
          return true;
      }
    },
    { message: 'select requires node_path; set_viewport_2d requires at least one of center_x, center_y, or zoom' }
  );

type EditorArgs = z.infer<typeof EditorSchema>;

export const editor = defineTool({
  name: 'editor',
  description:
    'Control the Godot editor: get state (includes viewport/camera info), manage selection, run/stop project, get debug output, get_errors (structured errors with file:line), get_stack_trace (backtrace from last error), get performance metrics, capture screenshots, set 2D viewport position/zoom',
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
        const result = await godot.sendCommand<{ output: string; source: string }>(
          'get_debug_output',
          { clear: args.clear ?? false, source: args.source }
        );
        if (!result.output || result.output.trim() === '') {
          return `No ${result.source ?? 'debug'} output`;
        }
        const label = result.source === 'editor' ? 'Editor' : result.source === 'game' ? 'Game' : 'Debug';
        return `${label} output:\n\`\`\`\n${result.output}\n\`\`\``;
      }

      case 'get_errors': {
        const result = await godot.sendCommand<{
          error_count: number;
          errors: Array<{
            timestamp: number;
            type: string;
            message: string;
            file: string;
            line: number;
            function: string;
            error_type: number;
            frames: Array<{ file: string; line: number; function: string }>;
          }>;
        }>('get_errors', { clear: args.clear ?? false });
        if (result.error_count === 0) {
          return 'No errors';
        }
        return JSON.stringify(result, null, 2);
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
        return JSON.stringify(result, null, 2);
      }

      case 'get_performance': {
        const result = await godot.sendCommand<{
          fps: number;
          frame_time_ms: number;
          physics_time_ms: number;
          navigation_time_ms: number;
          render_objects: number;
          render_draw_calls: number;
          render_primitives: number;
          physics_2d_active_objects: number;
          physics_2d_collision_pairs: number;
          physics_2d_island_count: number;
          object_count: number;
          object_resource_count: number;
          object_node_count: number;
          object_orphan_node_count: number;
          memory_static: number;
          memory_static_max: number;
        }>('get_performance_metrics');
        return JSON.stringify(result, null, 2);
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
