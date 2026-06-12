@tool
extends MCPBaseCommand
class_name MCPDebugCommands

# Keep in sync with LAUNCH_FROZEN_ENV in mcp_game_bridge.gd.
const LAUNCH_FROZEN_ENV := "GODOT_MCP_LAUNCH_FROZEN"


func get_commands() -> Dictionary:
	return {
		"run_project": run_project,
		"stop_project": stop_project,
		"get_log_messages": get_log_messages,
		"get_stack_trace": get_stack_trace,
	}


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	var frozen: bool = params.get("frozen", false)

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
