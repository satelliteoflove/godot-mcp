@tool
extends MCPBaseCommand
class_name MCPInputCommands

const INPUT_TIMEOUT := 30.0

var _input_map_result: Dictionary = {}
var _input_map_pending: bool = false

var _sequence_result: Dictionary = {}
var _sequence_pending: bool = false


var _type_text_result: Dictionary = {}
var _type_text_pending: bool = false


func get_commands() -> Dictionary:
	return {
		"get_input_map": get_input_map,
		"execute_input_sequence": execute_input_sequence,
		"type_text": type_text,
	}


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
	return _success({"actions": actions, "source": "editor"})


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


func _on_input_map_received(actions: Array, error: String) -> void:
	_input_map_pending = false
	if error.is_empty():
		_input_map_result = {"actions": actions, "source": "game"}
	else:
		_input_map_result = {"error": error}


func execute_input_sequence(params: Dictionary) -> Dictionary:
	var inputs: Array = params.get("inputs", [])
	if inputs.is_empty():
		return _error("INVALID_PARAMS", "inputs array is required and must not be empty")

	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session")

	var max_end_time: float = 0.0
	for input in inputs:
		var start_ms: float = input.get("start_ms", 0.0)
		var duration_ms: float = input.get("duration_ms", 0.0)
		max_end_time = max(max_end_time, start_ms + duration_ms)

	var timeout := max(INPUT_TIMEOUT, (max_end_time / 1000.0) + 5.0)

	_sequence_pending = true
	_sequence_result = {}

	debugger_plugin.input_sequence_completed.connect(_on_sequence_completed, CONNECT_ONE_SHOT)
	debugger_plugin.request_input_sequence(inputs)

	var start_time := Time.get_ticks_msec()
	while _sequence_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > timeout:
			_sequence_pending = false
			if debugger_plugin.input_sequence_completed.is_connected(_on_sequence_completed):
				debugger_plugin.input_sequence_completed.disconnect(_on_sequence_completed)
			return _error("TIMEOUT", "Timed out waiting for input sequence to complete")

	if _sequence_result.has("error"):
		return _error("SEQUENCE_ERROR", _sequence_result.get("error", "Unknown error"))

	return _success(_sequence_result)


func _on_sequence_completed(result: Dictionary) -> void:
	_sequence_pending = false
	_sequence_result = result


func type_text(params: Dictionary) -> Dictionary:
	var text: String = params.get("text", "")
	var delay_ms: int = int(params.get("delay_ms", 50))
	var submit: bool = params.get("submit", false)

	if text.is_empty():
		return _error("INVALID_PARAMS", "text is required and must not be empty")

	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session")

	var timeout := max(INPUT_TIMEOUT, (text.length() * delay_ms / 1000.0) + 5.0)

	_type_text_pending = true
	_type_text_result = {}

	debugger_plugin.type_text_completed.connect(_on_type_text_completed, CONNECT_ONE_SHOT)
	debugger_plugin.request_type_text(text, delay_ms, submit)

	var start_time := Time.get_ticks_msec()
	while _type_text_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > timeout:
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
