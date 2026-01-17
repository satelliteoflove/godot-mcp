@tool
extends MCPBaseCommand
class_name MCPScriptCommands


func get_commands() -> Dictionary:
	return {
		"get_current_script": get_current_script,
		"attach_script": attach_script,
		"detach_script": detach_script
	}


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
