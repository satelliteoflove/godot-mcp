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


# How long to wait for the editor to report a running scene before calling the
# launch a failure. The play process spawns synchronously; this only needs to
# cover a deferred start, not game boot.
const LAUNCH_CONFIRM_TIMEOUT_SEC := 2.0


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	var frozen: bool = params.get("frozen", false)

	# play_main_scene() with no main scene set pops a modal in the editor and
	# launches nothing; reporting success there is a silent no-op (#347).
	if scene_path.is_empty():
		var main_scene := str(ProjectSettings.get_setting("application/run/main_scene", ""))
		if main_scene.is_empty():
			return _error("NO_MAIN_SCENE",
				"application/run/main_scene is not set, so there is nothing to run. " +
				"Pass scene_path, or set the main scene in project settings.")

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

	# Confirm something actually launched before reporting success (#347).
	var start := Time.get_ticks_msec()
	while not EditorInterface.is_playing_scene():
		if (Time.get_ticks_msec() - start) / 1000.0 > LAUNCH_CONFIRM_TIMEOUT_SEC:
			return _error("RUN_FAILED",
				"The editor did not start playing within %.1fs. " % LAUNCH_CONFIRM_TIMEOUT_SEC +
				"Check get_log_messages for the reason (a missing scene file or an editor dialog blocking the run).")
		await Engine.get_main_loop().process_frame

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
