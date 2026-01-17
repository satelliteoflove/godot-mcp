extends Node
class_name MCPGameBridge

const DEFAULT_MAX_WIDTH := 1920

var _logger: _MCPGameLogger


func _ready() -> void:
	if not EngineDebugger.is_active():
		return
	_logger = _MCPGameLogger.new()
	OS.add_logger(_logger)
	EngineDebugger.register_message_capture("godot_mcp", _on_debugger_message)
	MCPLog.info("Game bridge initialized")


func _exit_tree() -> void:
	if EngineDebugger.is_active():
		EngineDebugger.unregister_message_capture("godot_mcp")


func _on_debugger_message(message: String, data: Array) -> bool:
	match message:
		"take_screenshot":
			_take_screenshot_deferred.call_deferred(data)
			return true
		"get_debug_output":
			_handle_get_debug_output(data)
			return true
		"get_performance_metrics":
			_handle_get_performance_metrics()
			return true
		"find_nodes":
			_handle_find_nodes(data)
			return true
	return false


func _take_screenshot_deferred(data: Array) -> void:
	var max_width: int = data[0] if data.size() > 0 else DEFAULT_MAX_WIDTH
	await RenderingServer.frame_post_draw
	_capture_and_send_screenshot(max_width)


func _capture_and_send_screenshot(max_width: int) -> void:
	var viewport := get_viewport()
	if viewport == null:
		_send_screenshot_error("NO_VIEWPORT", "Could not get game viewport")
		return
	var image := viewport.get_texture().get_image()
	if image == null:
		_send_screenshot_error("CAPTURE_FAILED", "Failed to capture image from viewport")
		return
	if max_width > 0 and image.get_width() > max_width:
		var scale_factor := float(max_width) / float(image.get_width())
		var new_height := int(image.get_height() * scale_factor)
		image.resize(max_width, new_height, Image.INTERPOLATE_LANCZOS)
	var png_buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_buffer)
	EngineDebugger.send_message("godot_mcp:screenshot_result", [
		true,
		base64,
		image.get_width(),
		image.get_height(),
		""
	])


func _send_screenshot_error(code: String, message: String) -> void:
	EngineDebugger.send_message("godot_mcp:screenshot_result", [
		false,
		"",
		0,
		0,
		"%s: %s" % [code, message]
	])


func _handle_get_debug_output(data: Array) -> void:
	var clear: bool = data[0] if data.size() > 0 else false
	var output := _logger.get_output() if _logger else PackedStringArray()
	if clear and _logger:
		_logger.clear()
	EngineDebugger.send_message("godot_mcp:debug_output_result", [output])


func _handle_find_nodes(data: Array) -> void:
	var name_pattern: String = data[0] if data.size() > 0 else ""
	var type_filter: String = data[1] if data.size() > 1 else ""
	var root_path: String = data[2] if data.size() > 2 else ""

	var tree := get_tree()
	var scene_root := tree.current_scene if tree else null
	if not scene_root:
		EngineDebugger.send_message("godot_mcp:find_nodes_result", [[], 0, "No scene running"])
		return

	var search_root: Node = scene_root
	if not root_path.is_empty():
		search_root = _get_node_from_path(root_path, scene_root)
		if not search_root:
			EngineDebugger.send_message("godot_mcp:find_nodes_result", [[], 0, "Root not found: " + root_path])
			return

	var matches: Array = []
	_find_recursive(search_root, scene_root, name_pattern, type_filter, matches)
	EngineDebugger.send_message("godot_mcp:find_nodes_result", [matches, matches.size(), ""])


func _get_node_from_path(path: String, scene_root: Node) -> Node:
	if path == "/" or path.is_empty():
		return scene_root

	if path.begins_with("/root/"):
		var parts := path.split("/")
		if parts.size() >= 3 and parts[2] == scene_root.name:
			var relative := "/".join(parts.slice(3))
			if relative.is_empty():
				return scene_root
			return scene_root.get_node_or_null(relative)

	if path.begins_with("/"):
		path = path.substr(1)

	return scene_root.get_node_or_null(path)


func _find_recursive(node: Node, scene_root: Node, name_pattern: String, type_filter: String, results: Array) -> void:
	var name_matches := name_pattern.is_empty() or node.name.matchn(name_pattern)
	var type_matches := type_filter.is_empty() or node.is_class(type_filter)

	if name_matches and type_matches:
		var path := "/root/" + scene_root.name
		var relative := scene_root.get_path_to(node)
		if relative != NodePath("."):
			path += "/" + str(relative)
		results.append({"path": path, "type": node.get_class()})

	for child in node.get_children():
		_find_recursive(child, scene_root, name_pattern, type_filter, results)


func _handle_get_performance_metrics() -> void:
	var metrics := {
		"fps": Performance.get_monitor(Performance.TIME_FPS),
		"frame_time_ms": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		"physics_time_ms": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		"navigation_time_ms": Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS) * 1000.0,
		"render_objects": int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)),
		"render_draw_calls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		"render_primitives": int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)),
		"physics_2d_active_objects": int(Performance.get_monitor(Performance.PHYSICS_2D_ACTIVE_OBJECTS)),
		"physics_2d_collision_pairs": int(Performance.get_monitor(Performance.PHYSICS_2D_COLLISION_PAIRS)),
		"physics_2d_island_count": int(Performance.get_monitor(Performance.PHYSICS_2D_ISLAND_COUNT)),
		"object_count": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"object_resource_count": int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),
		"object_node_count": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"object_orphan_node_count": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),
		"memory_static": int(Performance.get_monitor(Performance.MEMORY_STATIC)),
		"memory_static_max": int(Performance.get_monitor(Performance.MEMORY_STATIC_MAX)),
	}
	EngineDebugger.send_message("godot_mcp:performance_metrics_result", [metrics])


class _MCPGameLogger extends Logger:
	var _output: PackedStringArray = []
	var _max_lines := 1000
	var _mutex := Mutex.new()

	func _log_message(message: String, error: bool) -> void:
		_mutex.lock()
		var prefix := "[ERROR] " if error else ""
		_output.append(prefix + message)
		if _output.size() > _max_lines:
			_output.remove_at(0)
		_mutex.unlock()

	func _log_error(function: String, file: String, line: int, code: String,
					rationale: String, editor_notify: bool, error_type: int,
					script_backtraces: Array[ScriptBacktrace]) -> void:
		_mutex.lock()
		var msg := "[%s:%d] %s: %s" % [file.get_file(), line, code, rationale]
		_output.append("[ERROR] " + msg)
		if _output.size() > _max_lines:
			_output.remove_at(0)
		_mutex.unlock()

	func get_output() -> PackedStringArray:
		return _output

	func clear() -> void:
		_mutex.lock()
		_output.clear()
		_mutex.unlock()
