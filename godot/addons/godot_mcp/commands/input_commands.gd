@tool
extends MCPBaseCommand
class_name MCPInputCommands

const INPUT_TIMEOUT := 30.0
# How long to wait for the game bridge to report it is ready to receive input
# before giving up. The natural workflow is run -> immediately drive the game;
# the session connects before the scene loads, so this short wait absorbs that
# gap (usually under a second) instead of dispatching input into a void (#241).
const READY_TIMEOUT := 10.0

var _input_map_result: Dictionary = {}
var _input_map_pending: bool = false

var _sequence_result: Dictionary = {}
var _sequence_pending: bool = false
# Frames captured mid-sequence (#239), collected from sequence_capture_received
# signals and attached to the result once the sequence completes.
var _sequence_captures: Array = []


var _type_text_result: Dictionary = {}
var _type_text_pending: bool = false


const _BRIDGE_NOT_READY_MSG := "Game is running but its MCP bridge is not ready to receive input yet (no scene up, or the game just launched). This usually clears within a second of run — retry shortly."


func get_commands() -> Dictionary:
	return {
		"get_input_map": get_input_map,
		"execute_input_sequence": execute_input_sequence,
		"type_text": type_text,
	}


# Total wall budget for a long-running input command. The server derives the
# whole cascade and pushes relay_timeout_ms down in params (#276); the local
# fallback is used only for an older server that pushes no budget.
func _pushed_budget(params: Dictionary, fallback: float) -> float:
	if params.has("relay_timeout_ms"):
		return float(params["relay_timeout_ms"]) / 1000.0
	return fallback


# Block until the running game's bridge reports it can consume input, bounded by
# READY_TIMEOUT and the shared call deadline (op_start + total_budget) so the
# ready-wait can never eat the budget the command itself needs (#276). Returns
# true once ready, false if the game stops or never comes up in time. In the
# common case (game already running) this returns immediately without waiting a
# frame. Gating input on this is the fix for #241: the debug session connects
# before the main scene loads, so input dispatched on has_active_session() alone
# lands in a game with nothing to receive it.
func _await_bridge_ready(debugger_plugin, op_start: int, total_budget: float) -> bool:
	while not debugger_plugin.is_bridge_ready():
		if not EditorInterface.is_playing_scene():
			return false  # game stopped or crashed while we waited
		await Engine.get_main_loop().process_frame
		var elapsed := (Time.get_ticks_msec() - op_start) / 1000.0
		if elapsed > READY_TIMEOUT or elapsed > total_budget:
			return false
	return true


