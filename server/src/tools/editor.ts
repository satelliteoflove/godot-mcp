import { z } from 'zod';
import { getGodotConnection } from '../connection/websocket.js';
import { formatError } from '../utils/errors.js';

export const editorTools = [
  {
    name: 'get_editor_state',
    description: 'Get the current state of the Godot editor',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_selected_nodes',
    description: 'Get the currently selected nodes in the editor',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'select_node',
    description: 'Select a node in the editor',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node to select',
        },
      },
      required: ['node_path'],
    },
  },
  {
    name: 'run_project',
    description: 'Run the current Godot project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        scene_path: {
          type: 'string',
          description: 'Optional specific scene to run (defaults to main scene)',
        },
      },
      required: [],
    },
  },
  {
    name: 'stop_project',
    description: 'Stop the running Godot project',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_debug_output',
    description: 'Get debug output/print statements from the running project',
    inputSchema: {
      type: 'object' as const,
      properties: {
        clear: {
          type: 'boolean',
          description: 'Whether to clear the output buffer after reading',
        },
      },
      required: [],
    },
  },
];

const GetEditorStateSchema = z.object({});

const GetSelectedNodesSchema = z.object({});

const SelectNodeSchema = z.object({
  node_path: z.string(),
});

const RunProjectSchema = z.object({
  scene_path: z.string().optional(),
});

const StopProjectSchema = z.object({});

const GetDebugOutputSchema = z.object({
  clear: z.boolean().optional(),
});

export async function handleEditorTool(name: string, args: Record<string, unknown>): Promise<string> {
  const godot = getGodotConnection();

  try {
    switch (name) {
      case 'get_editor_state': {
        GetEditorStateSchema.parse(args);
        const result = await godot.sendCommand<{
          current_scene: string | null;
          is_playing: boolean;
          godot_version: string;
        }>('get_editor_state');
        return JSON.stringify(result, null, 2);
      }

      case 'get_selected_nodes': {
        GetSelectedNodesSchema.parse(args);
        const result = await godot.sendCommand<{ selected: string[] }>('get_selected_nodes');
        if (result.selected.length === 0) {
          return 'No nodes selected';
        }
        return `Selected nodes:\n${result.selected.map(p => `  - ${p}`).join('\n')}`;
      }

      case 'select_node': {
        const { node_path } = SelectNodeSchema.parse(args);
        await godot.sendCommand('select_node', { node_path });
        return `Selected node: ${node_path}`;
      }

      case 'run_project': {
        const { scene_path } = RunProjectSchema.parse(args);
        await godot.sendCommand('run_project', { scene_path });
        return scene_path ? `Running scene: ${scene_path}` : 'Running project';
      }

      case 'stop_project': {
        StopProjectSchema.parse(args);
        await godot.sendCommand('stop_project');
        return 'Stopped project';
      }

      case 'get_debug_output': {
        const { clear } = GetDebugOutputSchema.parse(args);
        const result = await godot.sendCommand<{ output: string }>('get_debug_output', {
          clear: clear ?? false,
        });
        if (!result.output || result.output.trim() === '') {
          return 'No debug output';
        }
        return `Debug output:\n\`\`\`\n${result.output}\n\`\`\``;
      }

      default:
        throw new Error(`Unknown editor tool: ${name}`);
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}
