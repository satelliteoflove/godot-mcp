extends Node
class_name MCPGameBridge

const DEFAULT_MAX_WIDTH := 1024
const Onscreen := preload("onscreen.gd")

# Cap on frames waited for the main scene to appear before announcing ready
# anyway. The scene is normally added within a frame or two of the bridge
# autoload's _ready; the cap only matters for a scene-less run (a SceneTree-only
# tool), so it never blocks readiness forever. ~10s at 60 fps.
const READY_SCENE_WAIT_FRAMES := 600

var _logger: _MCPGameLogger
var _profiler: MCPFrameProfiler
var _sampler: MCPRuntimeStateSampler

# Set once the bridge has told the editor the game is ready to drive. Guards the
# announcement against firing twice and lets the headless test observe it.
var _ready_announced := false


func _ready() -> void:
	# The bridge must keep processing while the scene tree is paused. Input
	# sequences are driven from _process, so without this a press that toggles
	# `paused = true` freezes the runner mid-sequence: the paired release never
	# fires and the editor-side wait times out (~30s) — pause menus, a primary
	# injection target, become undrivable. The bridge answers to the debugger,
	# not the game's pause state. Children (the sampler) inherit this mode.
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not EngineDebugger.is_active():
		return
	_logger = _MCPGameLogger.new()
	OS.add_logger(_logger)
	_profiler = MCPFrameProfiler.new()
	EngineDebugger.register_profiler("mcp_frame_profiler", _profiler)
	_sampler = MCPRuntimeStateSampler.new()
	add_child(_sampler)
	EngineDebugger.register_message_capture("godot_mcp", _on_debugger_message)
	set_physics_process(false)  # only counts ticks during a step window
	MCPLog.info("Game bridge initialized")

	# Launch-frozen: the editor sets this env var just before spawning the game
	# (godot_editor run with frozen=true), so the freeze lands before the first
	# process frame — agent latency between run and the first input costs the
	# game nothing. Scene _ready callbacks still run; processing does not start.
	if OS.get_environment(LAUNCH_FROZEN_ENV) == "1":
		_launched_frozen = true
		_engage_freeze()
		MCPLog.info("Game bridge: launched frozen")

	# Tell the editor when the game is actually drivable, so input injected right
	# after `run` is not silently dropped into a half-booted game (see #241).
	_announce_bridge_ready_when_drivable()


func _exit_tree() -> void:
	# Guaranteed cleanup: never leave an action latched when the bridge node
	# leaves the tree (game shutdown / scene change). Safe if nothing is held.
	_release_held_actions()
	if EngineDebugger.is_active():
		EngineDebugger.unregister_message_capture("godot_mcp")
		if _profiler:
			EngineDebugger.unregister_profiler("mcp_frame_profiler")


# The bridge autoload's _ready runs BEFORE the main scene is added to the tree,
# so the debug session is live (and the editor sees has_active_session) while
# current_scene is still null. Input injected in that window is dispatched into a
# game that has nothing to consume it — reported as executed, but a silent no-op
# (#241). Wait for the scene to exist plus one frame (so its own _ready/input
# wiring has run), then announce readiness; the editor gates input on this signal.
func _announce_bridge_ready_when_drivable() -> void:
	var tree := get_tree()
	if tree == null:
		return
	var frames := 0
	while tree.current_scene == null and frames < READY_SCENE_WAIT_FRAMES:
		await tree.process_frame
		frames += 1
	# One more frame so a freshly-added scene has had its first _ready/process pass.
	# process_frame fires even while paused, so launch-frozen runs still report ready.
	await tree.process_frame
	var scene_path := tree.current_scene.scene_file_path if tree.current_scene else ""
	_emit_bridge_ready(scene_path)


func _emit_bridge_ready(scene_path: String) -> void:
	if _ready_announced:
		return
	_ready_announced = true
	EngineDebugger.send_message("godot_mcp:bridge_ready", [scene_path])
	MCPLog.info("Game bridge: ready to drive (%s)" % scene_path)


func _process(delta: float) -> void:
	_game_time_process(delta)
	_sequence_process(delta)


# Processing is needed by three independent features; only switch it off when
# none of them is active (the frozen monitor must run every frame, so the old
# "disable after the sequence" shortcut no longer applies unconditionally).
func _update_processing() -> void:
	set_process(_sequence_running or _frozen or _step_active)


func _sequence_process(delta: float) -> void:
	if not _sequence_running:
		return

	var tree := get_tree()

	# Drain phase: the timeline is exhausted, but a requested effect probe still
	# needs its `after` reading. The bridge runs BEFORE the scene and injected
	# events flush at the top of the NEXT frame, so a snapshot taken the instant
	# the queue empties would precede gameplay processing the final input — a real
	# effect would read as a no-op. Let a couple of gameplay frames elapse first.
	if _sequence_draining:
		if tree and not tree.paused:
			_sequence_gameplay_ms += delta * 1000.0
		if _sequence_settle_remaining > 0:
			_sequence_settle_remaining -= 1
		# Finalize only once the settle frames have elapsed (so an effect probe's
		# `after` reflects the final input) AND every deferred frame capture has
		# been sent back.
		if _sequence_settle_remaining <= 0 and _sequence_captures_pending == 0:
			_emit_sequence_result()
		return

	# Game time the sequence actually advanced (unpaused, scaled) vs. wall time
	# is a no-setup no-op signal: a sequence that ran entirely under a pause or
	# freeze shows gameplay_ms ~= 0 against a full wall_ms.
	if tree and not tree.paused:
		_sequence_gameplay_ms += delta * 1000.0

	var elapsed := Time.get_ticks_msec() - _sequence_start_time

	while _sequence_events.size() > 0 and _sequence_events[0].time <= elapsed:
		var seq_event: Dictionary = _sequence_events.pop_front()
		var input_event := InputEventAction.new()
		input_event.action = seq_event.action
		input_event.pressed = seq_event.is_press
		input_event.strength = 1.0 if seq_event.is_press else 0.0
		Input.parse_input_event(input_event)
		if seq_event.is_press:
			_held_actions[seq_event.action] = true
		else:
			_held_actions.erase(seq_event.action)
			_actions_completed += 1

	# Trigger any frame captures whose offset has arrived (#239). Capture is
	# deferred to frame_post_draw, so it completes a frame or two later; the
	# pending count keeps the result from being sent until every frame is in.
	while _sequence_capture_offsets.size() > 0 and int(_sequence_capture_offsets[0]) <= elapsed:
		var off: int = int(_sequence_capture_offsets.pop_front())
		_sequence_captures_pending += 1
		_capture_sequence_frame.call_deferred(off)

	# Done when both the input timeline and the capture schedule are exhausted;
	# captures scheduled past the last input keep the window open until their
	# offsets arrive.
	if _sequence_events.is_empty() and _sequence_capture_offsets.is_empty():
		if not _sequence_report.is_empty():
			# Defer so the effect probe's `after` reflects the final input.
			_sequence_draining = true
			_sequence_settle_remaining = SEQUENCE_SETTLE_FRAMES
		elif _sequence_captures_pending == 0:
			_emit_sequence_result()
		else:
			# No probe, but captures are still resolving — wait for them.
			_sequence_draining = true
			_sequence_settle_remaining = 0


# Assemble and send the input-sequence result, then reset probe state. Carries an
# effect signal (#240): always-on context (scene / pause / freeze / game-vs-wall
# time) plus, when the caller attached a `report`, the per-expression before->after
# delta and an `any_changed` summary — enough to tell "inputs changed the world"
# from "inputs fell into the void" in one round-trip.
func _emit_sequence_result() -> void:
	_sequence_running = false
	_sequence_draining = false
	_update_processing()

	var tree := get_tree()
	var result: Dictionary = {
		"completed": true,
		"actions_executed": _actions_completed,
		"scene": tree.current_scene.scene_file_path if tree and tree.current_scene else "",
		"tree_paused": tree.paused if tree else false,
		"frozen": _frozen,
		"gameplay_ms": roundi(_sequence_gameplay_ms),
		"wall_ms": Time.get_ticks_msec() - _sequence_start_time,
	}

	if not _sequence_report.is_empty():
		var after := _evaluate_report(_sequence_report, _sequence_report_inputs)
		result.merge(_compute_report_deltas(_sequence_report_before, after))

	_sequence_report = []
	_sequence_report_inputs = []
	_sequence_report_before = {}

	EngineDebugger.send_message("godot_mcp:input_sequence_result", [result])


# Pure before/after diff over the probe expressions: {report: {src: {before, after,
# changed}}, any_changed}. A missing `after` (expression started erroring) reads as
# null and so counts as changed — the world did move. Kept side-effect-free so the
# headless test can assert it directly.
func _compute_report_deltas(before: Dictionary, after: Dictionary) -> Dictionary:
	var deltas: Dictionary = {}
	var any_changed := false
	for src in before:
		var b: Variant = before[src]
		var a: Variant = after.get(src, null)
		var changed: bool = b != a
		if changed:
			any_changed = true
		deltas[src] = {"before": b, "after": a, "changed": changed}
	return {"report": deltas, "any_changed": any_changed}


