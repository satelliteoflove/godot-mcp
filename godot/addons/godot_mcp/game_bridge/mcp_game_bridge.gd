extends Node
class_name MCPGameBridge

const DEFAULT_MAX_WIDTH := 1024
const Onscreen := preload("onscreen.gd")
const MeshValidator := preload("mesh_validator.gd")

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

# On-scene-load mesh-integrity sniff. Corrupt procedural meshes render with no
# error anywhere (inside-out winding, dropped triangles), so the warning must
# come TO the agent: the server appends these one-liners to screenshot results
# — the moment the agent looks at the game is the moment a wrong-looking render
# becomes actionable. Full diagnosis lives in the validate_meshes command.
const SNIFF_DELAY_FRAMES := 30  # let _ready-time procedural level builds finish
const SNIFF_MAX_WARNINGS := 8
var _mesh_warnings: Array[String] = []
var _sniff_scene_id: int = 0
var _sniff_countdown: int = -1


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
	_mesh_sniff_process()


func _mesh_sniff_process() -> void:
	# The autoload ships in exports and _process runs even when _ready bailed
	# out early — without this gate, non-debug runs (including shipped games)
	# would pay full mesh-array copies on every scene load for a result
	# nothing consumes.
	if not EngineDebugger.is_active():
		return
	var tree := get_tree()
	if tree == null or tree.current_scene == null:
		return
	var sid := tree.current_scene.get_instance_id()
	if sid != _sniff_scene_id:
		_sniff_scene_id = sid
		_sniff_countdown = SNIFF_DELAY_FRAMES
	if _sniff_countdown > 0:
		_sniff_countdown -= 1
		if _sniff_countdown == 0:
			_run_mesh_sniff(tree.current_scene)


