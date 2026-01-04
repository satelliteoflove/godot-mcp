import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';
import { getServerVersion } from '../version.js';

const ProjectSchema = z.object({
  action: z
    .enum(['get_info', 'get_settings', 'addon_status'])
    .describe('Action: get_info, get_settings, addon_status (check addon/server version compatibility)'),
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

      case 'addon_status': {
        const serverVersion = getServerVersion();

        if (!godot.isConnected) {
          return JSON.stringify(
            {
              connected: false,
              server_version: serverVersion,
              recommendation:
                'Not connected to Godot. Ask user for their project path, then install with: npx @satelliteoflove/godot-mcp --install-addon <path>',
            },
            null,
            2
          );
        }

        const addonVersion = godot.addonVersion;
        const projectPath = godot.projectPath;
        const versionsMatch = godot.versionsMatch;

        return JSON.stringify(
          {
            connected: true,
            server_version: serverVersion,
            addon_version: addonVersion ?? 'unknown',
            versions_match: versionsMatch,
            project_path: projectPath,
            project_name: godot.projectName,
            godot_version: godot.godotVersion,
            recommendation: versionsMatch
              ? null
              : `Version mismatch. Close Godot and run: npx @satelliteoflove/godot-mcp --install-addon "${projectPath}"`,
          },
          null,
          2
        );
      }
    }
  },
});

export const projectTools = [project] as AnyToolDefinition[];
