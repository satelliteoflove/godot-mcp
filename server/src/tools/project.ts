import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import { staleAdvisory, type ProjectStaleness } from '../utils/project-staleness.js';
import type { AnyToolDefinition } from '../core/types.js';
import { getServerVersion } from '../version.js';

const ProjectSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('get_info').describe('Get project name, path, version, and main scene'),
  }),
  z.object({
    action: z.literal('get_settings').describe('Get project settings'),
    category: z
      .string()
      .optional()
      .describe('Settings category to filter by (use "input" for input mappings)'),
    include_builtin: z
      .boolean()
      .optional()
      .describe('Include built-in ui_* actions (with category="input")'),
  }),
  z.object({
    action: z.literal('addon_status').describe('Check addon/server version compatibility'),
  }),
  z.object({
    action: z
      .literal('check_stale')
      .describe(
        'Check whether project.godot was edited on disk after the editor loaded it, leaving the ' +
        'editor with stale autoloads / input map (and phantom "Identifier not found" errors in its ' +
        'log that do not exist at runtime). Returns the disk-vs-editor divergence; run ' +
        'godot_editor_edit restart to reload. Useful right after editing project.godot as a file.'
      ),
  }),
]);

type ProjectArgs = z.infer<typeof ProjectSchema>;

export const project = defineTool({
  name: 'godot_project',
  annotations: { title: 'Project Info', readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  description:
    'Read project-level data from the editor: name, path, Godot version, and main scene (get_info), plus project settings including input mappings (get_settings). After editing project.godot as a file, use check_stale to detect whether the editor is still running stale autoloads or input map from before the edit; restart via godot_editor_edit to reload. Use addon_status to diagnose addon/server version skew when commands misbehave or the connection drops. For scene contents or node properties, use godot_node_read instead.',
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
        return structured(result);
      }

      case 'get_settings': {
        const result = await godot.sendCommand<{
          settings: Record<string, unknown>;
        }>('get_project_settings', {
          category: args.category,
          include_builtin: args.include_builtin,
        });
        return structured(result.settings);
      }

      case 'addon_status': {
        const serverVersion = getServerVersion();

        if (!godot.isConnected) {
          return structured(
            {
              connected: false,
              server_version: serverVersion,
              recommendation:
                'Not connected to Godot. Ask user for their project path, then install with: npx @satelliteoflove/godot-mcp --install-addon <path>',
            }
          );
        }

        const addonVersion = godot.addonVersion;
        const projectPath = godot.projectPath;
        const versionsMatch = godot.versionsMatch;

        return structured(
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
          }
        );
      }

      case 'check_stale': {
        const result = await godot.sendCommand<ProjectStaleness>('get_project_staleness');
        const advisory = staleAdvisory(result);
        return advisory ? structured({ ...result, advisory }) : structured(result);
      }
    }
  },
});

export const projectTools = [project] as AnyToolDefinition[];