func _run_mesh_sniff(scene_root: Node) -> void:
	_mesh_warnings.clear()
	var stack: Array[Node] = [scene_root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for child in n.get_children():
			stack.push_back(child)
		for w in MeshValidator.sniff(n):
			_mesh_warnings.append(w)
			if _mesh_warnings.size() >= SNIFF_MAX_WARNINGS:
				return


func _handle_validate_meshes(data: Array) -> void:
	var params: Dictionary = data[0] if data.size() > 0 and data[0] is Dictionary else {}
	var max_findings: int = params.get("max_findings", 25)
	var tree := get_tree()
	var result: Dictionary
	if tree == null or tree.current_scene == null:
		result = {"checked_meshes": 0, "checked_surfaces": 0, "total_findings": 0, "findings": [], "note": "no current scene"}
	else:
		result = MeshValidator.validate(tree.current_scene, max_findings)
	EngineDebugger.send_message("godot_mcp:game_response", ["validate_meshes", result])


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
		_actions_completed += _inject_timeline_event(seq_event)

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
		"input_kinds": _sequence_input_kinds,
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
# Entry counts by kind ({action, joy_button, axis}) for the current sequence /
# step window. Echoed in results: its PRESENCE is the version-skew signal a new
# server uses to detect an old bridge that silently dropped joypad entries.
var _sequence_input_kinds: Dictionary = {}
var _step_input_kinds: Dictionary = {}
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
# Same guarantee for joypad state (#233): buttons whose press has fired
# (key "device:button") and axes whose last-set value is nonzero
# (key "device:axis") — a dropped end event would otherwise latch the polled
# Input singletons (is_joy_button_pressed / get_joy_axis) until game restart.
var _held_joy_buttons: Dictionary = {}
var _active_axes: Dictionary = {}
# Same guarantee for raw keys (#290), keyed by "physical:code". Refcounted: a
# combo presses each modifier as its own key, and overlapping entries can hold
# the same key more than once, so the entry tracks a press COUNT and the engine
# release only fires when it returns to zero. Stores primitives only ({count,
# physical, code, mask}) so the cleanup loop never touches a freed instance.
var _held_keys: Dictionary = {}


# Release any action/button/key still held and re-zero any active axis from an
# interrupted sequence. A release here is a guaranteed cleanup, never a queued
# step that a clear could drop. Safe to call when nothing is held.
func _release_held_actions() -> void:
	if _held_actions.is_empty() and _held_joy_buttons.is_empty() and _active_axes.is_empty() and _held_keys.is_empty():
		return
	for action in _held_actions.keys():
		var release := InputEventAction.new()
		release.action = action
		release.pressed = false
		release.strength = 0.0
		Input.parse_input_event(release)
	for bkey in _held_joy_buttons.keys():
		var binfo = _held_joy_buttons[bkey]
		var brel := InputEventJoypadButton.new()
		brel.device = int(binfo["device"])
		brel.button_index = int(binfo["button"]) as JoyButton
		brel.pressed = false
		Input.parse_input_event(brel)
	for akey in _active_axes.keys():
		var ainfo = _active_axes[akey]
		var azero := InputEventJoypadMotion.new()
		azero.device = int(ainfo["device"])
		azero.axis = int(ainfo["axis"]) as JoyAxis
		azero.axis_value = 0.0
		Input.parse_input_event(azero)
	for kkey in _held_keys.keys():
		var kinfo = _held_keys[kkey]
		Input.parse_input_event(_make_key_event(bool(kinfo["physical"]), int(kinfo["code"]), int(kinfo["mask"]), false))
	# Flush so the release takes effect immediately — _exit_tree may not get
	# another frame, and a cleanup should be deterministic, not deferred.
	Input.flush_buffered_events()
	_held_actions.clear()
	_held_joy_buttons.clear()
	_active_axes.clear()
	_held_keys.clear()


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
		"exec_run":
			_handle_exec_run(data)
			return true
		"exec_list":
			_handle_exec_list(data)
			return true
		"exec_remove":
			_handle_exec_remove(data)
			return true
		"exec_clear":
			_handle_exec_clear(data)
			return true
		"validate_meshes":
			_handle_validate_meshes(data)
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
	# Element 6 piggybacks the scene's cached mesh-integrity warnings: the
	# moment the agent LOOKS at a wrong-looking render is when they're
	# actionable, and riding the same message costs no extra round-trip and
	# cannot time out on version skew (older receivers ignore the element).
	EngineDebugger.send_message("godot_mcp:screenshot_result", [
		true,
		base64,
		image.get_width(),
		image.get_height(),
		"",
		_mesh_warnings.duplicate()
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
		hint = ("No nodes found in group '%s' and no _mcp_state() methods detected; " +
			"showing visible 2D and 3D world nodes (meshes, gridmaps, cameras, lights, " +
			"physics bodies and trigger areas, and visible CanvasItems). " +
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
			# Visible world nodes, by dimension. 2D = any visible CanvasItem.
			# 3D = a curated set of the entities an agent actually cares about:
			# rendered geometry (GeometryInstance3D covers MeshInstance3D,
			# MultiMeshInstance3D, GPUParticles3D, Sprite3D, Label3D, CSG, SoftBody3D)
			# plus Light3D (a VisualInstance3D, NOT a GeometryInstance3D, so named
			# separately). GeometryInstance3D is deliberately narrower than its parent
			# VisualInstance3D, which also drags in bake/helper nodes (ReflectionProbe,
			# VoxelGI, LightmapGI, OccluderInstance3D, Decal, FogVolume, particle
			# field nodes, VisibleOnScreenNotifier3D) — all default-visible noise that
			# would crowd the max_nodes budget. GridMap (extends Node3D directly, NOT a
			# VisualInstance3D) is checked by string because the gridmap module can be
			# compiled out independently — `is GridMap` would be an unresolved parse-time
			# identifier that fails the whole autoload in such a build. Camera3D (also a
			# bare Node3D), and physics bodies / trigger areas (CollisionObject3D — the
			# gameplay entities, e.g. an FPS's enemies and player) round out the set.
			# Pure-structure Node3Ds (Marker3D, Skeleton3D, bone attachments, audio
			# emitters, bare pivots) are skipped. This mirrors the 2D tier, where
			# CharacterBody2D is itself a CanvasItem and so already surfaces.
			if node is CanvasItem:
				include_node = (node as CanvasItem).is_visible_in_tree()
			elif node is Node3D:
				include_node = (node as Node3D).is_visible_in_tree() and (
					node is GeometryInstance3D
					or node is Light3D
					or node.is_class("GridMap")
					or node is Camera3D
					or node is CollisionObject3D)

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
		if child == scene_root or child == self or child == _exec_holder:
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
	var signal_specs: Array = data[3] if data.size() > 3 else []
	var start_result := _sampler.start(specs, hz, duration_ms, signal_specs)
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_start", {
		"started": true,
		"resolved_fields": start_result.get("resolved_fields", 0),
		"connected_signals": start_result.get("connected_signals", 0),
		"unresolved_signals": start_result.get("unresolved_signals", []),
	}])


func _handle_watch_collect() -> void:
	if _sampler == null:
		EngineDebugger.send_message("godot_mcp:game_response", ["watch_collect", {"window_ms": 0, "sample_count": 0, "fields": {}, "events": [], "events_truncated": false}])
		return
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_collect", _sampler.collect()])


func _handle_watch_stop() -> void:
	if _sampler == null:
		EngineDebugger.send_message("godot_mcp:game_response", ["watch_stop", {"window_ms": 0, "sample_count": 0, "fields": {}, "events": [], "events_truncated": false}])
		return
	EngineDebugger.send_message("godot_mcp:game_response", ["watch_stop", _sampler.stop()])


class _MCPGameLogger extends Logger:
	var _output: PackedStringArray = []
	var _max_lines := 1000
	# Lines trimmed off the front of the ring buffer, ever. Lets a caller hold a
	# STABLE mark (dropped + size) across trims instead of a raw index that
	# silently drifts when the buffer overflows (exec's runtime-error window).
	var _dropped := 0
	var _mutex := Mutex.new()

	func _log_message(message: String, error: bool) -> void:
		_mutex.lock()
		var prefix := "[ERROR] " if error else ""
		_output.append(prefix + message)
		if _output.size() > _max_lines:
			_output.remove_at(0)
			_dropped += 1
		_mutex.unlock()

	func _log_error(function: String, file: String, line: int, code: String,
					rationale: String, editor_notify: bool, error_type: int,
					script_backtraces: Array[ScriptBacktrace]) -> void:
		_mutex.lock()
		var msg := "[%s:%d] %s: %s" % [file.get_file(), line, code, rationale]
		_output.append("[ERROR] " + msg)
		if _output.size() > _max_lines:
			_output.remove_at(0)
			_dropped += 1
		_mutex.unlock()

	func get_output() -> PackedStringArray:
		return _output

	func get_dropped() -> int:
		return _dropped

	func clear() -> void:
		_mutex.lock()
		_dropped += _output.size()  # cleared lines are gone the same as trimmed ones
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
		return MCPKeyNames.event_string(event as InputEventKey)
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
		return "Joypad Button %d (%s)" % [joy_event.button_index, MCPJoyNames.button_name(joy_event.button_index)]
	elif event is InputEventJoypadMotion:
		# The signed axis_value is the direction bit an agent needs to lift the
		# binding straight into an injection (e.g. move_left = left_x, value -1.0).
		var joy_motion := event as InputEventJoypadMotion
		return "Joypad Axis %d (%s, value %+.1f)" % [joy_motion.axis, MCPJoyNames.axis_name(joy_motion.axis), joy_motion.axis_value]
	elif event is InputEventMouseMotion:
		var mouse_motion := event as InputEventMouseMotion
		return "Mouse Motion (rel %+.1f, %+.1f)" % [mouse_motion.relative.x, mouse_motion.relative.y]
	return event.as_text()


func _handle_execute_input_sequence(data: Array) -> void:
	var inputs: Array = data[0] if data.size() > 0 else []
	var report: Array = data[1] if data.size() > 1 and data[1] is Array else []
	var screenshot_offsets: Array = data[2] if data.size() > 2 and data[2] is Array else []
	var cap_max_width: int = int(data[3]) if data.size() > 3 else 640

	# Reset the skew echo up front: the result's input_kinds must reflect THIS
	# call's compile, never a stale value from a prior sequence (its absence is
	# how a new server detects an old bridge — a stale dict would mask that).
	_sequence_input_kinds = _new_input_kinds()

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

	var compiled := _compile_input_events(inputs)
	if compiled.has("error"):
		EngineDebugger.send_message("godot_mcp:input_sequence_result", [{
			"error": compiled["error"],
		}])
		return
	_sequence_events = compiled["events"]
	_sequence_input_kinds = compiled["kinds"]

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
# Cap on the sub-events one mouse-look sweep entry expands into. Without it a
# max-span sweep (duration_ms 40000) would emit ceil(40000/16) ~= 2500 events for
# a single entry; 256 keeps ~16ms (60Hz) granularity up to ~4s and coarsens beyond
# that. The last chunk absorbs the remainder regardless of n, so the summed delta
# is unchanged — only temporal smoothness past the cap degrades.
const LOOK_MAX_SUBEVENTS := 256

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

	# Reset the skew echo up front (see _handle_execute_input_sequence): the
	# step result's input_kinds must reflect this call, never a prior step's.
	_step_input_kinds = _new_input_kinds()

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
	var compiled := _compile_input_events(params.get("inputs", []))
	if compiled.has("error"):
		_send_game_time_response("game_time_step", {"error": compiled["error"]})
		return
	_step_input_kinds = compiled["kinds"]

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


func _new_input_kinds() -> Dictionary:
	# One source of truth for the input_kinds shape so every reset/result site
	# carries the same keys (#290 added "key", #294 added "look"). A missing key
	# here would make the server's skew check misfire against our own bridge.
	return {"action": 0, "joy_button": 0, "axis": 0, "key": 0, "look": 0}


func _compile_input_events(inputs: Array) -> Dictionary:
	# Builds the typed input timeline shared by input sequences and game-time
	# steps (#233/#290). Each entry is discriminated by which key it carries:
	# `axis` (analog joypad axis), `joy_button`, `key` (raw keyboard / modifier
	# combo), or `action_name` (with optional fractional `strength`). Returns
	# {"events": [...], "kinds": {...}} or {"error": ...} on an unknown
	# action/button/axis/key. Every event carries:
	#   time     - ms offset from sequence/window start
	#   phase    - 0 = release/zero-set, 1 = press/set (the equal-time tie-break)
	#   complete - completion credit, counted when the event fires (1 on ends)
	var events: Array = []
	var kinds := _new_input_kinds()
	for input in inputs:
		var start_ms: int = int(input.get("start_ms", 0))
		var dur: int = int(input.get("duration_ms", 0))
		# An instant tap (duration 0 — the schema default) must still emit its end
		# event STRICTLY AFTER its start, or the equal-time (time, phase) sort below
		# orders the release/zero-set before the press/set and the input latches
		# (press never paired with a release). One ms is enough: the time sort then
		# fires start-before-end even when both land in the same process frame.
		var end_ms: int = start_ms + maxi(dur, 1)
		if input.has("axis"):
			var axis := MCPJoyNames.axis_index(input["axis"])
			if axis < 0:
				return {"error": "Unknown joypad axis: %s (valid: %s)" % [str(input["axis"]), ", ".join(MCPJoyNames.AXES.keys())]}
			var device: int = int(input.get("device", 0))
			var value: float = clampf(float(input.get("value", 0.0)), -1.0, 1.0)
			kinds["axis"] += 1
			events.append({"time": start_ms, "phase": 1, "complete": 0,
				"kind": "axis", "axis": axis, "device": device, "value": value})
			events.append({"time": end_ms, "phase": 0, "complete": 1,
				"kind": "axis", "axis": axis, "device": device, "value": 0.0})
		elif input.has("joy_button"):
			var button := MCPJoyNames.button_index(input["joy_button"])
			if button < 0:
				return {"error": "Unknown joypad button: %s (valid: %s, or a raw index)" % [str(input["joy_button"]), ", ".join(MCPJoyNames.BUTTONS.keys())]}
			var bdevice: int = int(input.get("device", 0))
			kinds["joy_button"] += 1
			events.append({"time": start_ms, "phase": 1, "complete": 0,
				"kind": "joy_button", "button": button, "device": bdevice, "is_press": true})
			events.append({"time": end_ms, "phase": 0, "complete": 1,
				"kind": "joy_button", "button": button, "device": bdevice, "is_press": false})
		elif input.has("key"):
			var parsed := MCPKeyNames.parse(input["key"])
			var code: int = int(parsed["code"])
			if code == KEY_NONE:
				return {"error": "Unknown key: %s (e.g. \"a\", \"escape\", \"ctrl+s\", \"shift+f1\")" % str(input["key"])}
			var mask: int = int(parsed["mask"])
			var physical: bool = bool(input.get("physical", false))
			kinds["key"] += 1
			# Each modifier is pressed/released as its own real key so polled
			# is_key_pressed(KEY_CTRL) reads true (the modifier FLAG on another
			# event does not update that singleton). The base event also carries
			# the modifier flags so InputMap chords and _input handlers match.
			# Modifier keys are position-stable -> set both keycode+physical (mask
			# 0, an exact match for a bare-modifier binding); the base honors
			# `physical`. Completion credit (1) rides only the base release.
			var mod_keys := MCPKeyNames.modifier_key_indices(mask)
			for mk in mod_keys:
				events.append({"time": start_ms, "phase": 1, "complete": 0,
					"kind": "key", "code": int(mk), "physical": false, "mask": 0, "is_press": true})
			events.append({"time": start_ms, "phase": 1, "complete": 0,
				"kind": "key", "code": code, "physical": physical, "mask": mask, "is_press": true})
			events.append({"time": end_ms, "phase": 0, "complete": 1,
				"kind": "key", "code": code, "physical": physical, "mask": mask, "is_press": false})
			for mk in mod_keys:
				events.append({"time": end_ms, "phase": 0, "complete": 0,
					"kind": "key", "code": int(mk), "physical": false, "mask": 0, "is_press": false})
		elif input.has("look"):
			var look_val: Variant = input["look"]
			if not (look_val is Array) or (look_val as Array).size() != 2:
				return {"error": "look expects [dx, dy] (two numbers), got %s" % str(look_val)}
			# Validate element types before casting, matching every other kind's clean
			# error-dict contract: float() of a nested array throws an uncaught script
			# error, and float() of a bool/string would silently coerce to a wrong value.
			var lx: Variant = (look_val as Array)[0]
			var ly: Variant = (look_val as Array)[1]
			if not (lx is float or lx is int) or not (ly is float or ly is int):
				return {"error": "look expects [dx, dy] (two numbers), got %s" % str(look_val)}
			var dx: float = float(lx)
			var dy: float = float(ly)
			kinds["look"] += 1
			# Relative mouse-look is STATELESS (no hold/release/refcount): a snap-turn
			# (dur < 16) is ONE motion event carrying the whole delta; a longer sweep is
			# N = ceil(dur/16) motion events (~16ms/chunk = 60Hz, capped at
			# LOOK_MAX_SUBEVENTS) spaced across the window, each carrying delta/N. The
			# last chunk absorbs the float remainder so the chunks sum to the delta
			# (exact in float64; the delivered Vector2 is float32, so a very large sweep
			# drifts sub-pixel — imperceptible). Motion is additive, so if several
			# sub-events coalesce into one frame on a slow frame or a big step dt, the
			# summed delta is unchanged — only the temporal smoothness degrades.
			var n: int = clampi(int(ceil(float(dur) / 16.0)), 1, LOOK_MAX_SUBEVENTS)
			var chunk_x: float = dx / float(n)
			var chunk_y: float = dy / float(n)
			for i in n:
				var ex: float = chunk_x
				var ey: float = chunk_y
				if i == n - 1:
					ex = dx - chunk_x * float(n - 1)
					ey = dy - chunk_y * float(n - 1)
				events.append({"time": start_ms + (i * dur) / n, "phase": 1,
					"complete": (1 if i == n - 1 else 0), "kind": "look", "dx": ex, "dy": ey})
		else:
			var action_name: String = input.get("action_name", "")
			if action_name.is_empty():
				continue
			if not InputMap.has_action(action_name):
				return {"error": "Unknown action: %s" % action_name}
			var strength: float = clampf(float(input.get("strength", 1.0)), 0.0, 1.0)
			kinds["action"] += 1
			events.append({"time": start_ms, "phase": 1, "complete": 0,
				"kind": "action", "action": action_name, "strength": strength, "is_press": true})
			events.append({"time": end_ms, "phase": 0, "complete": 1,
				"kind": "action", "action": action_name, "strength": strength, "is_press": false})
	# Releases/zero-sets fire before presses/sets at equal time, so a same-time
	# axis zero can never clobber a follow-on set of the same axis.
	events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if a.time != b.time:
			return a.time < b.time
		return a.phase < b.phase
	)
	_cancel_redundant_axis_zeroes(events)
	return {"events": events, "kinds": kinds}


