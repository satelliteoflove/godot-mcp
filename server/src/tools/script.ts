import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const getScript = defineTool({
  name: 'get_script',
  description: 'Get the content of a GDScript file',
  schema: z.object({
    script_path: z
      .string()
      .describe('Path to the script file (e.g., "res://scripts/player.gd")'),
  }),
  async execute({ script_path }, { godot }) {
    const result = await godot.sendCommand<{ content: string }>('read_script', {
      script_path,
    });
    return `# ${script_path}\n\n\`\`\`gdscript\n${result.content}\n\`\`\``;
  },
});

export const createScript = defineTool({
  name: 'create_script',
  description: 'Create a new GDScript file',
  schema: z.object({
    script_path: z
      .string()
      .describe('Path for the new script (e.g., "res://scripts/enemy.gd")'),
    content: z.string().describe('Content of the script'),
    attach_to: z
      .string()
      .optional()
      .describe('Optional node path to attach the script to'),
  }),
  async execute({ script_path, content, attach_to }, { godot }) {
    await godot.sendCommand('create_script', {
      script_path,
      content,
      attach_to,
    });
    let message = `Created script: ${script_path}`;
    if (attach_to) {
      message += ` (attached to ${attach_to})`;
    }
    return message;
  },
});

export const editScript = defineTool({
  name: 'edit_script',
  description: 'Replace the content of an existing GDScript file',
  schema: z.object({
    script_path: z.string().describe('Path to the script file'),
    content: z.string().describe('New content for the script'),
  }),
  async execute({ script_path, content }, { godot }) {
    await godot.sendCommand('edit_script', { script_path, content });
    return `Updated script: ${script_path}`;
  },
});

export const attachScript = defineTool({
  name: 'attach_script',
  description: 'Attach an existing script to a node',
  schema: z.object({
    node_path: z.string().describe('Path to the node'),
    script_path: z.string().describe('Path to the script file'),
  }),
  async execute({ node_path, script_path }, { godot }) {
    await godot.sendCommand('attach_script', { node_path, script_path });
    return `Attached ${script_path} to ${node_path}`;
  },
});

export const detachScript = defineTool({
  name: 'detach_script',
  description: 'Remove the script from a node',
  schema: z.object({
    node_path: z.string().describe('Path to the node'),
  }),
  async execute({ node_path }, { godot }) {
    await godot.sendCommand('detach_script', { node_path });
    return `Detached script from ${node_path}`;
  },
});

export const scriptTools = [
  getScript,
  createScript,
  editScript,
  attachScript,
  detachScript,
] as AnyToolDefinition[];
