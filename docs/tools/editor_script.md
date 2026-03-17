# EditorScript Tools

Run arbitrary GDScript in the editor context

## Tools

- [editor_script](#editor_script)

---

## editor_script

Run arbitrary GDScript in the Godot editor context (equivalent to Ctrl+Shift+X in the Script editor). Use this to assign inline resources like BoxMesh, BoxShape3D, or StandardMaterial3D to node properties — operations that create_node/update_node cannot do directly because they only accept serialisable property values.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `code` | string | Yes | GDScript code to execute in the editor context. Write only the body statements — do not include the class declaration or func _run() header. A variable `scene` pointing to the edited scene root is NOT automatically injected; use `EditorInterface.get_edited_scene_root()` directly when needed. Example: "var scene = EditorInterface.get_edited_scene_root()\nvar mesh = scene.get_node("Floor/Mesh")\nvar bm = BoxMesh.new()\nbm.size = Vector3(4, 0.5, 15)\nmesh.mesh = bm" |

---