func _cancel_redundant_axis_zeroes(events: Array) -> void:
	# Abutting same-axis entries (sweep ramps) must not bounce through zero:
	# both the zero-set and the next set pop in the same frame's while-loop, so
	# sort order alone cannot hide the transient zero from InputMap edge
	# detection (is_action_just_released would fire mid-sweep). Drop a zero-set
	# that lands at the same time as a follow-on set of the same (device, axis),
	# moving its completion credit to the survivor so counts stay exact.
	# Actions and buttons are deliberately NOT cancelled: release+press at the
	# same ms is a legitimate double-tap edge.
	var i := 0
	while i < events.size():
		var ev: Dictionary = events[i]
		if ev.kind == "axis" and ev.phase == 0:
			var j := i + 1
			while j < events.size() and events[j].time == ev.time:
				var nx: Dictionary = events[j]
				if nx.kind == "axis" and nx.phase == 1 and nx.axis == ev.axis and nx.device == ev.device:
					nx.complete = int(nx.complete) + int(ev.complete)
					events.remove_at(i)
					i -= 1
					break
				j += 1
		i += 1


func _inject_timeline_event(ev: Dictionary) -> int:
	# Build and parse the engine event for one timeline entry, maintaining the
	# held-state registries that _release_held_actions uses for guaranteed
	# cleanup. Returns the event's completion credit. Joypad and key events drive
	# the polled Input singletons too (get_joy_axis / is_joy_button_pressed /
	# is_key_pressed): unlike the mouse cursor, parse_input_event updates that
	# state for any device id with no physical pad/keyboard required.
	match str(ev.kind):
		"action":
			var ae := InputEventAction.new()
			ae.action = ev.action
			ae.pressed = ev.is_press
			ae.strength = float(ev.strength) if ev.is_press else 0.0
			Input.parse_input_event(ae)
			if ev.is_press:
				_held_actions[ev.action] = true
			else:
				_held_actions.erase(ev.action)
		"joy_button":
			var be := InputEventJoypadButton.new()
			be.device = ev.device
			be.button_index = ev.button as JoyButton
			be.pressed = ev.is_press
			Input.parse_input_event(be)
			var bkey := "%d:%d" % [ev.device, ev.button]
			if ev.is_press:
				_held_joy_buttons[bkey] = {"device": ev.device, "button": ev.button}
			else:
				_held_joy_buttons.erase(bkey)
		"axis":
			var me := InputEventJoypadMotion.new()
			me.device = ev.device
			me.axis = ev.axis as JoyAxis
			me.axis_value = ev.value
			Input.parse_input_event(me)
			var akey := "%d:%d" % [ev.device, ev.axis]
			if absf(float(ev.value)) > 0.0001:
				_active_axes[akey] = {"device": ev.device, "axis": ev.axis}
			else:
				_active_axes.erase(akey)
		"key":
			var code: int = int(ev.code)
			var physical: bool = bool(ev.physical)
			var kkey := "%d:%d" % [int(physical), code]
			# Refcount: a combo presses each modifier as its own key, and
			# overlapping entries can hold the same key more than once. Drive the
			# engine only on the 0<->1 edge so an inner release never turns a
			# still-held key off (the early-release bug), and the registry mirrors
			# the real pressed state for guaranteed cleanup.
			# Keyed by (physical, code) only, NOT mask: two overlapping combos that
			# share a base key but differ in modifiers (e.g. ctrl+s and shift+s)
			# collapse to one entry, so the shared base event reflects the FIRST
			# combo's modifier flags. The polled key state stays correct (one key,
			# refcounted, no early release); only the base event's flags differ for
			# that exotic overlap. Keying by mask instead would split them and
			# reintroduce an early release of the shared base key — the worse bug.
			if ev.is_press:
				if _held_keys.has(kkey):
					_held_keys[kkey]["count"] = int(_held_keys[kkey]["count"]) + 1
				else:
					_held_keys[kkey] = {"count": 1, "physical": physical, "code": code, "mask": int(ev.mask)}
					Input.parse_input_event(_make_key_event(physical, code, int(ev.mask), true))
			elif _held_keys.has(kkey):
				var n := int(_held_keys[kkey]["count"]) - 1
				if n <= 0:
					_held_keys.erase(kkey)
					Input.parse_input_event(_make_key_event(physical, code, int(ev.mask), false))
				else:
					_held_keys[kkey]["count"] = n
		"look":
			# Relative mouse-look is stateless: each event delivers its delta to
			# _input/_unhandled_input and leaves NO held state to clean up (no
			# registry, no guaranteed release). Set both relative and screen_relative
			# to the delta — emulating a real mouse moving [dx,dy] SCREEN pixels: the
			# engine scales the DELIVERED event.relative by the viewport's input
			# transform on dispatch (identity for default/3D projects, so an FPS
			# camera integrates exactly [dx,dy]; a 2D content-scale stretch scales it,
			# as it would a physical mouse), while event.screen_relative stays the raw
			# delta. position is the current cursor spot for a well-formed event
			# (irrelevant under capture). The game owns mouse mode, not the bridge.
			var mm := InputEventMouseMotion.new()
			var delta := Vector2(float(ev.dx), float(ev.dy))
			mm.relative = delta
			mm.screen_relative = delta
			var vp := get_viewport()
			var pos := vp.get_mouse_position() if vp != null else Vector2.ZERO
			mm.position = pos
			mm.global_position = pos
			Input.parse_input_event(mm)
	return int(ev.get("complete", 0))


