@tool
extends MCPBaseCommand
class_name MCPSceneCommands


func get_commands() -> Dictionary:
	return {
		"get_scene_tree": get_scene_tree,
		"open_scene": open_scene,
		"save_scene": save_scene,
		"reload_scene": reload_scene
	}


func get_scene_tree(params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	# 0 = unlimited for both caps (the default when the param is omitted), so the
	# full tree is unchanged unless a caller opts into trimming it.
	var max_depth: int = int(params.get("max_depth", 0))
	var max_children: int = int(params.get("max_children", 0))
	return _success({"tree": _build_tree(root, 1, max_depth, max_children)})


func _build_tree(node: Node, depth: int, max_depth: int, max_children: int) -> Dictionary:
	var result := {
		"name": node.name,
		"type": node.get_class(),
	}

	if node is Node2D:
		var pos: Vector2 = node.position
		result["position"] = {"x": pos.x, "y": pos.y}
	elif node is Node3D:
		var pos: Vector3 = node.position
		result["position"] = {"x": pos.x, "y": pos.y, "z": pos.z}

	var child_nodes := node.get_children()
	var child_count := child_nodes.size()
	if child_count == 0:
		return result

	# Depth cap: at the limit, stop recursing and just report how many direct
	# children were cut off.
	if max_depth > 0 and depth >= max_depth:
		result["truncated_children"] = child_count
		return result

	# Breadth cap: list the first max_children and report the remainder.
	var limit := child_count
	if max_children > 0 and child_count > max_children:
		limit = max_children

	var children: Array[Dictionary] = []
	for i in range(limit):
		children.append(_build_tree(child_nodes[i], depth + 1, max_depth, max_children))

	result["children"] = children
	if limit < child_count:
		result["truncated_children"] = child_count - limit

	return result


func open_scene(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	if scene_path.is_empty():
		return _error("INVALID_PARAMS", "scene_path is required")

	if not FileAccess.file_exists(scene_path):
		return _error("FILE_NOT_FOUND", "Scene file not found: %s" % scene_path)

	EditorInterface.open_scene_from_path(scene_path)
	return _success({"path": scene_path})


func save_scene(params: Dictionary) -> Dictionary:
	var resolved: Variant = _resolve_scene_path(params.get("path", ""))
	if resolved is Dictionary:
		return resolved
	var path: String = resolved

	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	var packed_scene := PackedScene.new()
	var err := packed_scene.pack(root)
	if err != OK:
		return _error("PACK_FAILED", "Failed to pack scene: %s" % error_string(err))

	err = ResourceSaver.save(packed_scene, path)
	if err != OK:
		return _error("SAVE_FAILED", "Failed to save scene: %s" % error_string(err))

	return _success({"path": path})


# Reload an already-open scene from disk, picking up a direct .tscn edit without
# the heavyweight `restart`. Disk wins: any unsaved in-memory edits to this scene
# (e.g. an unsaved godot_node_edit) are discarded. Only open scenes can be
# reloaded in place; an unopened path is rejected so the caller uses open_scene.
func reload_scene(params: Dictionary) -> Dictionary:
	var resolved: Variant = _resolve_scene_path(params.get("scene_path", ""))
	if resolved is Dictionary:
		return resolved
	var scene_path := _localize_scene_path(resolved)

	if not FileAccess.file_exists(scene_path):
		return _error("FILE_NOT_FOUND", "Scene file not found: %s" % scene_path)

	if not scene_path in EditorInterface.get_open_scenes():
		return _error("NOT_OPEN", "Scene is not open in the editor; use open_scene to open it: %s" % scene_path)

	EditorInterface.reload_scene_from_path(scene_path)
	return _success({"path": scene_path})


# Resolve the scene-file path to act on: the caller-supplied path, or the current
# edited scene's file when none was given. Returns the path String, or an error
# Dictionary (NO_SCENE / NO_PATH) the caller returns unchanged. Shared by
# save_scene and reload_scene so the NO_SCENE/NO_PATH handling lives in one place.
func _resolve_scene_path(provided_path: String) -> Variant:
	if not provided_path.is_empty():
		return provided_path
	var err := _require_scene_open()
	if err:
		return err
	var path := EditorInterface.get_edited_scene_root().scene_file_path
	if path.is_empty():
		return _error("NO_PATH", "The current scene has not been saved to a file and no scene path was provided")
	return path


# Normalize a scene path to the canonical res:// form that get_open_scenes() and
# FileAccess use. A uid:// reference (the editor writes these into .tscn since
# 4.4) is resolved to its res:// path; an absolute path is localized. An
# unresolvable uid is returned unchanged so the existence check reports it.
func _localize_scene_path(path: String) -> String:
	if path.begins_with("uid://"):
		var id := ResourceUID.text_to_id(path)
		if ResourceUID.has_id(id):
			return ResourceUID.get_id_path(id)
		return path
	return ProjectSettings.localize_path(path)

