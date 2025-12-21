@tool
extends RefCounted
class_name MCPEditorCommands

var _debug_output: PackedStringArray = []


func get_editor_state(_params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()

	return _success({
		"current_scene": root.scene_file_path if root else null,
		"is_playing": EditorInterface.is_playing_scene(),
		"godot_version": Engine.get_version_info()["string"]
	})


func get_selected_nodes(_params: Dictionary) -> Dictionary:
	var selection := EditorInterface.get_selection()
	var selected: Array[String] = []

	for node in selection.get_selected_nodes():
		selected.append(str(node.get_path()))

	return _success({"selected": selected})


func select_node(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var selection := EditorInterface.get_selection()
	selection.clear()
	selection.add_node(node)

	return _success({})


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")

	if scene_path.is_empty():
		EditorInterface.play_main_scene()
	else:
		EditorInterface.play_custom_scene(scene_path)

	return _success({})


func stop_project(_params: Dictionary) -> Dictionary:
	EditorInterface.stop_playing_scene()
	return _success({})


func get_debug_output(params: Dictionary) -> Dictionary:
	var clear: bool = params.get("clear", false)

	var output := "\n".join(_debug_output)

	if clear:
		_debug_output.clear()

	return _success({"output": output})


func get_project_info(_params: Dictionary) -> Dictionary:
	var config := ConfigFile.new()
	var err := config.load("res://project.godot")

	if err != OK:
		return _error("CONFIG_READ_FAILED", "Failed to read project.godot")

	return _success({
		"name": ProjectSettings.get_setting("application/config/name", "Unknown"),
		"path": ProjectSettings.globalize_path("res://"),
		"godot_version": Engine.get_version_info()["string"],
		"main_scene": ProjectSettings.get_setting("application/run/main_scene", null)
	})


func list_project_files(params: Dictionary) -> Dictionary:
	var file_type: String = params.get("file_type", "all")
	var directory: String = params.get("directory", "res://")
	var recursive: bool = params.get("recursive", true)

	var extensions: PackedStringArray
	match file_type:
		"scripts":
			extensions = PackedStringArray(["gd", "cs"])
		"scenes":
			extensions = PackedStringArray(["tscn", "scn"])
		"resources":
			extensions = PackedStringArray(["tres", "res"])
		"images":
			extensions = PackedStringArray(["png", "jpg", "jpeg", "webp", "svg"])
		"audio":
			extensions = PackedStringArray(["ogg", "mp3", "wav"])
		"all":
			extensions = PackedStringArray()
		_:
			return _error("INVALID_TYPE", "Unknown file type: %s" % file_type)

	var files := _scan_directory(directory, extensions, recursive)

	return _success({"files": files})


func search_files(params: Dictionary) -> Dictionary:
	var pattern: String = params.get("pattern", "")
	var directory: String = params.get("directory", "res://")

	if pattern.is_empty():
		return _error("INVALID_PARAMS", "pattern is required")

	var all_files := _scan_directory(directory, PackedStringArray(), true)
	var matching: Array[String] = []

	for file_path in all_files:
		var file_name := file_path.get_file()
		if _matches_pattern(file_name, pattern):
			matching.append(file_path)

	return _success({"files": matching})


func get_project_settings(params: Dictionary) -> Dictionary:
	var category: String = params.get("category", "")

	var settings := {}
	var all_settings := ProjectSettings.get_property_list()

	for prop in all_settings:
		var name: String = prop["name"]

		if not category.is_empty() and not name.begins_with(category):
			continue

		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			settings[name] = ProjectSettings.get_setting(name)

	return _success({"settings": settings})


func _get_node(path: String) -> Node:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return null

	if path == "/root" or path == str(root.get_path()):
		return root

	return root.get_node_or_null(path)


func _scan_directory(path: String, extensions: PackedStringArray, recursive: bool) -> Array[String]:
	var files: Array[String] = []
	var dir := DirAccess.open(path)

	if not dir:
		return files

	dir.list_dir_begin()
	var file_name := dir.get_next()

	while not file_name.is_empty():
		var full_path := path.path_join(file_name)

		if dir.current_is_dir():
			if recursive and not file_name.begins_with("."):
				files.append_array(_scan_directory(full_path, extensions, recursive))
		else:
			if extensions.is_empty():
				files.append(full_path)
			else:
				var ext := file_name.get_extension().to_lower()
				if ext in extensions:
					files.append(full_path)

		file_name = dir.get_next()

	dir.list_dir_end()
	return files


func _matches_pattern(text: String, pattern: String) -> bool:
	if not "*" in pattern:
		return pattern.to_lower() in text.to_lower()

	var regex_pattern := "^" + pattern.replace(".", "\\.").replace("*", ".*") + "$"
	var regex := RegEx.new()
	regex.compile(regex_pattern)

	return regex.search(text.to_lower()) != null


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