# Build an InputEventKey. A logical key sets both keycode and physical_keycode
# (a realistic US-layout event that drives is_key_pressed AND is_physical_key_pressed
# plus either binding kind); physical:true sends a physical-only event (keycode
# unset) for layout-independent / physical-keycode-binding testing.
func _make_key_event(physical: bool, code: int, mask: int, pressed: bool) -> InputEventKey:
	var ke := InputEventKey.new()
	if physical:
		ke.physical_keycode = code as Key
	else:
		ke.keycode = code as Key
		ke.physical_keycode = code as Key
	_apply_key_modifiers(ke, mask)
	ke.pressed = pressed
	return ke


func _apply_key_modifiers(ke: InputEventKey, mask: int) -> void:
	ke.ctrl_pressed = (mask & int(KEY_MASK_CTRL)) != 0
	ke.shift_pressed = (mask & int(KEY_MASK_SHIFT)) != 0
	ke.alt_pressed = (mask & int(KEY_MASK_ALT)) != 0
	ke.meta_pressed = (mask & int(KEY_MASK_META)) != 0


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

	# Reset the skew echo up front (see _handle_execute_input_sequence).
	_step_input_kinds = _new_input_kinds()

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

	var compiled := _compile_input_events(params.get("inputs", []))
	if compiled.has("error"):
		_send_game_time_response("game_time_step_until", {"error": compiled["error"]})
		return
	_step_input_kinds = compiled["kinds"]

	_engage_freeze()

	# Predicate already holds: advance nothing, stay frozen, report it.
	# input_kinds still rides along — its absence is the version-skew signal a
	# new server reads, so every success shape must carry it.
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
			"input_kinds": _step_input_kinds,
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
		_inject_timeline_event(ev)
		_step_events_fired += 1
		_step_needs_settle = true

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
	var forced := _held_actions.size() + _held_joy_buttons.size() + _active_axes.size() + _held_keys.size()
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
		"input_kinds": _step_input_kinds,
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


