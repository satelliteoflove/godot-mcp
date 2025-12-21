import { z } from 'zod';
import { getGodotConnection } from '../connection/websocket.js';
import { formatError } from '../utils/errors.js';

export const scriptTools = [
  {
    name: 'get_script',
    description: 'Get the content of a GDScript file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        script_path: {
          type: 'string',
          description: 'Path to the script file (e.g., "res://scripts/player.gd")',
        },
      },
      required: ['script_path'],
    },
  },
  {
    name: 'create_script',
    description: 'Create a new GDScript file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        script_path: {
          type: 'string',
          description: 'Path for the new script (e.g., "res://scripts/enemy.gd")',
        },
        content: {
          type: 'string',
          description: 'Content of the script',
        },
        attach_to: {
          type: 'string',
          description: 'Optional node path to attach the script to',
        },
      },
      required: ['script_path', 'content'],
    },
  },
  {
    name: 'edit_script',
    description: 'Replace the content of an existing GDScript file',
    inputSchema: {
      type: 'object' as const,
      properties: {
        script_path: {
          type: 'string',
          description: 'Path to the script file',
        },
        content: {
          type: 'string',
          description: 'New content for the script',
        },
      },
      required: ['script_path', 'content'],
    },
  },
  {
    name: 'attach_script',
    description: 'Attach an existing script to a node',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node',
        },
        script_path: {
          type: 'string',
          description: 'Path to the script file',
        },
      },
      required: ['node_path', 'script_path'],
    },
  },
  {
    name: 'detach_script',
    description: 'Remove the script from a node',
    inputSchema: {
      type: 'object' as const,
      properties: {
        node_path: {
          type: 'string',
          description: 'Path to the node',
        },
      },
      required: ['node_path'],
    },
  },
];

const GetScriptSchema = z.object({
  script_path: z.string(),
});

const CreateScriptSchema = z.object({
  script_path: z.string(),
  content: z.string(),
  attach_to: z.string().optional(),
});

const EditScriptSchema = z.object({
  script_path: z.string(),
  content: z.string(),
});

const AttachScriptSchema = z.object({
  node_path: z.string(),
  script_path: z.string(),
});

const DetachScriptSchema = z.object({
  node_path: z.string(),
});

export async function handleScriptTool(name: string, args: Record<string, unknown>): Promise<string> {
  const godot = getGodotConnection();

  try {
    switch (name) {
      case 'get_script': {
        const { script_path } = GetScriptSchema.parse(args);
        const result = await godot.sendCommand<{ content: string }>('get_script', { script_path });
        return `# ${script_path}\n\n\`\`\`gdscript\n${result.content}\n\`\`\``;
      }

      case 'create_script': {
        const { script_path, content, attach_to } = CreateScriptSchema.parse(args);
        await godot.sendCommand('create_script', { script_path, content, attach_to });
        let message = `Created script: ${script_path}`;
        if (attach_to) {
          message += ` (attached to ${attach_to})`;
        }
        return message;
      }

      case 'edit_script': {
        const { script_path, content } = EditScriptSchema.parse(args);
        await godot.sendCommand('edit_script', { script_path, content });
        return `Updated script: ${script_path}`;
      }

      case 'attach_script': {
        const { node_path, script_path } = AttachScriptSchema.parse(args);
        await godot.sendCommand('attach_script', { node_path, script_path });
        return `Attached ${script_path} to ${node_path}`;
      }

      case 'detach_script': {
        const { node_path } = DetachScriptSchema.parse(args);
        await godot.sendCommand('detach_script', { node_path });
        return `Detached script from ${node_path}`;
      }

      default:
        throw new Error(`Unknown script tool: ${name}`);
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}