# Capture one frame mid-sequence (#239) and stream it back on its own message.
# Deferred from _sequence_process to frame_post_draw so it reads the rendered
# frame nearest the requested offset; the actual elapsed offset is reported
# alongside so the agent knows exactly when each frame landed. Each capture rides
# its own message, and the count gates the result.
#
# Encoded as lossless PNG, deliberately not JPEG: vision-token cost is a function
# of resolution (≈ width*height/750), not of file size or codec, so JPEG would
# only add compression artifacts for zero token saving. The token lever is
# _sequence_capture_max_width (resolution); PNG just costs more transport bytes.
func _capture_sequence_frame(requested_offset_ms: int) -> void:
	await RenderingServer.frame_post_draw
	var actual_ms := Time.get_ticks_msec() - _sequence_start_time
	var viewport := get_viewport()
	if viewport == null:
		_send_sequence_capture(requested_offset_ms, actual_ms, false, "", 0, 0, "NO_VIEWPORT: could not get game viewport")
		return
	var image := viewport.get_texture().get_image()
	if image == null:
		_send_sequence_capture(requested_offset_ms, actual_ms, false, "", 0, 0, "CAPTURE_FAILED: could not read viewport image")
		return
	if _sequence_capture_max_width > 0 and image.get_width() > _sequence_capture_max_width:
		var scale_factor := float(_sequence_capture_max_width) / float(image.get_width())
		image.resize(_sequence_capture_max_width, int(image.get_height() * scale_factor), Image.INTERPOLATE_LANCZOS)
	var png_buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_buffer)
	_send_sequence_capture(requested_offset_ms, actual_ms, true, base64, image.get_width(), image.get_height(), "")


func _send_sequence_capture(requested_ms: int, actual_ms: int, ok: bool, base64: String, width: int, height: int, error: String) -> void:
	# Decrement first: the result is gated on this reaching zero, and a capture
	# that errors must still release its slot or the sequence would never finish.
	_sequence_captures_pending = maxi(0, _sequence_captures_pending - 1)
	EngineDebugger.send_message("godot_mcp:sequence_capture", [requested_ms, actual_ms, ok, base64, width, height, error])


var _sequence_events: Array = []
var _sequence_start_time: int = 0
var _sequence_running: bool = false
var _actions_completed: int = 0
var _actions_total: int = 0
# Game time (unpaused, scaled) accumulated across the sequence window — compared
# against wall time in the result to flag a sequence that ran under a pause/freeze.
var _sequence_gameplay_ms: float = 0.0
# Drain phase: after the timeline empties, hold for a few frames so an effect
# probe's `after` reflects the final input before the result is sent.
var _sequence_draining: bool = false
var _sequence_settle_remaining: int = 0
const SEQUENCE_SETTLE_FRAMES := 2
# Optional effect probe (#240): compiled GDScript expressions [{src, expr}]
# evaluated in the step_until predicate context, once before the first input and
# again after the last, to prove the sequence changed something.
var _sequence_report: Array = []
var _sequence_report_inputs: Array = []
var _sequence_report_before: Dictionary = {}
# Mid-sequence frame capture (#239): offsets (ms from start, sorted) still to be
# captured during the real-time run, the capture params, and the count of
# deferred captures not yet sent — the result is held until this reaches zero.
var _sequence_capture_offsets: Array = []
var _sequence_captures_pending: int = 0
var _sequence_capture_max_width: int = 640
const SEQUENCE_MAX_CAPTURES := 8
# Non-binding sanity backstop only (#276). The server derives the per-call
# timeout from the sequence span and rejects offsets beyond what the ceiling
# permits before they ever reach here, so this just guards a malformed direct
# message. Kept far above any server-permitted budget so it never silently
# clamps a legitimate offset (which would reintroduce the cross-layer drift
# that #276 removed).
const SEQUENCE_MAX_CAPTURE_OFFSET_MS := 300000
# Actions whose press has been injected but whose paired release has not yet
# fired. Used to guarantee a release even if the queue is cleared mid-flight
# (new sequence) or the node leaves the tree — otherwise the dropped release
# latches the action "pressed" in the Input singleton (the stuck-held bug).
var _held_actions: Dictionary = {}


# Release any action still held from an interrupted sequence. A release here is a
# guaranteed cleanup, never a queued step that a clear could drop. Safe to call
# when nothing is held.
func _release_held_actions() -> void:
	if _held_actions.is_empty():
		return
	for action in _held_actions.keys():
		var release := InputEventAction.new()
		release.action = action
		release.pressed = false
		release.strength = 0.0
		Input.parse_input_event(release)
	# Flush so the release takes effect immediately — _exit_tree may not get
	# another frame, and a cleanup should be deterministic, not deferred.
	Input.flush_buffered_events()
	_held_actions.clear()


func _on_debugger_message(message: String, data: Array) -> bool:
	match message:
		"take_screenshot":
			_take_screenshot_deferred.call_deferred(data)
			return true
		"get_debug_output":
			_handle_get_debug_output(data)
			return true
		"get_performance_metrics":
			_handle_get_performance_metrics()
			return true
		"find_nodes":
			_handle_find_nodes(data)
			return true
		"get_input_map":
			_handle_get_input_map()
			return true
		"execute_input_sequence":
			_handle_execute_input_sequence(data)
			return true
		"type_text":
			_handle_type_text(data)
			return true
		"get_profiler_data":
			_handle_get_profiler_data()
			return true
		"get_active_processes":
			_handle_get_active_processes()
			return true
		"get_signal_connections":
			_handle_get_signal_connections(data)
			return true
		"get_runtime_state":
			_handle_get_runtime_state(data)
			return true
		"watch_start":
			_handle_watch_start(data)
			return true
		"watch_collect":
			_handle_watch_collect()
			return true
		"watch_stop":
			_handle_watch_stop()
			return true
		"game_time_freeze":
			_handle_game_time_freeze(data)
			return true
		"game_time_step":
			_handle_game_time_step(data)
			return true
		"game_time_step_until":
			_handle_game_time_step_until(data)
			return true
		"game_time_thaw":
			_handle_game_time_thaw(data)
			return true
		"game_time_status":
			_handle_game_time_status(data)
			return true
	return false


func _take_screenshot_deferred(data: Array) -> void:
	var max_width: int = data[0] if data.size() > 0 else DEFAULT_MAX_WIDTH
	await RenderingServer.frame_post_draw
	_capture_and_send_screenshot(max_width)


# Lossless PNG, not JPEG: image vision-token cost scales with resolution, not
# codec, so JPEG only traded fidelity (compression artifacts) for nothing. Width
# is downscaled to max_width to bound that resolution-driven cost.
func _capture_and_send_screenshot(max_width: int) -> void:
	var viewport := get_viewport()
	if viewport == null:
		_send_screenshot_error("NO_VIEWPORT", "Could not get game viewport")
		return
	var image := viewport.get_texture().get_image()
	if image == null:
		_send_screenshot_error("CAPTURE_FAILED", "Failed to capture image from viewport")
		return
	if max_width > 0 and image.get_width() > max_width:
		var scale_factor := float(max_width) / float(image.get_width())
		var new_height := int(image.get_height() * scale_factor)
		image.resize(max_width, new_height, Image.INTERPOLATE_LANCZOS)
	var png_buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_buffer)
	EngineDebugger.send_message("godot_mcp:screenshot_result", [
		true,
		base64,
		image.get_width(),
		image.get_height(),
		""
	])


func _send_screenshot_error(code: String, message: String) -> void:
	EngineDebugger.send_message("godot_mcp:screenshot_result", [
		false,
		"",
		0,
		0,
		"%s: %s" % [code, message]
	])


func _handle_get_debug_output(data: Array) -> void:
	var clear: bool = data[0] if data.size() > 0 else false
	var output := _logger.get_output() if _logger else PackedStringArray()
	if clear and _logger:
		_logger.clear()
	EngineDebugger.send_message("godot_mcp:debug_output_result", [output])


func _handle_find_nodes(data: Array) -> void:
	var name_pattern: String = data[0] if data.size() > 0 else ""
	var type_filter: String = data[1] if data.size() > 1 else ""
	var root_path: String = data[2] if data.size() > 2 else ""

	var tree := get_tree()
	var scene_root := tree.current_scene if tree else null
	if not scene_root:
		EngineDebugger.send_message("godot_mcp:find_nodes_result", [[], 0, "No scene running"])
		return

	var search_root: Node = scene_root
	if not root_path.is_empty():
		search_root = _get_node_from_path(root_path, scene_root)
		if not search_root:
			EngineDebugger.send_message("godot_mcp:find_nodes_result", [[], 0, "Root not found: " + root_path])
			return

	var matches: Array = []
	_find_recursive(search_root, scene_root, name_pattern, type_filter, matches)
	EngineDebugger.send_message("godot_mcp:find_nodes_result", [matches, matches.size(), ""])