# ── godot_exec: run agent-provided GDScript in this game process (#243) ───────
#
# One-shot scripts compile as the body of `_mcp_run(<bindings>)` (see
# MCPExecGuard.build_wrapper) and run synchronously right here. Persistent
# behaviors are nodes the script attaches under the `holder` binding — a child
# of /root, NOT of this bridge: bridge children inherit PROCESS_MODE_ALWAYS and
# would keep acting under a freeze, while a root child pauses with the tree
# (bots respect freeze/step) yet survives scene reloads. The game process dying
# on stop is the cleanup guarantee.

# Cap on runtime-error lines echoed back per exec — the full text stays in the
# game console either way.
const EXEC_MAX_ERROR_LINES := 20

var _exec_holder: Node = null


func _exec_params(data: Array) -> Dictionary:
	return data[0] if data.size() > 0 and data[0] is Dictionary else {}


# Responses correlate by message type alone in the editor plugin, so a late
# response from a timed-out call could be consumed as the answer to the NEXT
# call of the same type — wrong result, silently. Echoing the relay's call_id
# lets the relay discard mismatches. Absent when the relay pushed none (older
# server): the relay accepts unmatched responses then, so skew is safe both ways.
func _send_exec_response(msg_type: String, result: Dictionary, params: Dictionary) -> void:
	if params.has("call_id"):
		result["call_id"] = params["call_id"]
	EngineDebugger.send_message("godot_mcp:game_response", [msg_type, result])


