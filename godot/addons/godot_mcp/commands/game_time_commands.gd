@tool
extends MCPBaseCommand
class_name MCPGameTimeCommands

# Game-time control relay: freeze / step / step_until / thaw / status execute in
# the game bridge (see mcp_game_bridge.gd); this side only forwards over the
# debugger channel and waits. Timeout cascade (#276): the server derives the
# whole stagger from the call's in-game budget and pushes relay_timeout_ms down
# in params; we wait exactly that long, so the bridge (which returns by its
# pushed wall budget) answers first and errors surface typed. BASE_TIMEOUT and
# STEP_TIMEOUT are fallbacks only — for an older server that pushes no budget.
const BASE_TIMEOUT := 10.0
const STEP_TIMEOUT := 28.0

var _last_error: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"game_time_freeze": game_time_freeze,
		"game_time_step": game_time_step,
		"game_time_step_until": game_time_step_until,
		"game_time_thaw": game_time_thaw,
		"game_time_status": game_time_status,
	}


func game_time_freeze(params: Dictionary) -> Dictionary:
	return await _relay("game_time_freeze", [params], BASE_TIMEOUT)


func game_time_step(params: Dictionary) -> Dictionary:
	return await _relay("game_time_step", [params], _relay_timeout(params, STEP_TIMEOUT))


func game_time_step_until(params: Dictionary) -> Dictionary:
	return await _relay("game_time_step_until", [params], _relay_timeout(params, STEP_TIMEOUT))


func game_time_thaw(params: Dictionary) -> Dictionary:
	return await _relay("game_time_thaw", [params], BASE_TIMEOUT)


func game_time_status(params: Dictionary) -> Dictionary:
	return await _relay("game_time_status", [params], BASE_TIMEOUT)


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
		return _error("GAME_TIME_ERROR", str(response["error"]))
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
		if (Time.get_ticks_msec() - start_time) / 1000.0 > timeout:
			debugger_plugin.clear_response(msg_type)
			_last_error = _error("TIMEOUT", "Timed out waiting for %s response" % msg_type)
			return null

	var response = debugger_plugin.get_response(msg_type)
	debugger_plugin.clear_response(msg_type)
	return response