func _get_node_from_path(path: String, scene_root: Node) -> Node:
	if path == "/" or path.is_empty():
		return scene_root

	if path.begins_with("/root/"):
		var parts := path.split("/")
		if parts.size() >= 3 and parts[2] == scene_root.name:
			var relative := "/".join(parts.slice(3))
			if relative.is_empty():
				return scene_root
			return scene_root.get_node_or_null(relative)

	if path.begins_with("/"):
		path = path.substr(1)

	return scene_root.get_node_or_null(path)


func _find_recursive(node: Node, scene_root: Node, name_pattern: String, type_filter: String, results: Array) -> void:
	var name_matches := name_pattern.is_empty() or node.name.matchn(name_pattern)
	var type_matches := type_filter.is_empty() or node.is_class(type_filter)

	if name_matches and type_matches:
		var path := "/root/" + scene_root.name
		var relative := scene_root.get_path_to(node)
		if relative != NodePath("."):
			path += "/" + str(relative)
		results.append({"path": path, "type": node.get_class()})

	for child in node.get_children():
		_find_recursive(child, scene_root, name_pattern, type_filter, results)


func _handle_get_performance_metrics() -> void:
	var metrics := {
		"fps": Performance.get_monitor(Performance.TIME_FPS),
		"frame_time_ms": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		"physics_time_ms": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		"navigation_time_ms": Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS) * 1000.0,
		"render_objects": int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)),
		"render_draw_calls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		"render_primitives": int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)),
		"render_video_mem": int(Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED)),
		"render_texture_mem": int(Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED)),
		"render_buffer_mem": int(Performance.get_monitor(Performance.RENDER_BUFFER_MEM_USED)),
		"physics_2d_active_objects": int(Performance.get_monitor(Performance.PHYSICS_2D_ACTIVE_OBJECTS)),
		"physics_2d_collision_pairs": int(Performance.get_monitor(Performance.PHYSICS_2D_COLLISION_PAIRS)),
		"physics_2d_island_count": int(Performance.get_monitor(Performance.PHYSICS_2D_ISLAND_COUNT)),
		"physics_3d_active_objects": int(Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)),
		"physics_3d_collision_pairs": int(Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS)),
		"physics_3d_island_count": int(Performance.get_monitor(Performance.PHYSICS_3D_ISLAND_COUNT)),
		"audio_output_latency": Performance.get_monitor(Performance.AUDIO_OUTPUT_LATENCY),
		"object_count": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"object_resource_count": int(Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT)),
		"object_node_count": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"object_orphan_node_count": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),
		"memory_static": int(Performance.get_monitor(Performance.MEMORY_STATIC)),
		"memory_static_max": int(Performance.get_monitor(Performance.MEMORY_STATIC_MAX)),
		"memory_msg_buffer_max": int(Performance.get_monitor(Performance.MEMORY_MESSAGE_BUFFER_MAX)),
		"navigation_active_maps": int(Performance.get_monitor(Performance.NAVIGATION_ACTIVE_MAPS)),
		"navigation_region_count": int(Performance.get_monitor(Performance.NAVIGATION_REGION_COUNT)),
		"navigation_agent_count": int(Performance.get_monitor(Performance.NAVIGATION_AGENT_COUNT)),
		"navigation_link_count": int(Performance.get_monitor(Performance.NAVIGATION_LINK_COUNT)),
		"navigation_polygon_count": int(Performance.get_monitor(Performance.NAVIGATION_POLYGON_COUNT)),
		"navigation_edge_count": int(Performance.get_monitor(Performance.NAVIGATION_EDGE_COUNT)),
		"navigation_edge_merge_count": int(Performance.get_monitor(Performance.NAVIGATION_EDGE_MERGE_COUNT)),
		"navigation_edge_connection_count": int(Performance.get_monitor(Performance.NAVIGATION_EDGE_CONNECTION_COUNT)),
		"navigation_edge_free_count": int(Performance.get_monitor(Performance.NAVIGATION_EDGE_FREE_COUNT)),
		"navigation_obstacle_count": int(Performance.get_monitor(Performance.NAVIGATION_OBSTACLE_COUNT)),
		"pipeline_compilations_canvas": int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_CANVAS)),
		"pipeline_compilations_mesh": int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_MESH)),
		"pipeline_compilations_surface": int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SURFACE)),
		"pipeline_compilations_draw": int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_DRAW)),
		"pipeline_compilations_specialization": int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SPECIALIZATION)),
	}

	var rid := get_viewport().get_viewport_rid()
	metrics["viewport_render_cpu_ms"] = RenderingServer.viewport_get_measured_render_time_cpu(rid) + RenderingServer.viewport_get_measured_render_time_gpu(rid)
	metrics["viewport_render_gpu_ms"] = RenderingServer.viewport_get_measured_render_time_gpu(rid)

	EngineDebugger.send_message("godot_mcp:performance_metrics_result", [metrics])


func _handle_get_profiler_data() -> void:
	var data := _profiler.get_buffer_data() if _profiler else {}
	EngineDebugger.send_message("godot_mcp:game_response", ["get_profiler_data", data])


func _handle_get_active_processes() -> void:
	var tree := get_tree()
	var scene_root := tree.current_scene if tree else null
	if not scene_root:
		EngineDebugger.send_message("godot_mcp:game_response", ["get_active_processes", {"processes": []}])
		return

	var script_map: Dictionary = {}
	_collect_processes(scene_root, scene_root, script_map)

	var processes: Array = []
	for script_path in script_map:
		processes.append(script_map[script_path])

	processes.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.instance_count > b.instance_count
	)

	EngineDebugger.send_message("godot_mcp:game_response", ["get_active_processes", {"processes": processes}])


func _collect_processes(node: Node, scene_root: Node, script_map: Dictionary) -> void:
	var is_proc := node.is_processing()
	var is_phys := node.is_physics_processing()

	if is_proc or is_phys:
		var script_path := ""
		var script := node.get_script()
		if script and script is Script:
			script_path = script.resource_path
		if script_path.is_empty():
			script_path = node.get_class()

		if not script_map.has(script_path):
			script_map[script_path] = {
				"script_path": script_path,
				"has_process": false,
				"has_physics_process": false,
				"instance_count": 0,
				"example_paths": [],
			}

		var entry: Dictionary = script_map[script_path]
		if is_proc:
			entry.has_process = true
		if is_phys:
			entry.has_physics_process = true
		entry.instance_count += 1
		if entry.example_paths.size() < 3:
			var path := "/root/" + scene_root.name
			var relative := scene_root.get_path_to(node)
			if relative != NodePath("."):
				path += "/" + str(relative)
			entry.example_paths.append(path)

	for child in node.get_children():
		_collect_processes(child, scene_root, script_map)


func _handle_get_signal_connections(data: Array) -> void:
	var node_path: String = data[0] if data.size() > 0 else ""

	var tree := get_tree()
	var scene_root := tree.current_scene if tree else null
	if not scene_root:
		EngineDebugger.send_message("godot_mcp:game_response", ["get_signal_connections", {"connections": []}])
		return

	var search_root: Node = scene_root
	if not node_path.is_empty():
		search_root = _get_node_from_path(node_path, scene_root)
		if not search_root:
			EngineDebugger.send_message("godot_mcp:game_response", ["get_signal_connections", {"connections": [], "error": "Node not found: " + node_path}])
			return

	var connections: Array = []
	_collect_signal_connections(search_root, scene_root, connections, 0)

	EngineDebugger.send_message("godot_mcp:game_response", ["get_signal_connections", {"connections": connections}])


const MAX_SIGNAL_CONNECTIONS := 200
const MAX_SIGNAL_DEPTH := 20


func _collect_signal_connections(node: Node, scene_root: Node, connections: Array, depth: int) -> void:
	if connections.size() >= MAX_SIGNAL_CONNECTIONS or depth > MAX_SIGNAL_DEPTH:
		return

	var source_path := _node_path_string(node, scene_root)

	for sig_info in node.get_signal_list():
		var sig_name: String = sig_info.name
		for conn in node.get_signal_connection_list(sig_name):
			if connections.size() >= MAX_SIGNAL_CONNECTIONS:
				return
			var target: Object = conn.callable.get_object()
			var target_path := ""
			if target is Node:
				target_path = _node_path_string(target as Node, scene_root)
			else:
				target_path = str(target)
			connections.append({
				"source_path": source_path,
				"signal_name": sig_name,
				"target_path": target_path,
				"method_name": conn.callable.get_method(),
			})

	for child in node.get_children():
		if connections.size() >= MAX_SIGNAL_CONNECTIONS:
			return
		_collect_signal_connections(child, scene_root, connections, depth + 1)


