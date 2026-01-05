@tool
extends MCPBaseCommand
class_name MCPScriptCommands


func get_commands() -> Dictionary:
	return {
		"read_script": read_script,
		"get_current_script": get_current_script,
		"create_script": create_script,
		"edit_script": edit_script,
		"attach_script": attach_script,
		"detach_script": detach_script
	}


func read_script(params: Dictionary) -> Dictionary:
	var script_path: String = params.get("script_path", "")
	if script_path.is_empty():
		return _error("INVALID_PARAMS", "script_path is required")

	if not FileAccess.file_exists(script_path):
		return _error("FILE_NOT_FOUND", "Script file not found: %s" % script_path)

	var file := FileAccess.open(script_path, FileAccess.READ)
	if not file:
		return _error("READ_FAILED", "Failed to read script: %s" % script_path)

	var content := file.get_as_text()
	file.close()

	return _success({"content": content})


func get_current_script(_params: Dictionary) -> Dictionary:
	var script_editor := EditorInterface.get_script_editor()
	if not script_editor:
		return _success({"path": null, "content": null})

	var current_script := script_editor.get_current_script()
	if not current_script:
		return _success({"path": null, "content": null})

	return _success({
		"path": current_script.resource_path,
		"content": current_script.source_code
	})


func create_script(params: Dictionary) -> Dictionary:
	var script_path: String = params.get("script_path", "")
	var content: String = params.get("content", "")
	var attach_to: String = params.get("attach_to", "")

	if script_path.is_empty():
		return _error("INVALID_PARAMS", "script_path is required")
	if content.is_empty():
		return _error("INVALID_PARAMS", "content is required")

	var dir_path := script_path.get_base_dir()
	if not MCPUtils.dir_exists(dir_path):
		var err := MCPUtils.ensure_dir_exists(dir_path)
		if err != OK:
			return _error("DIR_CREATE_FAILED", "Failed to create directory: %s" % dir_path)

	var file := FileAccess.open(script_path, FileAccess.WRITE)
	if not file:
		return _error("WRITE_FAILED", "Failed to create script: %s" % script_path)

	file.store_string(content)
	file.close()

	EditorInterface.get_resource_filesystem().scan()

	if not attach_to.is_empty():
		var attach_result := attach_script({"node_path": attach_to, "script_path": script_path})
		if attach_result["status"] == "error":
			return attach_result

	return _success({"path": script_path})


func edit_script(params: Dictionary) -> Dictionary:
	var script_path: String = params.get("script_path", "")
	var content: String = params.get("content", "")

	if script_path.is_empty():
		return _error("INVALID_PARAMS", "script_path is required")
	if content.is_empty():
		return _error("INVALID_PARAMS", "content is required")

	if not FileAccess.file_exists(script_path):
		return _error("FILE_NOT_FOUND", "Script file not found: %s" % script_path)

	var file := FileAccess.open(script_path, FileAccess.WRITE)
	if not file:
		return _error("WRITE_FAILED", "Failed to write script: %s" % script_path)

	file.store_string(content)
	file.close()

	EditorInterface.get_resource_filesystem().scan()

	var script := load(script_path) as Script
	if script:
		script.reload()

	return _success({"path": script_path})


func attach_script(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var script_path: String = params.get("script_path", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if script_path.is_empty():
		return _error("INVALID_PARAMS", "script_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	if not FileAccess.file_exists(script_path):
		return _error("FILE_NOT_FOUND", "Script file not found: %s" % script_path)

	var script := load(script_path) as Script
	if not script:
		return _error("LOAD_FAILED", "Failed to load script: %s" % script_path)

	node.set_script(script)

	EditorInterface.get_resource_filesystem().scan()
	script.reload()

	if node.get_script() != script:
		return _error("ATTACH_FAILED", "Script attachment did not persist")

	var scene_root := EditorInterface.get_edited_scene_root()
	return _success({"node_path": str(scene_root.get_path_to(node)), "script_path": script_path})


func detach_script(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	node.set_script(null)

	return _success({})


