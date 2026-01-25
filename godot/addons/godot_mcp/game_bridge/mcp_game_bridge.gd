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


func _process(_delta: float) -> void:
	if not _sequence_running or _sequence_events.is_empty():
		return

	var elapsed := Time.get_ticks_msec() - _sequence_start_time

	while _sequence_events.size() > 0 and _sequence_events[0].time <= elapsed:
		var seq_event: Dictionary = _sequence_events.pop_front()
		var input_event := InputEventAction.new()
		input_event.action = seq_event.action
		input_event.pressed = seq_event.is_press
		input_event.strength = 1.0 if seq_event.is_press else 0.0
		Input.parse_input_event(input_event)
		if not seq_event.is_press:
			_actions_completed += 1

	if _sequence_events.is_empty():
		_sequence_running = false
		set_process(false)
		EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
			"completed": true,
			"actions_executed": _actions_completed,
		}])


var _sequence_events: Array = []
var _sequence_start_time: int = 0
var _sequence_running: bool = false
var _actions_completed: int = 0
var _actions_total: int = 0


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
		"get_input_map":
			_handle_get_input_map()
			return true
		"execute_input_sequence":
			_handle_execute_input_sequence(data)
			return true
		"type_text":
			_handle_type_text(data)
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


func _handle_get_input_map() -> void:
	var actions: Array = []
	for action_name in InputMap.get_actions():
		if action_name.begins_with("ui_"):
			continue
		var events := InputMap.action_get_events(action_name)
		var event_strings: Array = []
		for event in events:
			event_strings.append(_event_to_string(event))
		actions.append({
			"name": action_name,
			"events": event_strings,
		})
	EngineDebugger.send_message("godot_mcp:input_map_result", [actions, ""])


func _event_to_string(event: InputEvent) -> String:
	if event is InputEventKey:
		var key_event := event as InputEventKey
		var key_name := OS.get_keycode_string(key_event.keycode)
		if key_event.ctrl_pressed:
			key_name = "Ctrl+" + key_name
		if key_event.alt_pressed:
			key_name = "Alt+" + key_name
		if key_event.shift_pressed:
			key_name = "Shift+" + key_name
		return key_name
	elif event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		match mouse_event.button_index:
			MOUSE_BUTTON_LEFT:
				return "Mouse Left"
			MOUSE_BUTTON_RIGHT:
				return "Mouse Right"
			MOUSE_BUTTON_MIDDLE:
				return "Mouse Middle"
			_:
				return "Mouse Button %d" % mouse_event.button_index
	elif event is InputEventJoypadButton:
		var joy_event := event as InputEventJoypadButton
		return "Joypad Button %d" % joy_event.button_index
	elif event is InputEventJoypadMotion:
		var joy_motion := event as InputEventJoypadMotion
		return "Joypad Axis %d" % joy_motion.axis
	return event.as_text()


func _handle_execute_input_sequence(data: Array) -> void:
	var inputs: Array = data[0] if data.size() > 0 else []

	if inputs.is_empty():
		EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
			"error": "No inputs provided",
		}])
		return

	_sequence_events.clear()
	_actions_completed = 0
	_actions_total = inputs.size()

	for input in inputs:
		var action_name: String = input.get("action_name", "")
		var start_ms: int = int(input.get("start_ms", 0))
		var duration_ms: int = int(input.get("duration_ms", 0))

		if action_name.is_empty():
			continue

		if not InputMap.has_action(action_name):
			EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
				"error": "Unknown action: %s" % action_name,
			}])
			return

		_sequence_events.append({
			"time": start_ms,
			"action": action_name,
			"is_press": true,
		})
		_sequence_events.append({
			"time": start_ms + duration_ms,
			"action": action_name,
			"is_press": false,
		})

	_sequence_events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.time < b.time
	)

	_sequence_start_time = Time.get_ticks_msec()
	_sequence_running = true
	set_process(true)


func _handle_type_text(data: Array) -> void:
	var text: String = data[0] if data.size() > 0 else ""
	var delay_ms: int = int(data[1]) if data.size() > 1 else 50
	var submit: bool = data[2] if data.size() > 2 else false

	if text.is_empty():
		EngineDebugger.send_message("godot_mcp:type_text_result", [{
			"error": "No text provided",
		}])
		return

	_type_text_async(text, delay_ms, submit)


func _type_text_async(text: String, delay_ms: int, submit: bool) -> void:
	for i in text.length():
		var char_code := text.unicode_at(i)

		var press := InputEventKey.new()
		press.keycode = char_code
		press.unicode = char_code
		press.pressed = true
		Input.parse_input_event(press)

		var release := InputEventKey.new()
		release.keycode = char_code
		release.unicode = char_code
		release.pressed = false
		Input.parse_input_event(release)

		if delay_ms > 0 and i < text.length() - 1:
			await get_tree().create_timer(delay_ms / 1000.0).timeout

	if submit:
		if delay_ms > 0:
			await get_tree().create_timer(delay_ms / 1000.0).timeout

		var enter_press := InputEventKey.new()
		enter_press.keycode = KEY_ENTER
		enter_press.physical_keycode = KEY_ENTER
		enter_press.pressed = true
		Input.parse_input_event(enter_press)

		var enter_release := InputEventKey.new()
		enter_release.keycode = KEY_ENTER
		enter_release.physical_keycode = KEY_ENTER
		enter_release.pressed = false
		Input.parse_input_event(enter_release)

	EngineDebugger.send_message("godot_mcp:type_text_result", [{
		"completed": true,
		"chars_typed": text.length(),
		"submitted": submit,
	}])