func _node_path_string(node: Node, scene_root: Node) -> String:
	var path := "/root/" + scene_root.name
	var relative := scene_root.get_path_to(node)
	if relative != NodePath("."):
		path += "/" + str(relative)
	return path


func _handle_get_runtime_state(data: Array) -> void:
	var params: Dictionary = data[0] if data.size() > 0 and data[0] is Dictionary else {}

	var tree := get_tree()
	var scene_root := tree.current_scene if tree else null
	if not scene_root:
		EngineDebugger.send_message("godot_mcp:game_response", ["get_runtime_state", {
			"scene": "",
			"selection": "fallback",
			"entity_count": 0,
			"entities": [],
			"hint": "No scene is currently running.",
		}])
		return

	var select_mode: String = params.get("select", "auto")
	var group_name: String = params.get("group", "mcp_watch")
	var name_filter: String = params.get("name", "")
	var type_filter: String = params.get("type", "")
	var max_nodes: int = params.get("max_nodes", 40)
	var include_fields: Array = params.get("include", [])
	max_nodes = clampi(max_nodes, 1, 200)

	# Resolve a 2D camera for the optional camera entity. On-screen checks no
	# longer use this — they resolve the camera per-node from the node's own
	# viewport (see Onscreen.compute), which is what makes SubViewport cameras
	# work correctly.
	var camera_2d: Camera2D = _find_camera_2d()

	# Determine which selection tier to use
	var actual_selection: String = select_mode
	if select_mode == "auto":
		if _has_group_members(scene_root, group_name):
			actual_selection = "group"
		elif _has_mcp_state_nodes(scene_root):
			actual_selection = "method"
		else:
			actual_selection = "fallback"

	# Collect entities (skipped entirely when select="none" — explicit paths only)
	var entities: Array = []
	if actual_selection != "none":
		_collect_runtime_state(scene_root, scene_root, actual_selection, group_name,
			name_filter, type_filter, include_fields,
			max_nodes, entities)

	# Explicit paths: include nodes the scene walk cannot reach (e.g. autoload
	# singletons under /root). For each, return _mcp_state() if present, else a
	# snapshot of the node's script variables (scalars/arrays, capped). Deduped
	# against tier-selected entities and each other by absolute path.
	var explicit_paths: Array = params.get("paths", [])
	var unresolved_paths: Array = []
	if not explicit_paths.is_empty():
		var seen_paths := {}
		for e in entities:
			seen_paths[str(e.get("path", ""))] = true
		for p in explicit_paths:
			var pstr: String = str(p)
			var n := _resolve_node_abs(pstr)
			if n == null:
				unresolved_paths.append(pstr)
				continue
			var abs_path := str(n.get_path())
			if seen_paths.has(abs_path):
				continue
			seen_paths[abs_path] = true
			var ent := _extract_node_state(n, scene_root, include_fields, true)
			ent["path"] = abs_path
			entities.append(ent)

	# Extract camera entity separately if present
	var camera_entity = null
	if camera_2d:
		camera_entity = {
			"type": "Camera2D",
			"pos": {"x": snapped(camera_2d.global_position.x, 0.01), "y": snapped(camera_2d.global_position.y, 0.01)},
			"zoom": {"x": snapped(camera_2d.zoom.x, 0.01), "y": snapped(camera_2d.zoom.y, 0.01)},
			"camera": true,
		}

	var autoloads := _list_autoload_paths(scene_root)

	var hint := ""
	if actual_selection == "fallback":
		hint = ("No nodes found in group '%s' and no _mcp_state() methods detected. " +
			"For richer data: add key nodes to the '%s' group, then implement " +
			"`func _mcp_state() -> Dictionary` on them. " +
			"In _mcp_state(), include both live runtime values (position, health, score) " +
			"AND static definition context (puzzle clues, level config, item data) — " +
			"an agent needs both to understand and verify game state.") % [group_name, group_name]
		if not autoloads.is_empty():
			hint += (" Global game state often lives in autoload singletons (see " +
				"available_autoloads), which this scene walk does not reach — read them " +
				"with select=\"none\" and paths: [...]; each returns _mcp_state() if " +
				"present, else a snapshot of its script variables.")

	var result: Dictionary = {
		"scene": scene_root.scene_file_path,
		"selection": actual_selection,
		"entity_count": entities.size(),
		"entities": entities,
	}
	if not autoloads.is_empty():
		result["available_autoloads"] = autoloads
	if camera_entity:
		result["camera"] = camera_entity
	if not hint.is_empty():
		result["hint"] = hint
	if not unresolved_paths.is_empty():
		result["unresolved_paths"] = unresolved_paths

	EngineDebugger.send_message("godot_mcp:game_response", ["get_runtime_state", result])


func _has_group_members(scene_root: Node, group_name: String) -> bool:
	var tree := get_tree()
	if tree == null:
		return false
	return tree.get_nodes_in_group(group_name).size() > 0


func _has_mcp_state_nodes(node: Node) -> bool:
	if node.has_method("_mcp_state"):
		return true
	for child in node.get_children():
		if _has_mcp_state_nodes(child):
			return true
	return false


func _collect_runtime_state(node: Node, scene_root: Node, selection: String, group_name: String,
		name_filter: String, type_filter: String, include_fields: Array,
		max_nodes: int, results: Array) -> void:
	if results.size() >= max_nodes:
		return

	var include_node := false
	match selection:
		"group":
			include_node = node.is_in_group(group_name)
		"method":
			include_node = node.has_method("_mcp_state")
		"fallback":
			include_node = (node is CanvasItem and (node as CanvasItem).is_visible_in_tree())

	if include_node:
		if not name_filter.is_empty() and not node.name.matchn(name_filter):
			include_node = false
		if not type_filter.is_empty() and not node.is_class(type_filter):
			include_node = false

	if include_node:
		var entity := _extract_node_state(node, scene_root, include_fields)
		if entity != null:
			results.append(entity)

	for child in node.get_children():
		if results.size() >= max_nodes:
			return
		_collect_runtime_state(child, scene_root, selection, group_name,
			name_filter, type_filter, include_fields,
			max_nodes, results)


# _mcp_state() contract: return a Dictionary with two categories —
#   (1) live runtime values that change during play (cursor pos, health, score, fill counts)
#   (2) static definition context needed to interpret them (puzzle clues, level layout, config)
# An agent can observe (1) without (2) but cannot verify correctness without both.
# Optionally include layout geometry (bounds, sizes) to enable programmatic layout checks.
# Error handling: _mcp_state() runtime errors are non-fatal in GDScript (Godot prints them
# and the call returns null); the `is Dictionary` check below handles that silently.
func _extract_node_state(node: Node, scene_root: Node, include_fields: Array,
		allow_var_snapshot: bool = false) -> Dictionary:
	var want := include_fields.is_empty()
	var want_transform := want or include_fields.has("transform")
	var want_velocity := want or include_fields.has("velocity")
	var want_anim := want or include_fields.has("anim")
	var want_groups := want or include_fields.has("groups")
	var want_onscreen := want or include_fields.has("onscreen")
	var want_state := want or include_fields.has("state")

	var entity: Dictionary = {
		"path": _node_path_string(node, scene_root),
		"type": node.get_class(),
	}

	if want_groups:
		var groups := node.get_groups().filter(func(g): return not g.begins_with("_"))
		if not groups.is_empty():
			entity["groups"] = groups

	if want_transform and node is Node2D:
		var n2d := node as Node2D
		entity["pos"] = {"x": snapped(n2d.global_position.x, 0.01), "y": snapped(n2d.global_position.y, 0.01)}
		entity["rot"] = snapped(rad_to_deg(n2d.global_rotation), 0.01)
		if n2d.scale != Vector2.ONE:
			entity["scale"] = {"x": snapped(n2d.scale.x, 0.01), "y": snapped(n2d.scale.y, 0.01)}

	if want_transform and node is Node3D:
		var n3d := node as Node3D
		entity["pos"] = {
			"x": snapped(n3d.global_position.x, 0.01),
			"y": snapped(n3d.global_position.y, 0.01),
			"z": snapped(n3d.global_position.z, 0.01),
		}
		entity["rot"] = {
			"x": snapped(rad_to_deg(n3d.global_rotation.x), 0.01),
			"y": snapped(rad_to_deg(n3d.global_rotation.y), 0.01),
			"z": snapped(rad_to_deg(n3d.global_rotation.z), 0.01),
		}

	if want_velocity:
		if node is CharacterBody2D:
			var v := (node as CharacterBody2D).velocity
			entity["vel"] = {"x": snapped(v.x, 0.01), "y": snapped(v.y, 0.01)}
		elif node is RigidBody2D:
			var v := (node as RigidBody2D).linear_velocity
			entity["vel"] = {"x": snapped(v.x, 0.01), "y": snapped(v.y, 0.01)}
			entity["angvel"] = snapped((node as RigidBody2D).angular_velocity, 0.01)
		elif node is CharacterBody3D:
			var v := (node as CharacterBody3D).velocity
			entity["vel"] = {"x": snapped(v.x, 0.01), "y": snapped(v.y, 0.01), "z": snapped(v.z, 0.01)}
		elif node is RigidBody3D:
			var v := (node as RigidBody3D).linear_velocity
			entity["vel"] = {"x": snapped(v.x, 0.01), "y": snapped(v.y, 0.01), "z": snapped(v.z, 0.01)}
			var av := (node as RigidBody3D).angular_velocity
			entity["angvel"] = {"x": snapped(av.x, 0.01), "y": snapped(av.y, 0.01), "z": snapped(av.z, 0.01)}

	if want_anim:
		if node is AnimationPlayer:
			var ap := node as AnimationPlayer
			entity["anim"] = ap.current_animation
			entity["anim_pos"] = snapped(ap.current_animation_position, 0.01)
			entity["playing"] = ap.is_playing()
		elif node is AnimatedSprite2D:
			var asp := node as AnimatedSprite2D
			entity["anim"] = asp.animation
			entity["anim_frame"] = asp.frame

	if want_onscreen:
		# Resolve the camera from the node's own viewport (handles SubViewport
		# cameras) and use the correct geometry per dimension — 3D frustum, 2D
		# visible world rect. Returns null when undeterminable; omit the field.
		var onscreen = Onscreen.compute(node)
		if onscreen != null:
			entity["onscreen"] = onscreen

	if want_state:
		if node.has_method("_mcp_state"):
			var raw_state = node._mcp_state()
			if raw_state is Dictionary:
				var serialized := _serialize_mcp_state(raw_state)
				if not serialized.is_empty():
					entity["state"] = serialized
		elif allow_var_snapshot:
			var snap := _snapshot_script_vars(node)
			if not snap.is_empty():
				entity["state"] = snap

	return entity


