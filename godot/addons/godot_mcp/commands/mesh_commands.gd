@tool
extends MCPBaseCommand
class_name MCPMeshCommands
## Relays mesh-integrity commands to the running game's bridge.

# Full validation walks every ArrayMesh surface — generous timeout for big scenes.
const VALIDATE_TIMEOUT := 20.0

var _last_error: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"validate_meshes": validate_meshes,
	}


func validate_meshes(params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("validate_meshes", [params], VALIDATE_TIMEOUT)
	if result == null:
		return _last_error
	if result is Dictionary:
		return _success(result)
	return _success({"data": result})


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
