@tool
extends RefCounted
class_name MCPSceneCommands


func get_scene_tree(_params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	return _success({"tree": _walk_tree(root)})


func get_current_scene(_params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _success({
			"path": null,
			"root_name": null,
			"root_type": null
		})

	return _success({
		"path": root.scene_file_path,
		"root_name": root.name,
		"root_type": root.get_class()
	})


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


func create_scene(params: Dictionary) -> Dictionary:
	var root_type: String = params.get("root_type", "")
	var root_name: String = params.get("root_name", root_type)
	var scene_path: String = params.get("scene_path", "")

	if root_type.is_empty():
		return _error("INVALID_PARAMS", "root_type is required")
	if scene_path.is_empty():
		return _error("INVALID_PARAMS", "scene_path is required")

	if not ClassDB.class_exists(root_type):
		return _error("INVALID_TYPE", "Unknown node type: %s" % root_type)

	var root: Node = ClassDB.instantiate(root_type)
	if not root:
		return _error("CREATE_FAILED", "Failed to create node of type: %s" % root_type)

	root.name = root_name

	var packed_scene := PackedScene.new()
	var err := packed_scene.pack(root)
	root.free()

	if err != OK:
		return _error("PACK_FAILED", "Failed to pack scene: %s" % error_string(err))

	err = ResourceSaver.save(packed_scene, scene_path)
	if err != OK:
		return _error("SAVE_FAILED", "Failed to save scene: %s" % error_string(err))

	EditorInterface.open_scene_from_path(scene_path)
	return _success({"path": scene_path})


func _walk_tree(node: Node) -> Dictionary:
	var children: Array[Dictionary] = []
	for child in node.get_children():
		children.append(_walk_tree(child))

	return {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": children
	}


func _success(result: Dictionary) -> Dictionary:
	return {
		"status": "success",
		"result": result
	}


func _error(code: String, message: String) -> Dictionary:
	return {
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	}