const _MCP_STATE_MAX_BYTES := 1024


func _serialize_mcp_state(state: Dictionary) -> Dictionary:
	var result: Dictionary = {}
	for key in state:
		var val = state[key]
		var serializable = null
		match typeof(val):
			TYPE_BOOL, TYPE_STRING:
				serializable = val
			TYPE_INT:
				serializable = int(val)
			TYPE_FLOAT:
				serializable = snapped(float(val), 0.01)
			TYPE_ARRAY:
				serializable = val
			TYPE_DICTIONARY:
				serializable = val
			# skip non-serializable types (Objects, NodePaths, RIDs, etc.)
		if serializable == null:
			continue
		result[str(key)] = serializable
		if JSON.stringify(result).length() > _MCP_STATE_MAX_BYTES:
			result.erase(str(key))
			result["_truncated"] = true
			break
	return result


# Snapshot a node's own script variables (PROPERTY_USAGE_SCRIPT_VARIABLE) as
# JSON-able scalars/arrays. Used for explicitly-requested nodes (e.g. autoload
# singletons) that do not implement _mcp_state(). Private vars (leading "_") are
# skipped; dictionaries/objects/non-serializable values are dropped; total size
# is capped like _serialize_mcp_state.
func _snapshot_script_vars(node: Node) -> Dictionary:
	var result: Dictionary = {}
	for prop in node.get_property_list():
		if not (int(prop.get("usage", 0)) & PROPERTY_USAGE_SCRIPT_VARIABLE):
			continue
		var key: String = str(prop.get("name", ""))
		if key.is_empty() or key.begins_with("_"):
			continue
		var serializable = _to_serializable_scalar(node.get(key))
		if serializable == null:
			continue
		result[key] = serializable
		if JSON.stringify(result).length() > _MCP_STATE_MAX_BYTES:
			result.erase(key)
			result["_truncated"] = true
			break
	return result


# Convert a value to a JSON-able scalar (or array of scalars). Returns null to
# signal "skip" — dictionaries, objects, vectors, and arrays containing any of
# those are intentionally dropped to keep the snapshot small and safe.
func _to_serializable_scalar(val) -> Variant:
	match typeof(val):
		TYPE_BOOL, TYPE_STRING:
			return val
		TYPE_STRING_NAME:
			return str(val)
		TYPE_INT:
			return int(val)
		TYPE_FLOAT:
			return snapped(float(val), 0.01)
		TYPE_ARRAY:
			var arr: Array = []
			for e in val:
				var s = _to_serializable_scalar(e)
				if s == null:
					return null
				arr.append(s)
			return arr
	return null


# Resolve an absolute ("/root/Name/...") or scene-relative node path. Unlike the
# digest tree walk (rooted at current_scene), this reaches autoload singletons
# and anything else under the SceneTree root.
func _resolve_node_abs(path: String) -> Node:
	var tree := get_tree()
	if tree == null:
		return null
	var root := tree.root
	if root == null:
		return null
	if path == "/root" or path == "/root/":
		return root
	if path.begins_with("/root/"):
		return root.get_node_or_null(path.substr(6))
	if path.begins_with("/"):
		return root.get_node_or_null(path.substr(1))
	var scene_root := tree.current_scene
	return scene_root.get_node_or_null(path) if scene_root else null


# List autoload singleton paths (direct children of /root, excluding the current
# scene and this bridge node). Used to guide callers to global state the scene
# walk cannot reach.
func _list_autoload_paths(scene_root: Node) -> Array:
	var out: Array = []
	var tree := get_tree()
	if tree == null or tree.root == null:
		return out
	for child in tree.root.get_children():
		if child == scene_root or child == self:
			continue
		out.append("/root/" + str(child.name))
	return out


func _find_camera_2d() -> Camera2D:
	var viewport := get_viewport()
	if viewport == null:
		return null
	return viewport.get_camera_2d()


func _handle_watch_start(data: Array) -> void:
	if _sampler == null:
		EngineDebugger.send_message("godot_mcp:game_response", ["watch_start", {"started": false, "error": "Sampler not initialized"}])
		return
	var specs: Array = data[0] if data.size() > 0 else []
	var hz: int = data[1] if data.size() > 1 else 20
	var duration_ms: int = data[2] if data.size() > 2 else 1000
	var start_result := _sampler.start(specs, hz, duration_ms)
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_start", {
		"started": true,
		"resolved_fields": start_result.get("resolved_fields", 0),
	}])


func _handle_watch_collect() -> void:
	if _sampler == null:
		EngineDebugger.send_message("godot_mcp:game_response", ["watch_collect", {"window_ms": 0, "sample_count": 0, "fields": {}}])
		return
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_collect", _sampler.collect()])


func _handle_watch_stop() -> void:
	if _sampler == null:
		EngineDebugger.send_message("godot_mcp:game_response", ["watch_stop", {"window_ms": 0, "sample_count": 0, "fields": {}}])
		return
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_stop", _sampler.stop()])


class _MCPGameLogger extends Logger:
	var _output: PackedStringArray = []
	var _max_lines := 1000
	var _mutex := Mutex.new()

	func _log_message(message: String, error: bool) -> void:
		_mutex.lock()
		var prefix := "[ERROR] " if error else ""
		_output.append(prefix + message)
		if _output.size() > _max_lines:
			_output.remove_at(0)
		_mutex.unlock()

	func _log_error(function: String, file: String, line: int, code: String,
					rationale: String, editor_notify: bool, error_type: int,
					script_backtraces: Array[ScriptBacktrace]) -> void:
		_mutex.lock()
		var msg := "[%s:%d] %s: %s" % [file.get_file(), line, code, rationale]
		_output.append("[ERROR] " + msg)
		if _output.size() > _max_lines:
			_output.remove_at(0)
		_mutex.unlock()

	func get_output() -> PackedStringArray:
		return _output

	func clear() -> void:
		_mutex.lock()
		_output.clear()
		_mutex.unlock()


func _handle_get_input_map() -> void:
	var actions: Array = []
	for action_name in InputMap.get_actions():
		if action_name.begins_with("ui_"):
			continue
		var events := InputMap.action_get_events(action_name)
		var event_strings: Array = []
		for event in events:
			event_strings.append(_event_to_string(event))
		actions.append({
			"name": action_name,
			"events": event_strings,
		})
	EngineDebugger.send_message("godot_mcp:input_map_result", [actions, ""])


func _event_to_string(event: InputEvent) -> String:
	if event is InputEventKey:
		var key_event := event as InputEventKey
		var key_name := OS.get_keycode_string(key_event.keycode)
		if key_event.ctrl_pressed:
			key_name = "Ctrl+" + key_name
		if key_event.alt_pressed:
			key_name = "Alt+" + key_name
		if key_event.shift_pressed:
			key_name = "Shift+" + key_name
		return key_name
	elif event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		match mouse_event.button_index:
			MOUSE_BUTTON_LEFT:
				return "Mouse Left"
			MOUSE_BUTTON_RIGHT:
				return "Mouse Right"
			MOUSE_BUTTON_MIDDLE:
				return "Mouse Middle"
			_:
				return "Mouse Button %d" % mouse_event.button_index
	elif event is InputEventJoypadButton:
		var joy_event := event as InputEventJoypadButton
		return "Joypad Button %d" % joy_event.button_index
	elif event is InputEventJoypadMotion:
		var joy_motion := event as InputEventJoypadMotion
		return "Joypad Axis %d" % joy_motion.axis
	return event.as_text()


