@tool
extends MCPBaseCommand
class_name MCPRuntimeStateCommands


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
	var result = await _send_and_wait("watch_start", [specs, hz, duration_ms])
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
