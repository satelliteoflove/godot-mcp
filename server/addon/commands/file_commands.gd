@tool
extends MCPBaseCommand
class_name MCPFileCommands


func get_commands() -> Dictionary:
	return {
		"list_project_files": list_project_files,
		"search_files": search_files
	}


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