func _ensure_exec_holder() -> Node:
	if _exec_holder != null and is_instance_valid(_exec_holder):
		return _exec_holder
	_exec_holder = Node.new()
	_exec_holder.name = "MCPExecHolder"
	# Stamp attach time on whatever user scripts add, so exec_list can report an
	# age without trusting the script to record one.
	_exec_holder.child_entered_tree.connect(func(child: Node) -> void:
		child.set_meta("mcp_exec_attached_ms", Time.get_ticks_msec()))
	get_tree().root.add_child(_exec_holder)
	return _exec_holder


# A stable position in the logger stream (survives ring-buffer trims): lines
# appended ever = dropped + currently held.
func _exec_logger_mark() -> int:
	return (_logger.get_dropped() + _logger.get_output().size()) if _logger else 0


# The window of logger lines produced since `mark` (an _exec_logger_mark
# value), error lines only. Process-wide, not per-script: a concurrent game
# error inside the window rides along — acceptable for an honest "what went
# wrong" echo. If the ring buffer trimmed past the mark (a >1000-line script),
# the lost stretch is reported instead of silently misattributed.
func _exec_logger_delta(mark: int) -> Array:
	var out: Array = []
	if _logger == null:
		return out
	var lines := _logger.get_output()
	var start := mark - _logger.get_dropped()
	if start < 0:
		out.append("... (log buffer overflowed; %d earlier lines lost — see the game console)" % -start)
		start = 0
	for i in range(start, lines.size()):
		if not lines[i].begins_with("[ERROR] "):
			continue
		if out.size() >= EXEC_MAX_ERROR_LINES:
			out.append("... (more errors truncated; see the game console)")
			break
		out.append(lines[i].substr(8))
	return out


