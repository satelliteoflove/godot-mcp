@tool
extends EditorDebuggerPlugin
class_name MCPDebuggerPlugin

signal screenshot_received(success: bool, image_base64: String, width: int, height: int, error: String)
signal performance_metrics_received(metrics: Dictionary)
signal find_nodes_received(matches: Array, count: int, error: String)
signal input_map_received(actions: Array, error: String)
signal input_sequence_completed(result: Dictionary)
signal sequence_capture_received(requested_ms: int, actual_ms: int, ok: bool, image_base64: String, width: int, height: int, error: String)
signal type_text_completed(result: Dictionary)
signal bridge_ready()

var _active_session_id: int = -1
# True once the running game's bridge has announced it is ready to receive input
# (its main scene is up). The debug session connects before the scene loads, so
# has_active_session() alone is not enough to know input will land (#241).
var _bridge_ready: bool = false
var _pending_screenshot: bool = false
# Mesh-integrity warnings that rode along with the last screenshot result
# (element 6 of screenshot_result; empty for bridges that predate it). Held
# here instead of widening the screenshot_received signal signature.
var last_screenshot_warnings: Array = []
var _pending_performance_metrics: bool = false
var _pending_find_nodes: bool = false
var _pending_input_map: bool = false
var _pending_input_sequence: bool = false
var _pending_type_text: bool = false
var _pending_requests: Dictionary = {}
var _responses: Dictionary = {}


func _has_capture(prefix: String) -> bool:
	return prefix == "godot_mcp"


func _capture(message: String, data: Array, session_id: int) -> bool:
	match message:
		"godot_mcp:screenshot_result":
			_handle_screenshot_result(data)
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
		"godot_mcp:sequence_capture":
			_handle_sequence_capture(data)
			return true
		"godot_mcp:type_text_result":
			_handle_type_text_result(data)
			return true
		"godot_mcp:game_response":
			_handle_game_response(data)
			return true
		"godot_mcp:bridge_ready":
			_handle_bridge_ready(session_id)
			return true
	return false


func _handle_bridge_ready(session_id: int) -> void:
	# Only the active session's bridge counts; ignore a late message from a prior
	# run (a new _setup_session has already reset the flag for the current one).
	if session_id != _active_session_id:
		return
	_bridge_ready = true
	bridge_ready.emit()


func _setup_session(session_id: int) -> void:
	_active_session_id = session_id
	# New game session: its bridge has not announced readiness yet.
	_bridge_ready = false


func _session_stopped() -> void:
	_active_session_id = -1
	_bridge_ready = false
	if _pending_screenshot:
		_pending_screenshot = false
		screenshot_received.emit(false, "", 0, 0, "Game session ended")
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
	for msg_type in _pending_requests:
		_responses[msg_type] = {}
	_pending_requests.clear()


func has_active_session() -> bool:
	if _active_session_id < 0:
		return false
	if not EditorInterface.is_playing_scene():
		_active_session_id = -1
		return false
	return true


# True only once the running game's bridge has reported its main scene is up and
# can consume input. Input commands gate on this (not just has_active_session) so
# a sequence injected right after run is not dispatched into a half-booted game.
func is_bridge_ready() -> bool:
	return _bridge_ready and has_active_session()


func request_screenshot(max_width: int = 1024) -> void:
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
	last_screenshot_warnings = data[5] if data.size() > 5 and data[5] is Array else []
	screenshot_received.emit(success, image_base64, width, height, error)


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


func request_input_sequence(inputs: Array, report: Array = [], screenshots: Array = [], screenshot_max_width: int = 640) -> void:
	if _active_session_id < 0:
		input_sequence_completed.emit({"error": "No active game session"})
		return
	_pending_input_sequence = true
	var session := get_session(_active_session_id)
	if session:
		session.send_message("godot_mcp:execute_input_sequence", [inputs, report, screenshots, screenshot_max_width])
	else:
		_pending_input_sequence = false
		input_sequence_completed.emit({"error": "Could not get debugger session"})


func _handle_input_sequence_result(data: Array) -> void:
	_pending_input_sequence = false
	var result: Dictionary = data[0] if data.size() > 0 else {}
	input_sequence_completed.emit(result)


# A mid-sequence frame capture (#239) arriving on its own message. Re-emitted for
# the editor command to collect; the final input_sequence_result follows once the
# bridge has sent every requested frame.
func _handle_sequence_capture(data: Array) -> void:
	var requested_ms: int = int(data[0]) if data.size() > 0 else 0
	var actual_ms: int = int(data[1]) if data.size() > 1 else 0
	var ok: bool = bool(data[2]) if data.size() > 2 else false
	var base64: String = String(data[3]) if data.size() > 3 else ""
	var width: int = int(data[4]) if data.size() > 4 else 0
	var height: int = int(data[5]) if data.size() > 5 else 0
	var error: String = String(data[6]) if data.size() > 6 else ""
	sequence_capture_received.emit(requested_ms, actual_ms, ok, base64, width, height, error)


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


func send_game_message(msg_type: String, args: Array = []) -> bool:
	if _active_session_id < 0:
		return false
	var session := get_session(_active_session_id)
	if not session:
		return false
	_pending_requests[msg_type] = true
	_responses.erase(msg_type)
	session.send_message("godot_mcp:" + msg_type, args)
	return true


func has_response(msg_type: String) -> bool:
	return _responses.has(msg_type)


func get_response(msg_type: String) -> Variant:
	return _responses.get(msg_type)


func clear_response(msg_type: String) -> void:
	_responses.erase(msg_type)
	_pending_requests.erase(msg_type)


func _handle_game_response(data: Array) -> void:
	if data.size() < 2:
		return
	var msg_type: String = data[0]
	var response_data: Variant = data[1]
	_pending_requests.erase(msg_type)
	_responses[msg_type] = response_data


func toggle_frame_profiler(enable: bool) -> void:
	if _active_session_id < 0:
		return
	var session := get_session(_active_session_id)
	if session:
		session.toggle_profiler("mcp_frame_profiler", enable)


# True when the debugger has paused the running game (script error, failed
# assert, or breakpoint). A break suspends whatever bridge handler was running
# mid-call, so relays that would otherwise time out can detect and recover.
func is_session_breaked() -> bool:
	if _active_session_id < 0:
		return false
	var session := get_session(_active_session_id)
	return session != null and session.is_breaked()


# Resume a debugger-paused game. EditorDebuggerSession exposes no continue API,
# but the raw "continue" command is the same wire message the editor's Continue
# button sends (ScriptEditorDebugger::_put_msg), and the game's RemoteDebugger
# handles it in its break loop. Returns false when there is nothing to resume.
func continue_session() -> bool:
	if _active_session_id < 0:
		return false
	var session := get_session(_active_session_id)
	if session == null or not session.is_breaked():
		return false
	session.send_message("continue", [])
	return true
