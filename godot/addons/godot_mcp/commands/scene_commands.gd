@tool
extends MCPBaseCommand
class_name MCPSceneCommands


func get_commands() -> Dictionary:
	return {
		"get_scene_tree": get_scene_tree,
		"open_scene": open_scene,
		"save_scene": save_scene
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
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	var path: String = params.get("path", "")
	if path.is_empty():
		path = root.scene_file_path

	if path.is_empty():
		return _error("NO_PATH", "Scene has no path and none was provided")

	var packed_scene := PackedScene.new()
	var err := packed_scene.pack(root)
	if err != OK:
		return _error("PACK_FAILED", "Failed to pack scene: %s" % error_string(err))

	err = ResourceSaver.save(packed_scene, path)
	if err != OK:
		return _error("SAVE_FAILED", "Failed to save scene: %s" % error_string(err))

	return _success({"path": path})

