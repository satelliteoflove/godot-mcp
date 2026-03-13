@tool
extends MCPBaseCommand
class_name MCPProfilerCommands

const PROFILER_TIMEOUT := 5.0
const GENERIC_TIMEOUT := 5.0

var _performance_metrics_pending: bool = false
var _performance_metrics_result: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"get_performance_metrics": get_performance_metrics,
		"start_profiler": start_profiler,
		"stop_profiler": stop_profiler,
		"get_profiler_data": get_profiler_data,
		"get_active_processes": get_active_processes,
		"get_signal_connections": get_signal_connections,
	}


func get_performance_metrics(_params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session")

	_performance_metrics_pending = true
	_performance_metrics_result = {}

	debugger_plugin.performance_metrics_received.connect(_on_performance_metrics_received, CONNECT_ONE_SHOT)
	debugger_plugin.request_performance_metrics()

	var start_time := Time.get_ticks_msec()
	while _performance_metrics_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > PROFILER_TIMEOUT:
			_performance_metrics_pending = false
			if debugger_plugin.performance_metrics_received.is_connected(_on_performance_metrics_received):
				debugger_plugin.performance_metrics_received.disconnect(_on_performance_metrics_received)
			return _error("TIMEOUT", "Timed out waiting for performance metrics")

	return _success(_performance_metrics_result)


func _on_performance_metrics_received(metrics: Dictionary) -> void:
	_performance_metrics_pending = false
	_performance_metrics_result = metrics


func start_profiler(_params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session")

	debugger_plugin.toggle_frame_profiler(true)
	return _success({"message": "Frame profiler started"})


func stop_profiler(_params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running")

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session")

	debugger_plugin.toggle_frame_profiler(false)
	return _success({"message": "Frame profiler stopped"})


func get_profiler_data(_params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("get_profiler_data")
	if result == null:
		return _last_error
	var result_dict: Dictionary
	if result is Dictionary:
		result_dict = result
	else:
		result_dict = {"data": result}
	return _success(result_dict)


func get_active_processes(_params: Dictionary) -> Dictionary:
	var result = await _send_and_wait("get_active_processes")
	if result == null:
		return _last_error
	var result_dict: Dictionary
	if result is Dictionary:
		result_dict = result
	else:
		result_dict = {"data": result}
	return _success(result_dict)


func get_signal_connections(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var result = await _send_and_wait("get_signal_connections", [node_path])
	if result == null:
		return _last_error
	var result_dict: Dictionary
	if result is Dictionary:
		result_dict = result
	else:
		result_dict = {"data": result}
	return _success(result_dict)


var _last_error: Dictionary = {}


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
