import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const getEditorState = defineTool({
  name: 'get_editor_state',
  description: 'Get the current state of the Godot editor',
  schema: z.object({}),
  async execute(_, { godot }) {
    const result = await godot.sendCommand<{
      current_scene: string | null;
      is_playing: boolean;
      godot_version: string;
    }>('get_editor_state');
    return JSON.stringify(result, null, 2);
  },
});

export const getSelectedNodes = defineTool({
  name: 'get_selected_nodes',
  description: 'Get the currently selected nodes in the editor',
  schema: z.object({}),
  async execute(_, { godot }) {
    const result = await godot.sendCommand<{ selected: string[] }>(
      'get_selected_nodes'
    );
    if (result.selected.length === 0) {
      return 'No nodes selected';
    }
    return `Selected nodes:\n${result.selected.map((p) => `  - ${p}`).join('\n')}`;
  },
});

export const selectNode = defineTool({
  name: 'select_node',
  description: 'Select a node in the editor',
  schema: z.object({
    node_path: z.string().describe('Path to the node to select'),
  }),
  async execute({ node_path }, { godot }) {
    await godot.sendCommand('select_node', { node_path });
    return `Selected node: ${node_path}`;
  },
});

export const runProject = defineTool({
  name: 'run_project',
  description: 'Run the current Godot project',
  schema: z.object({
    scene_path: z
      .string()
      .optional()
      .describe('Optional specific scene to run (defaults to main scene)'),
  }),
  async execute({ scene_path }, { godot }) {
    await godot.sendCommand('run_project', { scene_path });
    return scene_path ? `Running scene: ${scene_path}` : 'Running project';
  },
});

export const stopProject = defineTool({
  name: 'stop_project',
  description: 'Stop the running Godot project',
  schema: z.object({}),
  async execute(_, { godot }) {
    await godot.sendCommand('stop_project');
    return 'Stopped project';
  },
});

export const getDebugOutput = defineTool({
  name: 'get_debug_output',
  description: 'Get debug output/print statements from the running project',
  schema: z.object({
    clear: z
      .boolean()
      .optional()
      .describe('Whether to clear the output buffer after reading'),
  }),
  async execute({ clear }, { godot }) {
    const result = await godot.sendCommand<{ output: string }>(
      'get_debug_output',
      { clear: clear ?? false }
    );
    if (!result.output || result.output.trim() === '') {
      return 'No debug output';
    }
    return `Debug output:\n\`\`\`\n${result.output}\n\`\`\``;
  },
});

export const editorTools = [
  getEditorState,
  getSelectedNodes,
  selectNode,
  runProject,
  stopProject,
  getDebugOutput,
] as AnyToolDefinition[];
