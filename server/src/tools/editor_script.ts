import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const EditorScriptSchema = z.object({
  code: z
    .string()
    .describe(
      'GDScript code to execute in the editor context. Write only the body statements — ' +
        'do not include the class declaration or func _run() header. ' +
        'A variable `scene` pointing to the edited scene root is NOT automatically injected; ' +
        'use `EditorInterface.get_edited_scene_root()` directly when needed. ' +
        'Example: "var scene = EditorInterface.get_edited_scene_root()\\n' +
        'var mesh = scene.get_node(\"Floor/Mesh\")\\n' +
        'var bm = BoxMesh.new()\\nbm.size = Vector3(4, 0.5, 15)\\nmesh.mesh = bm"'
    ),
});

type EditorScriptArgs = z.infer<typeof EditorScriptSchema>;

export const editorScript = defineTool({
  name: 'editor_script',
  description:
    'Run arbitrary GDScript in the Godot editor context (equivalent to Ctrl+Shift+X in the ' +
    'Script editor). Use for complex multi-step operations, batch edits, or anything that ' +
    'requires full API access. For simply assigning resources to node properties prefer ' +
    'create_node/update_node with the {"_resource": "ClassName", ...props} inline syntax.',
  schema: EditorScriptSchema,
  async execute(args: EditorScriptArgs, { godot }) {
    const result = await godot.sendCommand<{ message: string }>('run_editor_script', {
      code: args.code,
    });
    return result.message ?? 'Script executed successfully';
  },
});

export const editorScriptTools = [editorScript] as AnyToolDefinition[];
