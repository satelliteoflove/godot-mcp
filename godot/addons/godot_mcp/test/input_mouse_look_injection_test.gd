extends SceneTree

## Headless pins for relative mouse-look injection (#294), driving the REAL
## MCPGameBridge sequence engine.
##
## WHAT IT PINS (engine ground truth from Godot 4.6, validated by the mouse-input
## spike):
##  - Input.parse_input_event(InputEventMouseMotion) delivers `relative` faithfully
##    to _input AND _unhandled_input with no physical mouse — the property that
##    makes FPS-camera injection viable.
##  - The `look` kind is STATELESS: a snap-turn (duration_ms 0) is ONE motion event
##    carrying the whole delta; a duration_ms > 0 sweep is N events spaced across the
##    window, each carrying delta/N and summing EXACTLY to the delta. Nothing latches
##    and there is no held registry to clean up.
##  - Delivery is unaffected by a MOUSE_MODE_CAPTURED request (the FPS capture mode).
##  - get_input_map display renders an InputEventMouseMotion via _event_to_string.
##
## Step-window parity is by construction: game_time step compiles through the same
## _compile_input_events and injects through the same _inject_timeline_event as the
## sequence path white-boxed here. The step path's freeze/pause semantics make a
## bare-SceneTree drive hang-prone, so step look injection is covered by the shared
## code paths above, the server vitest, and live MCP validation, not re-driven here.
##
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_mouse_look_injection_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const PROBE_ACT := "mcp_probe_look_action"  # any registered action, for the kinds count

var _count := 0
var _failures := 0


