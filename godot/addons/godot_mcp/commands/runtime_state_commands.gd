@tool
extends MCPBaseCommand
class_name MCPRuntimeStateCommands

const GENERIC_TIMEOUT := 5.0
var _last_error: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"get_runtime_state": get_runtime_state,
		"watch_start": watch_start,
		"watch_collect": watch_collect,
		"watch_stop": watch_stop,
	}


func get_runtime_state(params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("get_runtime_state", [params])
	if result == null:
		return _last_error
	if result is Dictionary:
		return _success(result)
	return _success({"data": result})


func watch_start(params: Dictionary) -> Dictionary:
	var specs: Array = params.get("specs", [])
	var hz: int = params.get("hz", 20)
	var duration_ms: int = params.get("duration_ms", 1000)
	var sigs: Array = params.get("signals", [])
	var result = await _send_and_wait("watch_start", [specs, hz, duration_ms, sigs])
	if result == null:
		return _last_error
	if result is Dictionary:
		return _success(result)
	return _success({"started": true})


func watch_collect(_params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("watch_collect", [])
	if result == null:
		return _last_error
	if result is Dictionary:
		return _success(result)
	return _success({"data": result})


func watch_stop(_params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("watch_stop", [])
	if result == null:
		return _last_error
	if result is Dictionary:
		return _success(result)
	return _success({"stopped": true})


func _send_and_wait(msg_type: String, args: Array = []):
	if not EditorInterface.is_playing_scene():
		_last_error = _error("NOT_RUNNING", "No game is currently running")
		return null

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		_last_error = _error("NO_SESSION", "No active debug session")
		return null

	var sent: bool = debugger_plugin.send_game_message(msg_type, args)
	if not sent:
		_last_error = _error("SEND_FAILED", "Failed to send message to game")
		return null

	var start_time := Time.get_ticks_msec()
	while not debugger_plugin.has_response(msg_type):
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > GENERIC_TIMEOUT:
			debugger_plugin.clear_response(msg_type)
			_last_error = _error("TIMEOUT", "Timed out waiting for %s response" % msg_type)
			return null

	var response = debugger_plugin.get_response(msg_type)
	debugger_plugin.clear_response(msg_type)
	return response
