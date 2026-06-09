@tool
extends MCPBaseCommand
class_name MCPExecCommands

# godot_exec relay (#243): run / list / remove / clear execute in the game
# bridge (mcp_game_bridge.gd); this side only forwards over the debugger
# channel and waits, exactly like game_time_commands.gd. The server derives the
# timeout cascade from the call's declared budget and pushes relay_timeout_ms
# in params; the constants are fallbacks for an older server that pushes none.
# RUN_TIMEOUT is generous because a synchronous user script cannot be aborted
# mid-flight — the relay waiting is what turns a hung script into a typed
# TIMEOUT instead of a socket kill.
const BASE_TIMEOUT := 10.0
const RUN_TIMEOUT := 28.0

var _last_error: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"exec_run": exec_run,
		"exec_list": exec_list,
		"exec_remove": exec_remove,
		"exec_clear": exec_clear,
	}


func exec_run(params: Dictionary) -> Dictionary:
	return await _relay("exec_run", [params], _relay_timeout(params, RUN_TIMEOUT))


func exec_list(params: Dictionary) -> Dictionary:
	return await _relay("exec_list", [params], BASE_TIMEOUT)


func exec_remove(params: Dictionary) -> Dictionary:
	return await _relay("exec_remove", [params], BASE_TIMEOUT)


func exec_clear(params: Dictionary) -> Dictionary:
	return await _relay("exec_clear", [params], BASE_TIMEOUT)


func _relay_timeout(params: Dictionary, fallback: float) -> float:
	# Use the server-pushed relay budget when present (#276); the local constant
	# is only a fallback for an older server that does not derive the cascade.
	var ms: float = float(params.get("relay_timeout_ms", fallback * 1000.0))
	return ms / 1000.0


func _relay(msg_type: String, args: Array, timeout: float) -> Dictionary:
	var response = await _send_and_wait(msg_type, args, timeout)
	if response == null:
		return _last_error
	if response is Dictionary and response.has("error"):
		return _error("EXEC_ERROR", str(response["error"]))
	if response is Dictionary:
		return _success(response)
	return _success({"data": response})


func _send_and_wait(msg_type: String, args: Array, timeout: float):
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
		# A hard runtime error (or failed assert, or breakpoint) hit by exec'd
		# code breaks the game into the editor debugger, suspending the bridge
		# handler mid-call — left alone, the game sits paused and this relay
		# times out. Auto-continue: the handler resumes, the error lands in its
		# logger window, and the response arrives with runtime_errors as
		# designed. Scoped to exec relays: only here is the break, by contract,
		# the agent's own injected code.
		if debugger_plugin.is_session_breaked():
			debugger_plugin.continue_session()
		if (Time.get_ticks_msec() - start_time) / 1000.0 > timeout:
			debugger_plugin.clear_response(msg_type)
			var hint := ""
			if debugger_plugin.is_session_breaked():
				hint = " (the game is paused in the editor debugger and did not resume; press Continue in the editor or run godot_editor stop)"
			_last_error = _error("TIMEOUT", "Timed out waiting for %s response%s" % [msg_type, hint])
			return null

	var response = debugger_plugin.get_response(msg_type)
	debugger_plugin.clear_response(msg_type)
	return response
