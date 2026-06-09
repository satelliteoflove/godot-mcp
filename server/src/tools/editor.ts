import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
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
      frozen: z
        .boolean()
        .optional()
        .describe('Launch with game time frozen from frame 0 (gameplay never starts racing your latency). Use godot_game_time step/thaw to advance.'),
    }),
    z.object({ action: z.literal('stop').describe('Stop the running project') }),
    z.object({
      action: z
        .literal('restart')
        .describe(
          'Restart the editor, reloading project.godot (autoloads, input map), addon code, and plugins from disk. Use after external edits the running editor would otherwise keep stale. Fire-and-forget: the bridge drops and auto-reconnects within a few seconds. Does not start a cold editor - the editor must already be running.'
        ),
      save: z
        .boolean()
        .optional()
        .describe('Save the project before restarting (default: true). Set false to discard unsaved editor changes.'),
    }),
    z.object({
      action: z
        .literal('get_log_messages')
        .describe(
          'Get errors and warnings from the EDITOR process - @tool script runtime errors, import failures, addon errors, and failures from editor-side operations (scene/resource edits, reloads). This is the feedback channel for editor-side changes: run it after a mutation to confirm it did not break the editor. It does NOT include errors from the running game - for those, use minimal-godot-mcp\'s get_console_output (game console via DAP). Filter by severity (errors-only = "did my change break the editor?") and use `since`/`cursor` to read only what is new; every response returns the current `cursor`, even when empty.'
        ),
      clear: z.boolean().optional().describe('Clear the editor error buffer after reading'),
      limit: z.number().int().positive().optional().describe('Maximum number of messages to return (default: 50)'),
      severity: z
        .enum(['all', 'error', 'warning'])
        .optional()
        .describe('Filter by severity: "error" drops warnings (the "did anything actually break?" check), "warning" returns only warnings, "all" (default) returns both.'),
      since: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Return only messages newer than this cursor. Pass back the `cursor` from a prior response to see just what is new since then - the incremental check that avoids re-reading the whole buffer (0/omitted = from the beginning).'),
    }),
    z.object({ action: z.literal('get_stack_trace').describe('Get the most recent error stack trace') }),
    z.object({
      action: z.literal('screenshot_game').describe('Capture a lossless PNG screenshot of the running game'),
      max_width: z.number().int().optional().describe('Maximum width in pixels (default: 900). Resolution is the vision-token cost lever (~width*height/750); lower it to spend less context.'),
    }),
    z.object({
      action: z.literal('screenshot_editor').describe('Capture a lossless PNG screenshot of an editor viewport'),
      viewport: z.enum(['2d', '3d']).optional().describe('Which editor viewport to capture'),
      max_width: z.number().int().optional().describe('Maximum width in pixels (default: 900). Resolution is the vision-token cost lever (~width*height/750); lower it to spend less context.'),
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
  total_count: number; // everything in the buffer, before filtering
  match_count: number; // matched the severity/since filters, before the limit
  returned_count: number; // after the limit
  cursor: number; // highest seq issued so far; pass back as `since` for an incremental read
  messages: LogMessage[];
}

export const editor = defineTool({
  name: 'godot_editor',
  annotations: { title: 'Editor Control', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Control the Godot editor: get state, manage selection, run/stop project, restart the editor, capture screenshots, read log messages and stack traces, control 2D viewport',
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
        return structured(result);
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
        await godot.sendCommand('run_project', { scene_path: args.scene_path, frozen: args.frozen });
        const target = args.scene_path ? `scene: ${args.scene_path}` : 'project';
        return args.frozen
          ? `Running ${target} frozen from frame 0 — use godot_game_time step/thaw to advance`
          : `Running ${target}`;
      }

      case 'stop': {
        await godot.sendCommand('stop_project');
        return 'Stopped project';
      }

      case 'restart': {
        const save = args.save ?? true;
        // Restarting tears down the bridge, so this is fire-and-forget: send the
        // request and tolerate the connection dropping before the ack returns.
        // The connection auto-reconnects once the editor is back. A drop here is
        // the expected outcome; anything else (not connected to begin with, or an
        // older addon that doesn't know the command) is a real failure.
        try {
          await godot.sendCommand('restart_editor', { save });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (!message.includes('Connection closed')) {
            throw err;
          }
        }
        return `Editor is restarting${save ? ' (project saved first)' : ' without saving'}. The bridge reconnects automatically in a few seconds - retry your next command then.`;
      }

      case 'get_log_messages': {
        const result = await godot.sendCommand<LogMessagesResponse>(
          'get_log_messages',
          {
            clear: args.clear ?? false,
            limit: args.limit ?? 50,
            severity: args.severity ?? 'all',
            since: args.since ?? 0,
          }
        );
        if (result.returned_count === 0) {
          // Nothing matched - but always hand back the cursor so the caller can
          // start (or continue) incremental reads from here. Without it, the
          // common "first check after a clean run" case would have no cursor to
          // poll from and would fall back to re-reading the whole buffer.
          const sev = args.severity && args.severity !== 'all' ? `${args.severity} ` : '';
          return args.since !== undefined
            ? `No new ${sev}messages since cursor ${result.cursor}.`
            : `No ${sev}messages (cursor ${result.cursor}).`;
        }
        return structured(result);
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
        return structured(result);
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