func _handle_execute_input_sequence(data: Array) -> void:
	var inputs: Array = data[0] if data.size() > 0 else []
	var report: Array = data[1] if data.size() > 1 and data[1] is Array else []
	var screenshot_offsets: Array = data[2] if data.size() > 2 and data[2] is Array else []
	var cap_max_width: int = int(data[3]) if data.size() > 3 else 640

	if inputs.is_empty():
		EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
			"error": "No inputs provided",
		}])
		return

	# Normalize the optional frame-capture schedule (#239): clamp each offset,
	# cap the count, and sort so _sequence_process can pop them in order.
	var capture_offsets: Array = []
	for o in screenshot_offsets:
		if capture_offsets.size() >= SEQUENCE_MAX_CAPTURES:
			break
		capture_offsets.append(clampi(int(o), 0, SEQUENCE_MAX_CAPTURE_OFFSET_MS))
	capture_offsets.sort()

	# Compile the optional effect probe up front, before touching any input state,
	# so a bad expression rejects the call cleanly (same contract as step_until's
	# report). Reuses the predicate context: autoloads by name, plus `tree`/`root`.
	var report_compiled: Array = []
	var report_inputs: Array = []
	if not report.is_empty():
		var ctx := _build_predicate_context()
		var rr := _compile_report(report, ctx["names"], ctx["inputs"])
		if rr.has("error"):
			EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
				"error": rr["error"],
			}])
			return
		report_compiled = rr["report"]
		report_inputs = ctx["inputs"]

	# Release anything still held from a prior, interrupted sequence BEFORE
	# clearing the queue — otherwise that sequence's unfired releases are dropped
	# and its actions stay latched (stuck-held bug).
	_release_held_actions()
	_sequence_events.clear()
	_actions_completed = 0
	_actions_total = inputs.size()
	_sequence_gameplay_ms = 0.0
	_sequence_draining = false
	_sequence_settle_remaining = 0
	# Clear probe and capture state up front so an early return below (unknown
	# action) cannot leave a stale report or capture schedule to be acted on
	# against an interrupted window. Both are re-armed once the timeline validates.
	_sequence_report = []
	_sequence_report_inputs = []
	_sequence_report_before = {}
	_sequence_capture_offsets = []
	_sequence_captures_pending = 0
	_sequence_capture_max_width = cap_max_width

	for input in inputs:
		var action_name: String = input.get("action_name", "")
		var start_ms: int = int(input.get("start_ms", 0))
		var duration_ms: int = int(input.get("duration_ms", 0))

		if action_name.is_empty():
			continue

		if not InputMap.has_action(action_name):
			EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
				"error": "Unknown action: %s" % action_name,
			}])
			return

		_sequence_events.append({
			"time": start_ms,
			"action": action_name,
			"is_press": true,
		})
		_sequence_events.append({
			"time": start_ms + duration_ms,
			"action": action_name,
			"is_press": false,
		})

	_sequence_events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.time < b.time
	)

	# Baseline the effect probe at the last possible moment before any input fires.
	_sequence_report = report_compiled
	_sequence_report_inputs = report_inputs
	_sequence_report_before = _evaluate_report(report_compiled, report_inputs) if not report_compiled.is_empty() else {}

	# Arm the capture schedule (validated and sorted above).
	_sequence_capture_offsets = capture_offsets

	_sequence_start_time = Time.get_ticks_msec()
	_sequence_running = true
	_update_processing()


func _handle_type_text(data: Array) -> void:
	var text: String = data[0] if data.size() > 0 else ""
	var delay_ms: int = int(data[1]) if data.size() > 1 else 50
	var submit: bool = data[2] if data.size() > 2 else false

	if text.is_empty():
		EngineDebugger.send_message("godot_mcp:type_text_result", [{
			"error": "No text provided",
		}])
		return

	_type_text_async(text, delay_ms, submit)


func _type_text_async(text: String, delay_ms: int, submit: bool) -> void:
	for i in text.length():
		var char_code := text.unicode_at(i)

		var press := InputEventKey.new()
		press.keycode = char_code
		press.unicode = char_code
		press.pressed = true
		Input.parse_input_event(press)

		var release := InputEventKey.new()
		release.keycode = char_code
		release.unicode = char_code
		release.pressed = false
		Input.parse_input_event(release)

		if delay_ms > 0 and i < text.length() - 1:
			await get_tree().create_timer(delay_ms / 1000.0).timeout

	if submit:
		if delay_ms > 0:
			await get_tree().create_timer(delay_ms / 1000.0).timeout

		var enter_press := InputEventKey.new()
		enter_press.keycode = KEY_ENTER
		enter_press.physical_keycode = KEY_ENTER
		enter_press.pressed = true
		Input.parse_input_event(enter_press)

		var enter_release := InputEventKey.new()
		enter_release.keycode = KEY_ENTER
		enter_release.physical_keycode = KEY_ENTER
		enter_release.pressed = false
		Input.parse_input_event(enter_release)

	EngineDebugger.send_message("godot_mcp:type_text_result", [{
		"completed": true,
		"chars_typed": text.length(),
		"submitted": submit,
	}])


# ---------------------------------------------------------------------------
# Game-time control (freeze / step / thaw / status)
#
# Real-time games race ahead of high-latency agents: 10-40s of consequences
# land between every observation and the action it informs. These primitives
# make game time answer to the agent's clock instead: freeze the tree, think
# arbitrarily long (all observation tools work while frozen — rendering
# continues during pause), then step forward a bounded slice of game time
# with inputs riding inside the window.
#
# tree.paused is a single bit that two parties now write: the game's own
# pause menu and this freeze. The bridge layers them — effective state is
# (game_paused OR frozen) — by observing and re-asserting: it cannot
# intercept writes, but it processes every frame (PROCESS_MODE_ALWAYS, and
# as an autoload it runs BEFORE the scene), so a game-code flip is caught on
# the next frame, recorded as the game layer's new intent, and overridden
# while frozen. step/thaw restore the game's wish, not whatever we found.
#
# What freeze means: exactly what runs during the game's own pause menu runs
# during freeze (WHEN_PAUSED/ALWAYS nodes, process_always timers). A game
# with a correct pause menu has already partitioned pause-immune from
# pausable code; freeze rides that contract. Games that "pause" by writing
# Engine.time_scale = 0 instead are frozen solid too, but their pause is
# invisible to the layer model (it looks like gameplay state, not pause
# state) — documented limitation.
# ---------------------------------------------------------------------------

const LAUNCH_FROZEN_ENV := "GODOT_MCP_LAUNCH_FROZEN"
# Timeout cascade (#276): the server derives the whole stagger from the call's
# in-game budget and pushes wall_budget_ms down here. The bridge returns by that
# wall budget, the editor relay waits a margin longer, the server socket a
# margin longer still — each answers before the one above gives up.
#   STEP_MAX_MS         non-binding sanity backstop (the server already clamps the request)
#   STEP_DEFAULT_MS     budget used when a call omits max_ms (older server that sends no default)
#   STEP_WALL_BUDGET_MS wall-budget fallback when the server pushes no wall_budget_ms
const STEP_MAX_MS := 300000
const STEP_DEFAULT_MS := 20000
const STEP_MAX_FRAMES := 1200
const STEP_WALL_BUDGET_MS := 25000
const STEP_MAX_TRANSITIONS := 50
const FREEZE_CONTESTED_THRESHOLD := 10

var _frozen := false
var _game_paused := false  # the game layer's own pause intent, inferred by observation
var _launched_frozen := false
var _freeze_started_ticks := 0
var _freeze_transition_count := 0

var _step_active := false
var _step_finish_pending := false
var _step_needs_settle := false
var _step_wall_exceeded := false
var _step_target_ms := 0.0
var _step_target_frames := 0
var _step_elapsed_ms := 0.0  # accumulated scaled delta = game time (wall-of-step, includes game-paused stretches)
var _step_gameplay_ms := 0.0  # the unpaused portion: what gameplay actually experienced
var _step_frames := 0
var _step_physics_ticks := 0
var _step_wall_start := 0
var _step_wall_budget_ms := STEP_WALL_BUDGET_MS  # set per-call from the server-pushed wall_budget_ms (#276)
var _step_events: Array = []  # in-step input timeline, scheduled on the game-time clock
var _step_events_fired := 0
var _step_transitions: Array = []
var _step_last_tree_paused := false

