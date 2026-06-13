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
var _call_seq := 0


func get_commands() -> Dictionary:
	return {
		"exec_run": exec_run,
		"exec_list": exec_list,
		"exec_remove": exec_remove,
		"exec_clear": exec_clear,
	}


func exec_run(params: Dictionary) -> Dictionary:
	return await _relay("exec_run", params, _relay_timeout(params, RUN_TIMEOUT))


func exec_list(params: Dictionary) -> Dictionary:
	return await _relay("exec_list", params, BASE_TIMEOUT)


func exec_remove(params: Dictionary) -> Dictionary:
	return await _relay("exec_remove", params, BASE_TIMEOUT)


func exec_clear(params: Dictionary) -> Dictionary:
	return await _relay("exec_clear", params, BASE_TIMEOUT)


func _relay_timeout(params: Dictionary, fallback: float) -> float:
	# Use the server-pushed relay budget when present (#276); the local constant
	# is only a fallback for an older server that does not derive the cascade.
	var ms: float = float(params.get("relay_timeout_ms", fallback * 1000.0))
	return ms / 1000.0


func _relay(msg_type: String, params: Dictionary, timeout: float) -> Dictionary:
	# Explicit request/response correlation: the debugger plugin keys responses
	# by msg_type alone, so a timed-out call's LATE response (a slow script that
	# finished after we gave up) could otherwise be consumed as the answer to
	# the next call of the same type — wrong result, silently, and every result
	# after it shifted by one. The bridge echoes call_id; the wait loop discards
	# mismatches. A response with no call_id (older addon) is accepted as-is.
	_call_seq += 1
	var call_id := _call_seq
	params = params.duplicate()
	params["call_id"] = call_id
	var response = await _send_and_wait(msg_type, [params], timeout, call_id)
	if response == null:
		return _last_error
	if response is Dictionary:
		response.erase("call_id")  # transport detail, not part of the result
		if response.has("error"):
			return _error("EXEC_ERROR", str(response["error"]))
		return _success(response)
	return _success({"data": response})


func _send_and_wait(msg_type: String, args: Array, timeout: float, call_id: int):
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
	while true:
		await Engine.get_main_loop().process_frame
		# A hard runtime error (or failed assert) in exec'd code breaks the game
		# into the editor debugger, suspending the bridge handler mid-call —
		# left alone, the game sits paused and this relay times out.
		# Auto-continue: the handler resumes, the error lands in its logger
		# window, and the response arrives with runtime_errors as designed.
		# Honest limit: the break REASON is not queryable, so this resumes ANY
		# break in the window — including a developer's own breakpoint hit by
		# unrelated game code while an exec call is in flight. Accepted for the
		# dev-tooling threat model and surfaced in the tool description.
		if debugger_plugin.is_session_breaked():
			debugger_plugin.continue_session()
		if debugger_plugin.has_response(msg_type):
			var response = debugger_plugin.get_response(msg_type)
			debugger_plugin.clear_response(msg_type)
			if response is Dictionary and response.has("call_id") \
					and int(response["call_id"]) != call_id:
				continue  # a previous call's late response — discard, keep waiting for ours
			return response
		if (Time.get_ticks_msec() - start_time) / 1000.0 > timeout:
			debugger_plugin.clear_response(msg_type)
			var hint := ""
			if debugger_plugin.is_session_breaked():
				hint = " (the game is paused in the editor debugger and did not resume; press Continue in the editor or run godot_editor_edit stop)"
			_last_error = _error("TIMEOUT", "Timed out waiting for %s response%s" % [msg_type, hint])
			return null
	return null  # unreachable; satisfies the parser
