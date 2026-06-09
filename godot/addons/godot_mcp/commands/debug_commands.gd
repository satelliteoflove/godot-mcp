@tool
extends MCPBaseCommand
class_name MCPDebugCommands

const DEBUG_OUTPUT_TIMEOUT := 5.0
# Keep in sync with LAUNCH_FROZEN_ENV in mcp_game_bridge.gd.
const LAUNCH_FROZEN_ENV := "GODOT_MCP_LAUNCH_FROZEN"

var _debug_output_result: PackedStringArray = []
var _debug_output_pending: bool = false


func get_commands() -> Dictionary:
	return {
		"run_project": run_project,
		"stop_project": stop_project,
		"get_debug_output": get_debug_output,
		"get_log_messages": get_log_messages,
		"get_errors": get_errors,
		"get_stack_trace": get_stack_trace,
	}


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	var frozen: bool = params.get("frozen", false)

	MCPLogger.clear()

	# Launch-frozen: the spawned game inherits the editor's environment, so
	# setting this before play makes the bridge freeze the tree in _ready —
	# before the first process frame. Deterministic, unlike sending a freeze
	# message after the debug session comes up (which races the game's first
	# frames against the agent's latency).
	if frozen:
		OS.set_environment(LAUNCH_FROZEN_ENV, "1")

	if scene_path.is_empty():
		EditorInterface.play_main_scene()
	else:
		EditorInterface.play_custom_scene(scene_path)

	if frozen:
		# The child captured its environment at spawn; clear promptly so a
		# manual F5 run doesn't inherit the freeze. Two frames covers a
		# deferred spawn. (Godot has no unset; empty fails the == "1" check.)
		await Engine.get_main_loop().process_frame
		await Engine.get_main_loop().process_frame
		OS.set_environment(LAUNCH_FROZEN_ENV, "")

	return _success({"frozen": frozen})


func stop_project(_params: Dictionary) -> Dictionary:
	EditorInterface.stop_playing_scene()
	return _success({})


func get_debug_output(params: Dictionary) -> Dictionary:
	var clear: bool = params.get("clear", false)
	var source: String = params.get("source", "")

	if source == "editor":
		var output := "\n".join(MCPLogger.get_output())
		if clear:
			MCPLogger.clear()
		return _success({"output": output, "source": "editor"})

	if source == "game":
		if not EditorInterface.is_playing_scene():
			return _error("NOT_RUNNING", "No game is currently running. Use source: 'editor' for editor output.")
		var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
		if debugger_plugin == null or not debugger_plugin.has_active_session():
			return _error("NO_SESSION", "No active debug session. Use source: 'editor' for editor output.")
		return await _fetch_game_debug_output(debugger_plugin, clear)

	if not EditorInterface.is_playing_scene():
		var output := "\n".join(MCPLogger.get_output())
		if clear:
			MCPLogger.clear()
		return _success({"output": output, "source": "editor"})

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null or not debugger_plugin.has_active_session():
		var output := "\n".join(MCPLogger.get_output())
		if clear:
			MCPLogger.clear()
		return _success({"output": output, "source": "editor"})

	return await _fetch_game_debug_output(debugger_plugin, clear)


func _fetch_game_debug_output(debugger_plugin: MCPDebuggerPlugin, clear: bool) -> Dictionary:
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
			return _success({"output": "\n".join(MCPLogger.get_output()), "source": "editor"})

	return _success({"output": "\n".join(_debug_output_result), "source": "game"})


func _on_debug_output_received(output: PackedStringArray) -> void:
	_debug_output_pending = false
	_debug_output_result = output


func get_log_messages(params: Dictionary) -> Dictionary:
	var clear: bool = params.get("clear", false)
	var limit: int = int(params.get("limit", 50))
	var severity: String = params.get("severity", "all")
	var since: int = int(params.get("since", 0))

	var result := MCPLogger.query(since, severity, limit)

	if clear:
		MCPLogger.clear_errors()

	# The phantom "Identifier not found: <autoload>" errors that mislead agents
	# come from the editor running stale after project.godot was edited on disk
	# (#245). When that divergence is present, attach it here so the caller reads
	# the log and the "your editor is stale, restart it" advisory in one shot,
	# instead of chasing compile errors that do not exist at runtime.
	var staleness := MCPUtils.detect_project_staleness()
	if staleness.get("stale", false):
		result["staleness"] = staleness

	return _success(result)


func get_errors(params: Dictionary) -> Dictionary:
	return get_log_messages(params)


func get_stack_trace(_params: Dictionary) -> Dictionary:
	var frames := MCPLogger.get_last_stack_trace()
	var errors := MCPLogger.get_errors()
	var last_error: Dictionary = errors[-1] if not errors.is_empty() else {}
	return _success({
		"error": last_error.get("message", ""),
		"error_type": last_error.get("type", ""),
		"file": last_error.get("file", ""),
		"line": last_error.get("line", 0),
		"frames": frames,
	})