func _build_exec_context() -> Dictionary:
	# The step_until predicate context (autoloads by name + tree/root), plus
	# `holder`. If a project defines an autoload literally named "holder", the
	# autoload keeps the name (a duplicate parameter would be a parse error);
	# the exec holder is still reachable as root.get_node("MCPExecHolder").
	var ctx := _build_predicate_context()
	var names: PackedStringArray = ctx["names"]
	var inputs: Array = ctx["inputs"]
	if not ("holder" in names):
		names.append("holder")
		inputs.append(_ensure_exec_holder())
	return {"names": names, "inputs": inputs}


func _handle_exec_run(data: Array) -> void:
	var params := _exec_params(data)
	var source: String = str(params.get("source", ""))

	var scan := MCPExecGuard.scan_source(source)
	if not scan.get("ok", false):
		_send_exec_response("exec_run", {"error": str(scan.get("message", "exec source rejected"))}, params)
		return

	var ctx := _build_exec_context()
	var script := GDScript.new()
	script.source_code = MCPExecGuard.build_wrapper(source, ctx["names"])

	var mark := _exec_logger_mark()
	if script.reload() != OK or not script.can_instantiate():
		var detail := "; ".join(PackedStringArray(_exec_logger_delta(mark)))
		var msg := "exec compile error"
		if detail.is_empty():
			msg += " (parser text not captured; check the game console, e.g. minimal-godot-mcp get_console_output)"
		else:
			msg += ": " + detail
		_send_exec_response("exec_run", {"error": msg}, params)
		return

	var inst: Object = script.new()
	mark = _exec_logger_mark()
	var t0 := Time.get_ticks_msec()
	# Synchronous and non-preemptible: an infinite loop here hangs the game (the
	# relay/server time out; godot_editor stop kills the process). That is the
	# documented contract — no wall budget is pretended.
	var result: Variant = inst.callv("_mcp_run", ctx["inputs"])
	var duration := Time.get_ticks_msec() - t0

	# Runtime backstop for the scanner's SYNC_ONLY rule (a string-built await
	# can slip past a token scan): a suspended call returns a function state.
	if typeof(result) == TYPE_OBJECT and result != null \
			and result.get_class() == "GDScriptFunctionState":
		_send_exec_response("exec_run", {"error":
			"SCRIPT_SUSPENDED: the script hit an await and suspended (exec is synchronous-only; " +
			"side effects before the await have already run). Use godot_game_time step/step_until to wait."}, params)
		return

	var out: Dictionary = {
		"completed": true,
		"result": _sanitize_value(result),
		"duration_ms": duration,
		"holder_children": _exec_holder.get_child_count() \
			if _exec_holder != null and is_instance_valid(_exec_holder) else 0,
	}
	var errs := _exec_logger_delta(mark)
	if not errs.is_empty():
		out["runtime_errors"] = errs
	_send_exec_response("exec_run", out, params)


