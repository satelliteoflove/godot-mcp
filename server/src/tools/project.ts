import { z } from 'zod';
import { getGodotConnection } from '../connection/websocket.js';
import { formatError } from '../utils/errors.js';

export const projectTools = [
  {
    name: 'get_project_info',
    description: 'Get information about the current Godot project',
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_project_files',
    description: 'List files in the project by type',
    inputSchema: {
      type: 'object' as const,
      properties: {
        file_type: {
          type: 'string',
          enum: ['scripts', 'scenes', 'resources', 'images', 'audio', 'all'],
          description: 'Type of files to list',
        },
        directory: {
          type: 'string',
          description: 'Optional directory to search in (defaults to "res://")',
        },
        recursive: {
          type: 'boolean',
          description: 'Whether to search recursively (defaults to true)',
        },
      },
      required: ['file_type'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for files by name pattern',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Search pattern (supports * wildcard)',
        },
        directory: {
          type: 'string',
          description: 'Optional directory to search in',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'get_project_settings',
    description: 'Get project settings',
    inputSchema: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Optional settings category to filter by',
        },
      },
      required: [],
    },
  },
];

const GetProjectInfoSchema = z.object({});

const ListProjectFilesSchema = z.object({
  file_type: z.enum(['scripts', 'scenes', 'resources', 'images', 'audio', 'all']),
  directory: z.string().optional(),
  recursive: z.boolean().optional(),
});

const SearchFilesSchema = z.object({
  pattern: z.string(),
  directory: z.string().optional(),
});

const GetProjectSettingsSchema = z.object({
  category: z.string().optional(),
});

export async function handleProjectTool(name: string, args: Record<string, unknown>): Promise<string> {
  const godot = getGodotConnection();

  try {
    switch (name) {
      case 'get_project_info': {
        GetProjectInfoSchema.parse(args);
        const result = await godot.sendCommand<{
          name: string;
          path: string;
          godot_version: string;
          main_scene: string | null;
        }>('get_project_info');
        return JSON.stringify(result, null, 2);
      }

      case 'list_project_files': {
        const { file_type, directory, recursive } = ListProjectFilesSchema.parse(args);
        const result = await godot.sendCommand<{ files: string[] }>('list_project_files', {
          file_type,
          directory: directory ?? 'res://',
          recursive: recursive ?? true,
        });

        if (result.files.length === 0) {
          return `No ${file_type} files found`;
        }

        return `Found ${result.files.length} ${file_type} file(s):\n${result.files.map(f => `  - ${f}`).join('\n')}`;
      }

      case 'search_files': {
        const { pattern, directory } = SearchFilesSchema.parse(args);
        const result = await godot.sendCommand<{ files: string[] }>('search_files', {
          pattern,
          directory: directory ?? 'res://',
        });

        if (result.files.length === 0) {
          return `No files matching "${pattern}" found`;
        }

        return `Found ${result.files.length} file(s) matching "${pattern}":\n${result.files.map(f => `  - ${f}`).join('\n')}`;
      }

      case 'get_project_settings': {
        const { category } = GetProjectSettingsSchema.parse(args);
        const result = await godot.sendCommand<{ settings: Record<string, unknown> }>(
          'get_project_settings',
          { category }
        );
        return JSON.stringify(result.settings, null, 2);
      }

      default:
        throw new Error(`Unknown project tool: ${name}`);
    }
  } catch (error) {
    throw new Error(formatError(error));
  }
}