class _Cap extends Node:
	## Captures InputEventMouseMotion delivery. Motion is counted (and the deltas
	## summed / integrated into a yaw) in _input; _unhandled_input only flips a flag
	## so a single event is never double-counted.
	##
	## NOTE on the two delta fields: parse_input_event runs the event through the
	## viewport's input transform on dispatch, which SCALES event.relative by the
	## project's 2D stretch (identity for default/3D projects — so an FPS camera
	## integrates exactly the injected delta — but nonzero in a pixel-art 2D host
	## like NEON RAMPAGE). event.screen_relative is the raw screen-pixel delta and
	## is NOT transformed, so it is the project-independent value to assert on; we
	## still check that event.relative is delivered with the correct sign.
	var motion_count := 0
	var rel_sum := Vector2.ZERO
	var screen_rel_sum := Vector2.ZERO
	var last_relative := Vector2.ZERO
	var last_screen_relative := Vector2.ZERO
	var yaw := 0.0
	var unhandled := false
	func _ready() -> void:
		set_process_input(true)
		set_process_unhandled_input(true)
	func reset() -> void:
		motion_count = 0
		rel_sum = Vector2.ZERO
		screen_rel_sum = Vector2.ZERO
		last_relative = Vector2.ZERO
		last_screen_relative = Vector2.ZERO
		yaw = 0.0
		unhandled = false
	func _input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			var m := event as InputEventMouseMotion
			motion_count += 1
			rel_sum += m.relative
			screen_rel_sum += m.screen_relative
			last_relative = m.relative
			last_screen_relative = m.screen_relative
			yaw += m.relative.x * 0.005  # mirror a real FPS camera's yaw integration
	func _unhandled_input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			unhandled = true


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	if not InputMap.has_action(PROBE_ACT):
		InputMap.add_action(PROBE_ACT)

	print("\n=================== MOUSE-LOOK INJECTION TEST (#294) ===================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	var cap := _Cap.new()
	root.add_child(cap)
	for i in 3:
		await process_frame

	# ── 1. Snap delivery: a dur-0 look reaches _input and _unhandled_input ────
	cap.reset()
	bridge._handle_execute_input_sequence([[{"look": [10, -4], "start_ms": 0, "duration_ms": 0}]])
	for i in 5:
		await process_frame
	_check("snap look delivers exactly one motion event", cap.motion_count, 1)
	_check("snap look screen-pixel delta is faithful (project-independent)", cap.last_screen_relative, Vector2(10, -4))
	_check("delivered event.relative carries the correct direction (+x, -y)",
		[cap.last_relative.x > 0.0, cap.last_relative.y < 0.0], [true, true])
	_check("_unhandled_input also reached for the injected motion", cap.unhandled, true)
	_check("yaw integrates in the +x direction for a +dx look", cap.yaw > 0.0, true)

	# ── 2. No latch: a stateless look leaves no residual motion ──────────────
	var count_after_snap := cap.motion_count
	for i in 4:
		await process_frame
	_check("no residual motion after the look (stateless, no repeat)", cap.motion_count, count_after_snap)

	# ── 3. Distributed sweep: delta spread over duration_ms, sums to the delta ─
	await _settle()
	cap.reset()
	bridge._handle_execute_input_sequence([[{"look": [200, 0], "start_ms": 0, "duration_ms": 80}]])
	var g := 0
	while bridge._sequence_running and g < 800:
		g += 1
		await process_frame
	for i in 4:
		await process_frame
	_check("sweep delivered multiple motion events (not one snap)", cap.motion_count > 1, true)
	_check("sweep screen-pixel delta sums to the requested dx", is_equal_approx(cap.screen_rel_sum.x, 200.0), true)
	_check("sweep introduced no off-axis drift (dy stays 0)", is_equal_approx(cap.screen_rel_sum.y, 0.0), true)

	# ── 4. White-box chunking math (deterministic, no playback timing) ───────
	var sweep: Dictionary = bridge._compile_input_events([{"look": [90, 30], "duration_ms": 48}])
	var sw_evts: Array = sweep["events"]
	_check("dur 48 compiles to 3 motion sub-events (ceil 48/16)", sw_evts.size(), 3)
	var sx := 0.0
	var sy := 0.0
	for idx in sw_evts.size():
		sx += float(sw_evts[idx]["dx"])
		sy += float(sw_evts[idx]["dy"])
	_check("sweep dx chunks sum EXACTLY to the delta", is_equal_approx(sx, 90.0), true)
	_check("sweep dy chunks sum EXACTLY to the delta", is_equal_approx(sy, 30.0), true)
	_check("only the LAST sub-event carries completion credit",
		[int(sw_evts[0]["complete"]), int(sw_evts[1]["complete"]), int(sw_evts[2]["complete"])], [0, 0, 1])
	_check("sweep sub-event times are strictly increasing across the window",
		int(sw_evts[0]["time"]) < int(sw_evts[1]["time"]) and int(sw_evts[1]["time"]) < int(sw_evts[2]["time"]), true)

	# ── 5. dur 0 compiles to exactly one full-delta event ────────────────────
	var snap: Dictionary = bridge._compile_input_events([{"look": [5, 6], "duration_ms": 0}])
	var snap_evts: Array = snap["events"]
	_check("dur 0 compiles to exactly one motion event", snap_evts.size(), 1)
	_check("the single snap event carries the full delta + completion",
		[float(snap_evts[0]["dx"]), float(snap_evts[0]["dy"]), int(snap_evts[0]["complete"])], [5.0, 6.0, 1])

	# ── 6. Compile guards for a malformed look payload ───────────────────────
	var bad_arity: Dictionary = bridge._compile_input_events([{"look": [1]}])
	_check("look with one element rejected", str(bad_arity.get("error", "")).begins_with("look expects"), true)
	var bad_type: Dictionary = bridge._compile_input_events([{"look": "x"}])
	_check("non-array look rejected", str(bad_type.get("error", "")).begins_with("look expects"), true)

	# ── 7. Delivery survives a MOUSE_MODE_CAPTURED request (FPS capture mode) ──
	await _settle()
	cap.reset()
	var prev_mode := Input.mouse_mode
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	bridge._handle_execute_input_sequence([[{"look": [15, 0], "start_ms": 0, "duration_ms": 0}]])
	for i in 5:
		await process_frame
	_check("look delivered under MOUSE_MODE_CAPTURED", cap.motion_count >= 1, true)
	_check("screen-pixel delta faithful under capture", is_equal_approx(cap.screen_rel_sum.x, 15.0), true)
	Input.mouse_mode = prev_mode

	# ── 8. input_kinds carries a look count; mixed kinds counted ─────────────
	var mixed: Dictionary = bridge._compile_input_events([
		{"action_name": PROBE_ACT, "duration_ms": 10},
		{"key": "ctrl+s", "duration_ms": 10},
		{"look": [3, 4], "duration_ms": 10},
	])
	_check("mixed timeline counts the look kind for the skew echo",
		mixed["kinds"], {"action": 1, "joy_button": 0, "axis": 0, "key": 1, "look": 1})

	# ── 9. _event_to_string format pin (get_input_map display) ───────────────
	var mev := InputEventMouseMotion.new()
	mev.relative = Vector2(12, -3)
	_check("mouse motion stringifies for the get_input_map display",
		bridge._event_to_string(mev), "Mouse Motion (rel +12.0, -3.0)")

	root.remove_child(bridge)
	bridge.free()
	cap.free()

	if InputMap.has_action(PROBE_ACT):
		InputMap.erase_action(PROBE_ACT)

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _settle() -> void:
	# A short gap + a few frames between sequences, so a prior run has fully
	# finished before the next assertion (mirrors the key/joypad tests).
	await create_timer(0.05).timeout
	for i in 4:
		await process_frame


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