# step_until adds a predicate evaluated each frame. _step_predicate is null for a
# fixed-budget step, set for step_until; _step_response_type routes _finish_step's
# reply to the matching command (the relay correlates by message type). _step_report
# is the optional readings the agent wants back at stop time (in one round-trip,
# instead of a separate observation call) — each is [{src: String, expr: Expression}].
var _step_predicate: Expression = null
var _step_predicate_inputs: Array = []
var _step_predicate_met := false
var _step_predicate_error := ""
var _step_report: Array = []
var _step_response_type := "game_time_step"


func _send_game_time_response(msg_type: String, result: Dictionary) -> void:
	EngineDebugger.send_message("godot_mcp:game_response", [msg_type, result])


func _engage_freeze() -> void:
	if _frozen:
		return
	var tree := get_tree()
	_game_paused = tree.paused
	_frozen = true
	_freeze_started_ticks = Time.get_ticks_msec()
	_freeze_transition_count = 0
	tree.paused = true
	_update_processing()


# Per-frame monitor: dispatches to the step runner during a window, otherwise
# holds the freeze against game-code writes.
func _game_time_process(delta: float) -> void:
	if _step_active:
		_step_process(delta)
		return
	if not _frozen:
		return
	var tree := get_tree()
	if not tree.paused:
		# Game code unpaused under the freeze (a WHEN_PAUSED resume button, an
		# auto-unpausing cutscene). Record the game layer's new intent and
		# re-assert — the freeze answers to the agent; the game's wish is
		# restored on step/thaw. Only unpause flips are observable here: while
		# frozen, tree.paused is already true.
		_game_paused = false
		_freeze_transition_count += 1
		tree.paused = true


func _physics_process(_delta: float) -> void:
	if _step_active and not _step_finish_pending and not get_tree().paused:
		_step_physics_ticks += 1


func _handle_game_time_freeze(_data: Array) -> void:
	if _step_active:
		_send_game_time_response("game_time_freeze", {"error": "Step in progress"})
		return
	var was_frozen := _frozen
	_engage_freeze()
	_send_game_time_response("game_time_freeze", {
		"frozen": true,
		"was_frozen": was_frozen,
		"game_paused": _game_paused,
	})


func _handle_game_time_thaw(_data: Array) -> void:
	if _step_active:
		_send_game_time_response("game_time_thaw", {"error": "Step in progress"})
		return
	var was_frozen := _frozen
	var result: Dictionary = {"frozen": false, "was_frozen": was_frozen}
	if was_frozen:
		# Real wall-clock the freeze was held; game time did not advance while frozen.
		result["frozen_wall_ms"] = Time.get_ticks_msec() - _freeze_started_ticks
		_frozen = false
		get_tree().paused = _game_paused
		_update_processing()
	result["game_paused"] = _game_paused if was_frozen else get_tree().paused
	_send_game_time_response("game_time_thaw", result)


func _handle_game_time_status(_data: Array) -> void:
	var tree := get_tree()
	var tree_paused: bool = tree.paused if tree else false
	var result: Dictionary = {
		"frozen": _frozen,
		"game_paused": _game_paused if _frozen else tree_paused,
		"tree_paused": tree_paused,
		"engine_time_scale": Engine.time_scale,
		"physics_ticks_per_second": Engine.physics_ticks_per_second,
	}
	# `frozen` is the authoritative current state. `launched_frozen` is a historical
	# fact (this run booted frozen via GODOT_MCP_LAUNCH_FROZEN) and stays true after
	# thaw, so it must not be read as the present freeze state.
	if _launched_frozen:
		result["launched_frozen"] = true
	if _frozen:
		# Real wall-clock since freeze engaged, not game time (which is stopped).
		result["frozen_wall_ms"] = Time.get_ticks_msec() - _freeze_started_ticks
		result["freeze_transitions"] = _freeze_transition_count
		if _freeze_transition_count >= FREEZE_CONTESTED_THRESHOLD:
			# Something (an ALWAYS-mode node?) is repeatedly unpausing under
			# the freeze. Each re-assert can leak up to one frame; report the
			# contest rather than pretend the freeze is airtight.
			result["freeze_contested"] = true
	if _step_active:
		result["step_active"] = true
	_send_game_time_response("game_time_status", result)


func _handle_game_time_step(data: Array) -> void:
	var params: Dictionary = data[0] if data.size() > 0 and data[0] is Dictionary else {}
	if _step_active:
		_send_game_time_response("game_time_step", {"error": "Step already in progress"})
		return

	var duration_ms: int = int(params.get("duration_ms", 0))
	var frames: int = int(params.get("frames", 0))
	if duration_ms <= 0 and frames <= 0:
		_send_game_time_response("game_time_step", {"error": "step requires duration_ms or frames"})
		return
	duration_ms = mini(duration_ms, STEP_MAX_MS)
	frames = mini(frames, STEP_MAX_FRAMES)

	# Validate and schedule the in-step input timeline (start_ms is game-time
	# from window start). Inputs must ride inside the step: an event injected
	# while frozen lands on a frame gameplay never processes, so its
	# is_action_just_pressed edge would be silently missed.
	var compiled := _compile_step_events(params.get("inputs", []))
	if compiled.has("error"):
		_send_game_time_response("game_time_step", {"error": compiled["error"]})
		return

	# Step from a running game is allowed — it freezes first, so "advance
	# 500ms then wait for me" is a single atomic call.
	_engage_freeze()

	_step_target_ms = float(duration_ms)
	_step_target_frames = frames
	_step_elapsed_ms = 0.0
	_step_gameplay_ms = 0.0
	_step_frames = 0
	_step_physics_ticks = 0
	_step_events = compiled["events"]
	_step_events_fired = 0
	_step_transitions = []
	_step_needs_settle = false
	_step_finish_pending = false
	_step_wall_exceeded = false
	_step_wall_start = Time.get_ticks_msec()
	_step_wall_budget_ms = int(params.get("wall_budget_ms", STEP_WALL_BUDGET_MS))
	_step_predicate = null
	_step_response_type = "game_time_step"
	_step_active = true

	# Open the window: restore the game layer's own pause wish for the
	# duration. If the game's menu is holding it paused, the window still
	# elapses (and reports gameplay_ms ~0) — never deadlock waiting for
	# gameplay time that cannot come.
	var tree := get_tree()
	tree.paused = _game_paused
	_step_last_tree_paused = tree.paused
	set_physics_process(true)
	_update_processing()


func _compile_step_events(inputs: Array) -> Dictionary:
	# Builds the press/release timeline shared by step and step_until. start_ms
	# is game time from window start; returns {"error": ...} on an unknown action.
	var events: Array = []
	for input in inputs:
		var action_name: String = input.get("action_name", "")
		if action_name.is_empty():
			continue
		if not InputMap.has_action(action_name):
			return {"error": "Unknown action: %s" % action_name}
		var start_ms: int = int(input.get("start_ms", 0))
		var dur: int = int(input.get("duration_ms", 0))
		events.append({"time": start_ms, "action": action_name, "is_press": true})
		events.append({"time": start_ms + dur, "action": action_name, "is_press": false})
	events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.time < b.time
	)
	return {"events": events}


func _build_predicate_context() -> Dictionary:
	# Exposes the running game to a step_until predicate: every autoload by its
	# own name (so `G.wave > 1` just works), plus `tree` (SceneTree) and `root`
	# (root Window) for tree queries like
	# `tree.get_nodes_in_group("enemies").size() >= 1`. Chained calls must run on
	# these input objects, not the Expression base instance, so they are inputs.
	var names: Array = []
	var inputs: Array = []
	var tree := get_tree()
	for prop in ProjectSettings.get_property_list():
		var key: String = prop.get("name", "")
		if not key.begins_with("autoload/"):
			continue
		var autoload_name := key.substr("autoload/".length())
		var node := tree.root.get_node_or_null(NodePath(autoload_name))
		if node == null or node == self:
			continue  # skip the bridge's own autoload and any unresolved entry
		names.append(autoload_name)
		inputs.append(node)
	if not names.has("tree"):
		names.append("tree")
		inputs.append(tree)
	if not names.has("root"):
		names.append("root")
		inputs.append(tree.root)
	return {"names": PackedStringArray(names), "inputs": inputs}


func _sanitize_value(v: Variant) -> Variant:
	# Report values ride back over the debugger channel. Pass primitives through;
	# never try to serialize Objects/containers — a short string stand-in is
	# enough for the agent to see what an expression evaluated to.
	match typeof(v):
		TYPE_NIL, TYPE_BOOL, TYPE_INT, TYPE_FLOAT, TYPE_STRING, TYPE_STRING_NAME:
			return v
		_:
			return str(v).substr(0, 200)


func _compile_report(report: Array, names: PackedStringArray, inputs: Array) -> Dictionary:
	# Compile + validate each report expression in the predicate context. Returns
	# {"error": ...} if any fails up front, else {"report": [{src, expr}, ...]}.
	var compiled: Array = []
	for item in report:
		var s := str(item).strip_edges()
		if s.is_empty():
			continue
		var e := Expression.new()
		if e.parse(s, names) != OK:
			return {"error": "report expression parse error (%s): %s" % [s, e.get_error_text()]}
		e.execute(inputs, self)
		if e.has_execute_failed():
			return {"error": "report expression failed to evaluate (%s): %s" % [s, e.get_error_text()]}
		compiled.append({"src": s, "expr": e})
	return {"report": compiled}


