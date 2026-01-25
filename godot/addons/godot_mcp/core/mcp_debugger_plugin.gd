@tool
extends EditorDebuggerPlugin
class_name MCPDebuggerPlugin

signal screenshot_received(success: bool, image_base64: String, width: int, height: int, error: String)
signal debug_output_received(output: PackedStringArray)
signal performance_metrics_received(metrics: Dictionary)
signal find_nodes_received(matches: Array, count: int, error: String)
signal input_map_received(actions: Array, error: String)
signal input_sequence_completed(result: Dictionary)
signal type_text_completed(result: Dictionary)

var _active_session_id: int = -1
var _pending_screenshot: bool = false
var _pending_debug_output: bool = false
var _pending_performance_metrics: bool = false
var _pending_find_nodes: bool = false
var _pending_input_map: bool = false
var _pending_input_sequence: bool = false
var _pending_type_text: bool = false


func _has_capture(prefix: String) -> bool:
	return prefix == "godot_mcp"


func _capture(message: String, data: Array, session_id: int) -> bool:
	match message:
		"godot_mcp:screenshot_result":
			_handle_screenshot_result(data)
			return true
		"godot_mcp:debug_output_result":
			_handle_debug_output_result(data)
			return true
		"godot_mcp:performance_metrics_result":
			_handle_performance_metrics_result(data)
			return true
		"godot_mcp:find_nodes_result":
			_handle_find_nodes_result(data)
			return true
		"godot_mcp:input_map_result":
			_handle_input_map_result(data)
			return true
		"godot_mcp:input_sequence_result":
			_handle_input_sequence_result(data)
			return true
		"godot_mcp:type_text_result":
			_handle_type_text_result(data)
			return true
	return false


func _setup_session(session_id: int) -> void:
	_active_session_id = session_id


func _session_stopped() -> void:
	_active_session_id = -1
	if _pending_screenshot:
		_pending_screenshot = false
		screenshot_received.emit(false, "", 0, 0, "Game session ended")
	if _pending_debug_output:
		_pending_debug_output = false
		debug_output_received.emit(PackedStringArray())
	if _pending_performance_metrics:
		_pending_performance_metrics = false
		performance_metrics_received.emit({})
	if _pending_find_nodes:
		_pending_find_nodes = false
		find_nodes_received.emit([], 0, "Game session ended")
	if _pending_input_map:
		_pending_input_map = false
		input_map_received.emit([], "Game session ended")
	if _pending_input_sequence:
		_pending_input_sequence = false
		input_sequence_completed.emit({"error": "Game session ended"})
	if _pending_type_text:
		_pending_type_text = false
		type_text_completed.emit({"error": "Game session ended"})


func has_active_session() -> bool:
	if _active_session_id < 0:
		return false
	if not EditorInterface.is_playing_scene():
		_active_session_id = -1
		return false
	return true


func request_screenshot(max_width: int = 1920) -> void:
	if _active_session_id < 0:
		screenshot_received.emit(false, "", 0, 0, "No active game session")
		return
	_pending_screenshot = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:take_screenshot", [max_width])
	else:
		_pending_screenshot = false
		screenshot_received.emit(false, "", 0, 0, "Could not get debugger session")


func _handle_screenshot_result(data: Array) -> void:
	_pending_screenshot = false
	if data.size() < 5:
		screenshot_received.emit(false, "", 0, 0, "Invalid response data")
		return
	var success: bool = data[0]
	var image_base64: String = data[1]
	var width: int = data[2]
	var height: int = data[3]
	var error: String = data[4]
	screenshot_received.emit(success, image_base64, width, height, error)


func request_debug_output(clear: bool = false) -> void:
	if _active_session_id < 0:
		debug_output_received.emit(PackedStringArray())
		return
	_pending_debug_output = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:get_debug_output", [clear])
	else:
		_pending_debug_output = false
		debug_output_received.emit(PackedStringArray())


func _handle_debug_output_result(data: Array) -> void:
	_pending_debug_output = false
	var output: PackedStringArray = data[0] if data.size() > 0 else PackedStringArray()
	debug_output_received.emit(output)


func request_performance_metrics() -> void:
	if _active_session_id < 0:
		performance_metrics_received.emit({})
		return
	_pending_performance_metrics = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:get_performance_metrics", [])
	else:
		_pending_performance_metrics = false
		performance_metrics_received.emit({})


func _handle_performance_metrics_result(data: Array) -> void:
	_pending_performance_metrics = false
	var metrics: Dictionary = data[0] if data.size() > 0 else {}
	performance_metrics_received.emit(metrics)


func request_find_nodes(name_pattern: String, type_filter: String, root_path: String) -> void:
	if _active_session_id < 0:
		find_nodes_received.emit([], 0, "No active game session")
		return
	_pending_find_nodes = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:find_nodes", [name_pattern, type_filter, root_path])
	else:
		_pending_find_nodes = false
		find_nodes_received.emit([], 0, "Could not get debugger session")


func _handle_find_nodes_result(data: Array) -> void:
	_pending_find_nodes = false
	var matches: Array = data[0] if data.size() > 0 else []
	var count: int = data[1] if data.size() > 1 else 0
	var error: String = data[2] if data.size() > 2 else ""
	find_nodes_received.emit(matches, count, error)


func request_input_map() -> void:
	if _active_session_id < 0:
		input_map_received.emit([], "No active game session")
		return
	_pending_input_map = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:get_input_map", [])
	else:
		_pending_input_map = false
		input_map_received.emit([], "Could not get debugger session")


func _handle_input_map_result(data: Array) -> void:
	_pending_input_map = false
	var actions: Array = data[0] if data.size() > 0 else []
	var error: String = data[1] if data.size() > 1 else ""
	input_map_received.emit(actions, error)


func request_input_sequence(inputs: Array) -> void:
	if _active_session_id < 0:
		input_sequence_completed.emit({"error": "No active game session"})
		return
	_pending_input_sequence = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:execute_input_sequence", [inputs])
	else:
		_pending_input_sequence = false
		input_sequence_completed.emit({"error": "Could not get debugger session"})


func _handle_input_sequence_result(data: Array) -> void:
	_pending_input_sequence = false
	var result: Dictionary = data[0] if data.size() > 0 else {}
	input_sequence_completed.emit(result)


func request_type_text(text: String, delay_ms: int, submit: bool) -> void:
	if _active_session_id < 0:
		type_text_completed.emit({"error": "No active game session"})
		return
	_pending_type_text = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:type_text", [text, delay_ms, submit])
	else:
		_pending_type_text = false
		type_text_completed.emit({"error": "Could not get debugger session"})


func _handle_type_text_result(data: Array) -> void:
	_pending_type_text = false
	var result: Dictionary = data[0] if data.size() > 0 else {}
	type_text_completed.emit(result)
