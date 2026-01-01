@tool
extends MCPBaseCommand
class_name MCPDebugCommands

const DEBUG_OUTPUT_TIMEOUT := 5.0
const PERFORMANCE_METRICS_TIMEOUT := 5.0

var _debug_output_result: PackedStringArray = []
var _debug_output_pending: bool = false

var _performance_metrics_result: Dictionary = {}
var _performance_metrics_pending: bool = false


func get_commands() -> Dictionary:
	return {
		"run_project": run_project,
		"stop_project": stop_project,
		"get_debug_output": get_debug_output,
		"get_performance_metrics": get_performance_metrics
	}


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")

	MCPLogger.clear()

	if scene_path.is_empty():
		EditorInterface.play_main_scene()
	else:
		EditorInterface.play_custom_scene(scene_path)

	return _success({})


func stop_project(_params: Dictionary) -> Dictionary:
	EditorInterface.stop_playing_scene()
	return _success({})


func get_debug_output(params: Dictionary) -> Dictionary:
	var clear: bool = params.get("clear", false)

	if not EditorInterface.is_playing_scene():
		var output := "\n".join(MCPLogger.get_output())
		if clear:
			MCPLogger.clear()
		return _success({"output": output})

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		var output := "\n".join(MCPLogger.get_output())
		if clear:
			MCPLogger.clear()
		return _success({"output": output})

	_debug_output_pending = true
	_debug_output_result = PackedStringArray()

	debugger_plugin.debug_output_received.connect(_on_debug_output_received, CONNECT_ONE_SHOT)
	debugger_plugin.request_debug_output(clear)

	var start_time := Time.get_ticks_msec()
	while _debug_output_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > DEBUG_OUTPUT_TIMEOUT:
			_debug_output_pending = false
			if debugger_plugin.debug_output_received.is_connected(_on_debug_output_received):
				debugger_plugin.debug_output_received.disconnect(_on_debug_output_received)
			return _success({"output": "\n".join(MCPLogger.get_output())})

	return _success({"output": "\n".join(_debug_output_result)})


func _on_debug_output_received(output: PackedStringArray) -> void:
	_debug_output_pending = false
	_debug_output_result = output


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
		if (Time.get_ticks_msec() - start_time) / 1000.0 > PERFORMANCE_METRICS_TIMEOUT:
			_performance_metrics_pending = false
			if debugger_plugin.performance_metrics_received.is_connected(_on_performance_metrics_received):
				debugger_plugin.performance_metrics_received.disconnect(_on_performance_metrics_received)
			return _error("TIMEOUT", "Timed out waiting for performance metrics")

	return _success(_performance_metrics_result)


func _on_performance_metrics_received(metrics: Dictionary) -> void:
	_performance_metrics_pending = false
	_performance_metrics_result = metrics
