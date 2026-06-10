extends SceneTree

## Headless pins for joypad/analog input injection (#233), driving the REAL
## MCPGameBridge sequence engine.
##
## WHAT IT PINS (engine ground truth from Godot 4.6 core/input/input.cpp):
##  - Input.parse_input_event(InputEventJoypadMotion/Button) updates the POLLED
##    Input singletons (get_joy_axis / is_joy_button_pressed) for any device id,
##    with no physical pad connected — the property that makes joypad injection
##    viable where mouse-cursor injection was not.
##  - Axis-bound actions get REAL InputMap deadzone math; InputEventAction with
##    fractional strength bypasses it (the two vehicles complement).
##  - Abutting same-axis entries (sweep ramps) never bounce through zero: the
##    compile-time zero-cancellation drops the boundary zero-set and transfers
##    its completion credit (white-boxed against _compile_input_events).
##  - The held-state registries generalize: an interrupted sequence and a tree
##    exit re-zero active axes and release joypad buttons, not just actions.
##  - LIMITATION pin: get_connected_joypads() never reports the virtual pad
##    (Input.joy_connection_changed is not script-bindable) — documented, and
##    asserted here so a future engine change surfaces as a test delta.
##
## Step-window parity is by construction: game_time step compiles through the
## same _compile_input_events and injects through the same _inject_timeline_event
## as the sequence path white-boxed here. The step path's own freeze/pause
## semantics make a bare-SceneTree drive hang-prone, so step joypad injection is
## covered by the shared code paths above, the server vitest, and live MCP
## validation (a real game_time step with joypad inputs echoing input_kinds),
## rather than re-driven here.
##
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_joypad_injection_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const AXIS_ACT := "mcp_probe_axis_act"   # bound to left_x +1.0, deadzone 0.2
const NEG_ACT := "mcp_probe_neg"         # unbound pair for the api-strength axis read
const POS_ACT := "mcp_probe_pos"

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	if not InputMap.has_action(AXIS_ACT):
		InputMap.add_action(AXIS_ACT, 0.2)
		var bind := InputEventJoypadMotion.new()
		bind.axis = JOY_AXIS_LEFT_X
		bind.axis_value = 1.0
		InputMap.action_add_event(AXIS_ACT, bind)
	for a in [NEG_ACT, POS_ACT]:
		if not InputMap.has_action(a):
			InputMap.add_action(a)

	print("\n===================== JOYPAD INJECTION TEST (#233) =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame

	# ── 1. Polled button state: by name, and by raw index ────────────────────
	bridge._handle_execute_input_sequence([[
		{"joy_button": "a", "start_ms": 0, "duration_ms": 100000},
		{"joy_button": 1, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("joy_button 'a' drives polled is_joy_button_pressed", Input.is_joy_button_pressed(0, JOY_BUTTON_A), true)
	_check("raw index 1 drives polled is_joy_button_pressed(B)", Input.is_joy_button_pressed(0, JOY_BUTTON_B), true)

	# ── 2. Polled axis + axis-bound action with REAL deadzone (value 0.7) ────
	bridge._handle_execute_input_sequence([[
		{"axis": "left_x", "value": 0.7, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("buttons from the interrupted sequence were force-released", Input.is_joy_button_pressed(0, JOY_BUTTON_A), false)
	_check("axis 0.7 drives polled get_joy_axis", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), 0.7), true)
	_check("axis-bound action pressed at 0.7 (deadzone 0.2)", Input.is_action_pressed(AXIS_ACT), true)
	_check("axis-bound action raw strength is the axis value", is_equal_approx(Input.get_action_raw_strength(AXIS_ACT), 0.7), true)
	# Exact deadzone normalization (raw - dz)/(1 - dz) = (0.7 - 0.2)/0.8 = 0.625.
	_check("axis-bound action strength is exactly deadzone-normalized", is_equal_approx(Input.get_action_strength(AXIS_ACT), 0.625), true)

	# ── 3. Sub-deadzone value: action NOT pressed, polled axis still moves ───
	bridge._handle_execute_input_sequence([[
		{"axis": "left_x", "value": 0.1, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("axis-bound action NOT pressed at 0.1 (under deadzone)", Input.is_action_pressed(AXIS_ACT), false)
	_check("polled get_joy_axis still reads 0.1 (deadzone is per-action, not per-axis)", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), 0.1), true)

	# ── 4. Fractional InputEventAction strength (bypasses deadzone) ──────────
	bridge._handle_execute_input_sequence([[
		{"action_name": POS_ACT, "strength": 0.5, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("fractional strength drives get_action_strength", is_equal_approx(Input.get_action_strength(POS_ACT), 0.5), true)
	_check("fractional strength drives the get_axis vector read", is_equal_approx(Input.get_axis(NEG_ACT, POS_ACT), 0.5), true)

	# ── 4b. Instant tap (duration_ms = 0 — the SCHEMA DEFAULT) must not latch ──
	# The end event has to fire strictly after the start, or the (time, phase)
	# sort would order release-before-press at equal time and the input would
	# stay held forever (regression guard for the controller-injection PR).
	var tap_compiled: Dictionary = bridge._compile_input_events([{"action_name": POS_ACT, "start_ms": 0, "duration_ms": 0}])
	var tap_evts: Array = tap_compiled["events"]
	_check("instant-tap press is compiled before its release", [bool(tap_evts[0].get("is_press")), int(tap_evts[0]["time"]) < int(tap_evts[1]["time"])], [true, true])
	bridge._handle_execute_input_sequence([[{"action_name": POS_ACT, "start_ms": 0, "duration_ms": 0}]])
	for i in 6:
		await process_frame
	_check("instant-tap action is NOT latched after the sequence", Input.is_action_pressed(POS_ACT), false)
	bridge._handle_execute_input_sequence([[{"joy_button": "x", "start_ms": 0, "duration_ms": 0}]])
	for i in 6:
		await process_frame
	_check("instant-tap joy_button is NOT latched after the sequence", Input.is_joy_button_pressed(0, JOY_BUTTON_X), false)
	bridge._handle_execute_input_sequence([[{"axis": "right_y", "value": 0.9, "start_ms": 0, "duration_ms": 0}]])
	for i in 6:
		await process_frame
	_check("instant-tap axis returns to rest (not latched at value)", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y), 0.0), true)

	# ── 5. Zero-bounce: abutting same-axis entries (sweep ramp) ──────────────
	# White-box first: the boundary zero-set is cancelled at compile time.
	var compiled: Dictionary = bridge._compile_input_events([
		{"axis": "left_x", "value": 0.5, "start_ms": 0, "duration_ms": 200},
		{"axis": "left_x", "value": 1.0, "start_ms": 200, "duration_ms": 200},
	])
	var events: Array = compiled["events"]
	_check("sweep compiles to 3 events (boundary zero cancelled)", events.size(), 3)
	_check("surviving boundary set carries the cancelled completion credit", int(events[1].get("complete", -1)), 1)
	_check("sweep ends with the final zero-set", [int(events[2]["phase"]), float(events[2]["value"])], [0, 0.0])

	# Black-box: drive it for real and sample every frame across the boundary.
	bridge._handle_execute_input_sequence([[
		{"axis": "left_x", "value": 0.5, "start_ms": 0, "duration_ms": 200},
		{"axis": "left_x", "value": 1.0, "start_ms": 200, "duration_ms": 200},
	]])
	var seen_nonzero := false
	var bounced := false
	var released_mid := false
	var saw_half := false
	var saw_full := false
	var sweep_start := Time.get_ticks_msec()
	var guard := 0
	while bridge._sequence_running and guard < 600:
		guard += 1
		await process_frame
		var elapsed := Time.get_ticks_msec() - sweep_start
		var v := Input.get_joy_axis(0, JOY_AXIS_LEFT_X)
		if absf(v - 0.5) < 0.01:
			saw_half = true
		if absf(v - 1.0) < 0.01:
			saw_full = true
		if absf(v) > 0.01:
			seen_nonzero = true
		elif seen_nonzero and elapsed < 380:
			bounced = true
		if seen_nonzero and elapsed < 380 and not Input.is_action_pressed(AXIS_ACT):
			released_mid = true
	await process_frame
	await process_frame
	_check("sweep reached the 0.5 segment", saw_half, true)
	_check("sweep reached the 1.0 segment", saw_full, true)
	_check("axis never bounced through zero at the segment boundary", bounced, false)
	_check("axis-bound action never released mid-sweep", released_mid, false)
	_check("axis returned to rest after the sweep", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), 0.0), true)
	_check("axis-bound action released after the sweep", Input.is_action_pressed(AXIS_ACT), false)

	# ── 6. Guaranteed release, generalized to buttons and axes ───────────────
	bridge._handle_execute_input_sequence([[
		{"axis": "left_y", "value": 0.8, "start_ms": 0, "duration_ms": 100000},
		{"joy_button": "b", "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("long axis hold active", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_Y), 0.8), true)
	_check("long button hold active", Input.is_joy_button_pressed(0, JOY_BUTTON_B), true)
	bridge._handle_execute_input_sequence([[
		{"action_name": POS_ACT, "start_ms": 0, "duration_ms": 10},
	]])
	await process_frame
	_check("interrupted sequence re-zeroed the held axis", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_Y), 0.0), true)
	_check("interrupted sequence released the held button", Input.is_joy_button_pressed(0, JOY_BUTTON_B), false)

	await create_timer(0.06).timeout
	for i in 4:
		await process_frame
	bridge._handle_execute_input_sequence([[
		{"axis": "right_x", "value": -0.6, "start_ms": 0, "duration_ms": 100000},
		{"joy_button": "dpad_up", "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("exit-tree case armed (axis)", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), -0.6), true)
	_check("exit-tree case armed (button)", Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_UP), true)
	root.remove_child(bridge)
	_check("tree exit re-zeroed the held axis", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_RIGHT_X), 0.0), true)
	_check("tree exit released the held button", Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_UP), false)
	root.add_child(bridge)
	await process_frame

	# ── 6b. Multiple devices are independent (registry keys on device:axis) ──
	bridge._handle_execute_input_sequence([[
		{"axis": "left_x", "value": 0.5, "device": 0, "start_ms": 0, "duration_ms": 100000},
		{"axis": "left_x", "value": -0.9, "device": 1, "start_ms": 0, "duration_ms": 100000},
		{"joy_button": "a", "device": 1, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("device 0 axis independent of device 1", is_equal_approx(Input.get_joy_axis(0, JOY_AXIS_LEFT_X), 0.5), true)
	_check("device 1 axis independent of device 0", is_equal_approx(Input.get_joy_axis(1, JOY_AXIS_LEFT_X), -0.9), true)
	_check("device 1 button does not bleed to device 0", [Input.is_joy_button_pressed(1, JOY_BUTTON_A), Input.is_joy_button_pressed(0, JOY_BUTTON_A)], [true, false])
	bridge._handle_execute_input_sequence([[{"action_name": POS_ACT, "start_ms": 0, "duration_ms": 10}]])
	await process_frame
	_check("interrupt re-zeroed BOTH devices' axes", [Input.get_joy_axis(0, JOY_AXIS_LEFT_X), Input.get_joy_axis(1, JOY_AXIS_LEFT_X)], [0.0, 0.0])
	_check("interrupt released device 1's button", Input.is_joy_button_pressed(1, JOY_BUTTON_A), false)
	await create_timer(0.06).timeout
	for i in 4:
		await process_frame

	# ── 6c. Abutting same-button entries: documented behavior is two distinct
	# entries (NOT cancelled like axes), so the button stays effectively held
	# across the boundary under polling. Pins the deliberate axis/button asymmetry.
	bridge._handle_execute_input_sequence([[
		{"joy_button": "y", "start_ms": 0, "duration_ms": 150},
		{"joy_button": "y", "start_ms": 150, "duration_ms": 150},
	]])
	var seg1 := false
	var seg2 := false
	var ab_start := Time.get_ticks_msec()
	var ab_guard := 0
	while bridge._sequence_running and ab_guard < 600:
		ab_guard += 1
		await process_frame
		var el := Time.get_ticks_msec() - ab_start
		if el > 40 and el < 130 and Input.is_joy_button_pressed(0, JOY_BUTTON_Y):
			seg1 = true
		if el > 170 and el < 280 and Input.is_joy_button_pressed(0, JOY_BUTTON_Y):
			seg2 = true
	for i in 3:
		await process_frame
	_check("abutting button held through segment 1", seg1, true)
	_check("abutting button held through segment 2 (boundary did not drop it)", seg2, true)
	_check("abutting button released after both segments", Input.is_joy_button_pressed(0, JOY_BUTTON_Y), false)

	# ── 7. The documented limitation: no virtual pad in get_connected_joypads ─
	_check("get_connected_joypads stays empty (pad DETECTION is not fakeable)",
		Input.get_connected_joypads().is_empty(), true)

	# ── 8. Compile errors and kind counting ──────────────────────────────────
	var bad_axis: Dictionary = bridge._compile_input_events([{"axis": "left_z", "value": 0.5}])
	_check("unknown axis name rejected", str(bad_axis.get("error", "")).begins_with("Unknown joypad axis"), true)
	var bad_button: Dictionary = bridge._compile_input_events([{"joy_button": "zz"}])
	_check("unknown button name rejected", str(bad_button.get("error", "")).begins_with("Unknown joypad button"), true)
	var bad_index: Dictionary = bridge._compile_input_events([{"joy_button": 99}])
	_check("out-of-range button index rejected", str(bad_index.get("error", "")).begins_with("Unknown joypad button"), true)
	var bad_action: Dictionary = bridge._compile_input_events([{"action_name": "mcp_probe_nonexistent"}])
	_check("unknown action rejected (unchanged contract)", str(bad_action.get("error", "")).begins_with("Unknown action"), true)
	var mixed: Dictionary = bridge._compile_input_events([
		{"action_name": POS_ACT, "duration_ms": 10},
		{"joy_button": "a", "duration_ms": 10},
		{"axis": "left_x", "value": 1.0, "duration_ms": 10},
	])
	_check("mixed timeline counts kinds for the skew echo",
		mixed["kinds"], {"action": 1, "joy_button": 1, "axis": 1, "key": 0, "look": 0})

	# ── 9. get_input_map axis/button display carries direction + name ─────────
	# (the agent lifts axis + signed value straight into an injection).
	var motion := InputEventJoypadMotion.new()
	motion.axis = JOY_AXIS_LEFT_X
	motion.axis_value = -1.0
	_check("axis binding stringifies with name and signed value",
		bridge._event_to_string(motion), "Joypad Axis 0 (left_x, value -1.0)")
	var jbtn := InputEventJoypadButton.new()
	jbtn.button_index = JOY_BUTTON_A
	_check("button binding stringifies with name",
		bridge._event_to_string(jbtn), "Joypad Button 0 (a)")

	root.remove_child(bridge)
	bridge.free()

	if InputMap.has_action(AXIS_ACT):
		InputMap.erase_action(AXIS_ACT)
	for a in [NEG_ACT, POS_ACT]:
		if InputMap.has_action(a):
			InputMap.erase_action(a)

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