func _evaluate_report(report_exprs: Array, inputs: Array) -> Dictionary:
	# Evaluate the compiled report expressions at stop time into {src: value}.
	var out: Dictionary = {}
	for item in report_exprs:
		var e: Expression = item["expr"]
		var v: Variant = e.execute(inputs, self)
		if e.has_execute_failed():
			out[item["src"]] = "<error: %s>" % e.get_error_text()
		else:
			out[item["src"]] = _sanitize_value(v)
	return out


func _handle_game_time_step_until(data: Array) -> void:
	var params: Dictionary = data[0] if data.size() > 0 and data[0] is Dictionary else {}
	if _step_active:
		_send_game_time_response("game_time_step_until", {"error": "Step already in progress"})
		return

	var src: String = str(params.get("until", "")).strip_edges()
	if src.is_empty():
		_send_game_time_response("game_time_step_until", {"error": "step_until requires a non-empty `until` expression"})
		return

	var max_ms: int = int(params.get("max_ms", STEP_DEFAULT_MS))
	if max_ms <= 0:
		max_ms = STEP_DEFAULT_MS
	max_ms = mini(max_ms, STEP_MAX_MS)

	# Compile and validate the predicate against the live tree before committing
	# to a step. Expression.parse() is lenient (a malformed string can parse
	# clean), so a dry-run execute is what actually catches unknown identifiers
	# and bad member access.
	var ctx := _build_predicate_context()
	var ctx_names: PackedStringArray = ctx["names"]
	var ctx_inputs: Array = ctx["inputs"]
	var expr := Expression.new()
	if expr.parse(src, ctx_names) != OK:
		_send_game_time_response("game_time_step_until", {"error": "predicate parse error: %s" % expr.get_error_text()})
		return
	var first_value: Variant = expr.execute(ctx_inputs, self)
	if expr.has_execute_failed():
		_send_game_time_response("game_time_step_until", {"error": "predicate failed to evaluate: %s" % expr.get_error_text()})
		return

	# Optional readings to return at stop time, validated up front in the same context.
	var report_result := _compile_report(params.get("report", []), ctx_names, ctx_inputs)
	if report_result.has("error"):
		_send_game_time_response("game_time_step_until", {"error": report_result["error"]})
		return
	var report_compiled: Array = report_result["report"]

	var compiled := _compile_step_events(params.get("inputs", []))
	if compiled.has("error"):
		_send_game_time_response("game_time_step_until", {"error": compiled["error"]})
		return

	_engage_freeze()

	# Predicate already holds: advance nothing, stay frozen, report it.
	if bool(first_value):
		var sc_result: Dictionary = {
			"completed": true,
			"frozen": true,
			"elapsed_ms": 0,
			"gameplay_ms": 0,
			"frames": 0,
			"physics_ticks": 0,
			"game_paused": _game_paused,
			"predicate_met": true,
		}
		if not report_compiled.is_empty():
			sc_result["report"] = _evaluate_report(report_compiled, ctx_inputs)
		_send_game_time_response("game_time_step_until", sc_result)
		return

	_step_target_ms = float(max_ms)
	_step_target_frames = 0
	_step_elapsed_ms = 0.0
	_step_gameplay_ms = 0.0
	_step_frames = 0
	_step_physics_ticks = 0
	_step_events = compiled["events"]
	_step_events_fired = 0
	_step_transitions = []
	_step_needs_settle = false
	_step_finish_pending = false
	_step_wall_exceeded = false
	_step_wall_start = Time.get_ticks_msec()
	_step_wall_budget_ms = int(params.get("wall_budget_ms", STEP_WALL_BUDGET_MS))
	_step_predicate = expr
	_step_predicate_inputs = ctx_inputs
	_step_predicate_met = false
	_step_predicate_error = ""
	_step_report = report_compiled
	_step_response_type = "game_time_step_until"
	_step_active = true

	var tree := get_tree()
	tree.paused = _game_paused
	_step_last_tree_paused = tree.paused
	set_physics_process(true)
	_update_processing()


func _step_process(delta: float) -> void:
	var tree := get_tree()

	# The bridge processes before the scene, so a frame is counted here BEFORE
	# gameplay runs it. Ending the window therefore always defers one frame:
	# pausing in the same _process call would steal the frame just counted.
	if _step_finish_pending:
		_finish_step()
		return

	# Game-layer pause flips during the window are the game's own doing (a
	# stepped input opened the menu, an auto-pausing cutscene). Track intent
	# and report; never fight it mid-window.
	if tree.paused != _step_last_tree_paused:
		_step_last_tree_paused = tree.paused
		_game_paused = tree.paused
		if _step_transitions.size() < STEP_MAX_TRANSITIONS:
			_step_transitions.append({"at_ms": roundi(_step_elapsed_ms), "paused": tree.paused})

	_step_frames += 1
	_step_elapsed_ms += delta * 1000.0
	if not tree.paused:
		_step_gameplay_ms += delta * 1000.0

	while _step_events.size() > 0 and _step_events[0].time <= _step_elapsed_ms:
		var ev: Dictionary = _step_events.pop_front()
		var input_event := InputEventAction.new()
		input_event.action = ev.action
		input_event.pressed = ev.is_press
		input_event.strength = 1.0 if ev.is_press else 0.0
		Input.parse_input_event(input_event)
		_step_events_fired += 1
		_step_needs_settle = true
		if ev.is_press:
			_held_actions[ev.action] = true
		else:
			_held_actions.erase(ev.action)

	var done := false
	if _step_target_frames > 0:
		done = _step_frames >= _step_target_frames
	else:
		done = _step_elapsed_ms >= _step_target_ms

	# step_until: re-evaluate the predicate each frame against the advancing
	# game. A truthy result stops the window early; a runtime failure (e.g. a
	# watched node was freed mid-window) ends it honestly with the error attached.
	if _step_predicate != null:
		var v: Variant = _step_predicate.execute(_step_predicate_inputs, self)
		if _step_predicate.has_execute_failed():
			_step_predicate_error = _step_predicate.get_error_text()
			done = true
		elif bool(v):
			_step_predicate_met = true
			done = true

	if Time.get_ticks_msec() - _step_wall_start > _step_wall_budget_ms:
		# Slow-mo, Engine.time_scale = 0, or a pause-held window can starve
		# the game-time clock; the wall budget guarantees the call returns
		# (partial, honestly reported) before the editor relay gives up.
		_step_wall_exceeded = true
		done = true

	if done:
		if _step_needs_settle:
			# Injected events flush at the top of the NEXT frame; gameplay
			# needs that frame unpaused or the final just_pressed edge is
			# lost. Run exactly one settle frame, then finish.
			_step_needs_settle = false
		else:
			_step_finish_pending = true


func _finish_step() -> void:
	# Releases are guaranteed cleanup, never queued steps: no holds survive
	# across the freeze boundary (cross-step holds are a deliberate non-goal).
	var forced := _held_actions.size()
	_release_held_actions()
	var dropped := _step_events.size()
	_step_events.clear()

	get_tree().paused = true  # the freeze layer re-engages
	_step_last_tree_paused = true
	_step_active = false
	_step_finish_pending = false
	set_physics_process(false)
	_update_processing()

	var result: Dictionary = {
		"completed": true,
		"frozen": true,
		"elapsed_ms": roundi(_step_elapsed_ms),
		"gameplay_ms": roundi(_step_gameplay_ms),
		"frames": _step_frames,
		"physics_ticks": _step_physics_ticks,
		"game_paused": _game_paused,
	}
	if _step_events_fired > 0:
		result["events_fired"] = _step_events_fired
	if forced > 0:
		result["forced_releases"] = forced
	if dropped > 0:
		result["events_dropped"] = dropped
	if not _step_transitions.is_empty():
		result["pause_transitions"] = _step_transitions
	if _step_wall_exceeded:
		result["wall_budget_exceeded"] = true
	if _step_predicate != null:
		# step_until: predicate_met is the headline. report carries the readings the
		# agent asked for (the "what advanced" hint, so it need not re-observe). A
		# non-met return means the cap or wall budget ran out first.
		result["predicate_met"] = _step_predicate_met
		if not _step_report.is_empty():
			result["report"] = _evaluate_report(_step_report, _step_predicate_inputs)
		if not _step_predicate_error.is_empty():
			result["predicate_error"] = _step_predicate_error

	# Route the reply to the originating command — the relay correlates by type.
	var response_type := _step_response_type
	_step_predicate = null
	_step_predicate_inputs = []
	_step_report = []
	_send_game_time_response(response_type, result)