func get_input_map(_params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _get_editor_input_map()

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _get_editor_input_map()

	_input_map_pending = true
	_input_map_result = {}

	debugger_plugin.input_map_received.connect(_on_input_map_received, CONNECT_ONE_SHOT)
	debugger_plugin.request_input_map()

	var start_time := Time.get_ticks_msec()
	while _input_map_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > INPUT_TIMEOUT:
			_input_map_pending = false
			if debugger_plugin.input_map_received.is_connected(_on_input_map_received):
				debugger_plugin.input_map_received.disconnect(_on_input_map_received)
			return _get_editor_input_map()

	return _success(_input_map_result)


func _get_editor_input_map() -> Dictionary:
	var actions: Array[Dictionary] = []
	for action_name in InputMap.get_actions():
		if action_name.begins_with("ui_"):
			continue
		var events := InputMap.action_get_events(action_name)
		var event_strings: Array[String] = []
		for event in events:
			event_strings.append(_event_to_string(event))
		actions.append({
			"name": action_name,
			"events": event_strings,
		})
	# This map is read from the editor's in-memory InputMap, which is loaded at
	# startup and goes stale if project.godot's [input] section is edited on disk
	# (#245). Flag that so the caller knows the map may be incomplete and can
	# recover with `godot_editor_edit restart`. The game-running path above reads fresh
	# from the bridge, so it never carries this.
	var result := {"actions": actions, "source": "editor"}
	var staleness := MCPUtils.detect_project_staleness()
	if staleness.get("stale", false):
		result["staleness"] = staleness
	return _success(result)


func _event_to_string(event: InputEvent) -> String:
	if event is InputEventKey:
		return MCPKeyNames.event_string(event as InputEventKey)
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
		return "Joypad Button %d (%s)" % [joy_event.button_index, MCPJoyNames.button_name(joy_event.button_index)]
	elif event is InputEventJoypadMotion:
		# The signed axis_value is the direction bit an agent needs to lift the
		# binding straight into an injection (e.g. move_left = left_x, value -1.0).
		var joy_motion := event as InputEventJoypadMotion
		return "Joypad Axis %d (%s, value %+.1f)" % [joy_motion.axis, MCPJoyNames.axis_name(joy_motion.axis), joy_motion.axis_value]
	elif event is InputEventMouseMotion:
		var mouse_motion := event as InputEventMouseMotion
		return "Mouse Motion (rel %+.1f, %+.1f)" % [mouse_motion.relative.x, mouse_motion.relative.y]
	return event.as_text()


func _on_input_map_received(actions: Array, error: String) -> void:
	_input_map_pending = false
	if error.is_empty():
		_input_map_result = {"actions": actions, "source": "game"}
	else:
		_input_map_result = {"error": error}


func execute_input_sequence(params: Dictionary) -> Dictionary:
	var inputs: Array = params.get("inputs", [])
	var report: Array = params.get("report", [])
	var screenshots: Array = params.get("screenshot_at_ms", [])
	var screenshot_max_width: int = int(params.get("screenshot_max_width", 640))
	if inputs.is_empty():
		return _error("INVALID_PARAMS", "inputs array is required and must not be empty")

	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null:
		return _error("NO_SESSION", "No active debug session")
	# One deadline for the whole call, stamped BEFORE the ready-wait so the
	# bridge-ready gap is folded into the budget instead of stacking on top of
	# it (#276). Prefer the server-pushed budget; the fallback (older server) is
	# the longest input/capture offset plus headroom, floored at INPUT_TIMEOUT,
	# plus the ready-wait that now counts against the same deadline.
	var op_start := Time.get_ticks_msec()
	var max_end_time: float = 0.0
	for input in inputs:
		var start_ms: float = input.get("start_ms", 0.0)
		var duration_ms: float = input.get("duration_ms", 0.0)
		max_end_time = max(max_end_time, start_ms + duration_ms)
	for shot_ms in screenshots:
		max_end_time = max(max_end_time, float(shot_ms))
	var fallback: float = max(INPUT_TIMEOUT, (max_end_time / 1000.0) + 5.0) + READY_TIMEOUT
	var timeout := _pushed_budget(params, fallback)

	if not await _await_bridge_ready(debugger_plugin, op_start, timeout):
		return _error("BRIDGE_NOT_READY", _BRIDGE_NOT_READY_MSG)

	_sequence_pending = true
	_sequence_result = {}
	_sequence_captures = []

	# Captures stream in as separate signals before the final result; collect
	# them for the duration of the wait (not one-shot), then detach.
	debugger_plugin.sequence_capture_received.connect(_on_sequence_capture)
	debugger_plugin.input_sequence_completed.connect(_on_sequence_completed, CONNECT_ONE_SHOT)
	debugger_plugin.request_input_sequence(inputs, report, screenshots, screenshot_max_width)

	while _sequence_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - op_start) / 1000.0 > timeout:
			_sequence_pending = false
			if debugger_plugin.input_sequence_completed.is_connected(_on_sequence_completed):
				debugger_plugin.input_sequence_completed.disconnect(_on_sequence_completed)
			if debugger_plugin.sequence_capture_received.is_connected(_on_sequence_capture):
				debugger_plugin.sequence_capture_received.disconnect(_on_sequence_capture)
			return _error("TIMEOUT", "Timed out waiting for input sequence to complete")

	if debugger_plugin.sequence_capture_received.is_connected(_on_sequence_capture):
		debugger_plugin.sequence_capture_received.disconnect(_on_sequence_capture)

	if _sequence_result.has("error"):
		return _error("SEQUENCE_ERROR", _sequence_result.get("error", "Unknown error"))

	if not _sequence_captures.is_empty():
		_sequence_result["captures"] = _sequence_captures

	return _success(_sequence_result)


func _on_sequence_completed(result: Dictionary) -> void:
	_sequence_pending = false
	_sequence_result = result


func _on_sequence_capture(requested_ms: int, actual_ms: int, ok: bool, image_base64: String, width: int, height: int, error: String) -> void:
	_sequence_captures.append({
		"requested_ms": requested_ms,
		"actual_ms": actual_ms,
		"ok": ok,
		"image_base64": image_base64,
		"width": width,
		"height": height,
		"error": error,
	})


func type_text(params: Dictionary) -> Dictionary:
	var text: String = params.get("text", "")
	var delay_ms: int = int(params.get("delay_ms", 50))
	var submit: bool = params.get("submit", false)

	if text.is_empty():
		return _error("INVALID_PARAMS", "text is required and must not be empty")

	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null:
		return _error("NO_SESSION", "No active debug session")
	# Shared deadline (ready-wait + typing), stamped before the ready-wait so the
	# gap is folded into the budget (#276); server-pushed budget or local fallback.
	var op_start := Time.get_ticks_msec()
	var fallback: float = max(INPUT_TIMEOUT, (text.length() * delay_ms / 1000.0) + 5.0) + READY_TIMEOUT
	var timeout := _pushed_budget(params, fallback)

	if not await _await_bridge_ready(debugger_plugin, op_start, timeout):
		return _error("BRIDGE_NOT_READY", _BRIDGE_NOT_READY_MSG)

	_type_text_pending = true
	_type_text_result = {}

	debugger_plugin.type_text_completed.connect(_on_type_text_completed, CONNECT_ONE_SHOT)
	debugger_plugin.request_type_text(text, delay_ms, submit)

	while _type_text_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - op_start) / 1000.0 > timeout:
			_type_text_pending = false
			if debugger_plugin.type_text_completed.is_connected(_on_type_text_completed):
				debugger_plugin.type_text_completed.disconnect(_on_type_text_completed)
			return _error("TIMEOUT", "Timed out waiting for text input to complete")

	if _type_text_result.has("error"):
		return _error("TYPE_TEXT_ERROR", _type_text_result.get("error", "Unknown error"))

	return _success(_type_text_result)


func _on_type_text_completed(result: Dictionary) -> void:
	_type_text_pending = false
	_type_text_result = result
