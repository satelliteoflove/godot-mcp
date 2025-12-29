import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const ProjectSchema = z.object({
  action: z
    .enum(['get_info', 'get_settings'])
    .describe('Action: get_info, get_settings'),
  category: z
    .string()
    .optional()
    .describe('Settings category to filter by (get_settings only, use "input" for input mappings)'),
  include_builtin: z
    .boolean()
    .optional()
    .describe('Include built-in ui_* actions (get_settings with category="input" only)'),
});

type ProjectArgs = z.infer<typeof ProjectSchema>;

export const project = defineTool({
  name: 'project',
  description: 'Get project information and settings',
  schema: ProjectSchema,
  async execute(args: ProjectArgs, { godot }) {
    switch (args.action) {
      case 'get_info': {
        const result = await godot.sendCommand<{
          name: string;
          path: string;
          godot_version: string;
          main_scene: string | null;
        }>('get_project_info');
        return JSON.stringify(result, null, 2);
      }

      case 'get_settings': {
        const result = await godot.sendCommand<{
          settings: Record<string, unknown>;
        }>('get_project_settings', {
          category: args.category,
          include_builtin: args.include_builtin,
        });
        return JSON.stringify(result.settings, null, 2);
      }
    }
  },
});

export const projectTools = [project] as AnyToolDefinition[];