func _handle_exec_list(data: Array) -> void:
	var params := _exec_params(data)
	var nodes: Array = []
	if _exec_holder != null and is_instance_valid(_exec_holder):
		var now := Time.get_ticks_msec()
		for child in _exec_holder.get_children():
			var script_chars := 0
			var s: Variant = child.get_script()
			if s is GDScript:
				script_chars = (s as GDScript).source_code.length()
			nodes.append({
				"name": str(child.name),
				"class": child.get_class(),
				"script_chars": script_chars,
				"age_ms": now - int(child.get_meta("mcp_exec_attached_ms", now)),
				# Internal processing too: Timers and tweened nodes drive
				# themselves internally and would otherwise read as idle.
				"processing": child.is_processing() or child.is_physics_processing() \
					or child.is_processing_internal() or child.is_physics_processing_internal(),
			})
	_send_exec_response("exec_list", {"nodes": nodes, "count": nodes.size()}, params)


func _handle_exec_remove(data: Array) -> void:
	var params := _exec_params(data)
	var node_name := str(params.get("name", ""))
	var child: Node = null
	if _exec_holder != null and is_instance_valid(_exec_holder) and not node_name.is_empty():
		# Name EQUALITY against direct children — never a NodePath lookup: a
		# path-like name would traverse out of the holder (".." resolves to
		# /root, "a/b" to a grandchild) and queue_free whatever it lands on.
		for c in _exec_holder.get_children():
			if str(c.name) == node_name:
				child = c
				break
	if child == null:
		var have: Array = []
		if _exec_holder != null and is_instance_valid(_exec_holder):
			for c in _exec_holder.get_children():
				have.append(str(c.name))
		_send_exec_response("exec_remove", {"error":
			"NOT_FOUND: no exec node named '%s' (have: %s)" % [
				node_name, ", ".join(PackedStringArray(have)) if not have.is_empty() else "none"]}, params)
		return
	# Detach immediately so a list right after this call already shows it gone;
	# queue_free still frees the detached node at the end of the frame.
	_exec_holder.remove_child(child)
	child.queue_free()
	_send_exec_response("exec_remove", {
		"removed": true,
		"name": node_name,
		"remaining": _exec_holder.get_child_count(),
	}, params)


func _handle_exec_clear(data: Array) -> void:
	var params := _exec_params(data)
	var removed := 0
	if _exec_holder != null and is_instance_valid(_exec_holder):
		for child in _exec_holder.get_children():
			_exec_holder.remove_child(child)
			child.queue_free()
			removed += 1
	_send_exec_response("exec_clear", {"removed_count": removed}, params)
