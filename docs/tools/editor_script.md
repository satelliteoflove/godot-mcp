# EditorScript Tools

Run arbitrary GDScript in the editor context

## Tools

- [editor_script](#editor_script)

---

## editor_script

Run arbitrary GDScript in the Godot editor context (equivalent to Ctrl+Shift+X in the Script editor). Use for complex multi-step operations, batch edits, or anything that requires full API access. For simply assigning resources to node properties prefer create_node/update_node with the {"_resource": "ClassName", ...props} inline syntax.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | GDScript code to execute in the editor context. Write only the body statements — do not include the class declaration or func _run() header. A variable `scene` pointing to the edited scene root is NOT automatically injected; use `EditorInterface.get_edited_scene_root()` directly when needed. Example: "var scene = EditorInterface.get_edited_scene_root()\nvar mesh = scene.get_node("Floor/Mesh")\nvar bm = BoxMesh.new()\nbm.size = Vector3(4, 0.5, 15)\nmesh.mesh = bm" |

---

