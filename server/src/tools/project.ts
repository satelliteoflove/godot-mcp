import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const getProjectInfo = defineTool({
  name: 'get_project_info',
  description: 'Get information about the current Godot project',
  schema: z.object({}),
  async execute(_, { godot }) {
    const result = await godot.sendCommand<{
      name: string;
      path: string;
      godot_version: string;
      main_scene: string | null;
    }>('get_project_info');
    return JSON.stringify(result, null, 2);
  },
});

export const listProjectFiles = defineTool({
  name: 'list_project_files',
  description: 'List files in the project by type',
  schema: z.object({
    file_type: z
      .enum(['scripts', 'scenes', 'resources', 'images', 'audio', 'all'])
      .describe('Type of files to list'),
    directory: z
      .string()
      .optional()
      .describe('Optional directory to search in (defaults to "res://")'),
    recursive: z
      .boolean()
      .optional()
      .describe('Whether to search recursively (defaults to true)'),
  }),
  async execute({ file_type, directory, recursive }, { godot }) {
    const result = await godot.sendCommand<{ files: string[] }>(
      'list_project_files',
      {
        file_type,
        directory: directory ?? 'res://',
        recursive: recursive ?? true,
      }
    );

    if (result.files.length === 0) {
      return `No ${file_type} files found`;
    }

    return `Found ${result.files.length} ${file_type} file(s):\n${result.files.map((f) => `  - ${f}`).join('\n')}`;
  },
});

export const searchFiles = defineTool({
  name: 'search_files',
  description: 'Search for files by name pattern',
  schema: z.object({
    pattern: z.string().describe('Search pattern (supports * wildcard)'),
    directory: z.string().optional().describe('Optional directory to search in'),
  }),
  async execute({ pattern, directory }, { godot }) {
    const result = await godot.sendCommand<{ files: string[] }>('search_files', {
      pattern,
      directory: directory ?? 'res://',
    });

    if (result.files.length === 0) {
      return `No files matching "${pattern}" found`;
    }

    return `Found ${result.files.length} file(s) matching "${pattern}":\n${result.files.map((f) => `  - ${f}`).join('\n')}`;
  },
});

export const getProjectSettings = defineTool({
  name: 'get_project_settings',
  description: 'Get project settings',
  schema: z.object({
    category: z
      .string()
      .optional()
      .describe(
        'Settings category to filter by (use "input" for input action mappings)'
      ),
    include_builtin: z
      .boolean()
      .optional()
      .describe(
        'When category is "input", include built-in ui_* actions (default: false)'
      ),
  }),
  async execute({ category, include_builtin }, { godot }) {
    const result = await godot.sendCommand<{
      settings: Record<string, unknown>;
    }>('get_project_settings', { category, include_builtin });
    return JSON.stringify(result.settings, null, 2);
  },
});

export const projectTools = [
  getProjectInfo,
  listProjectFiles,
  searchFiles,
  getProjectSettings,
] as AnyToolDefinition[];
