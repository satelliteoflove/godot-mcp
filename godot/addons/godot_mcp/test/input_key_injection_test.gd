extends SceneTree

## Headless pins for raw keyboard / modifier-combo injection (#290), driving the
## REAL MCPGameBridge sequence engine.
##
## WHAT IT PINS (engine ground truth from Godot 4.6 core/input/input.cpp):
##  - Input.parse_input_event(InputEventKey) updates the POLLED Input singletons
##    (is_key_pressed / is_physical_key_pressed) for any device with no physical
##    keyboard — the property that makes raw-key injection viable.
##  - A logical key sets both keycode and physical_keycode; physical:true sends a
##    physical-only event (keycode unset) for layout-independent testing — and a
##    keycode-bound action then does NOT match (the documented footgun).
##  - Modifier combos press each modifier as its own real key, so polled
##    is_key_pressed(KEY_CTRL) holds AND a bare-Ctrl-bound action fires (faithful
##    to a real keyboard); the base event also carries the modifier FLAGS so
##    InputMap chords and _input handlers match.
##  - The held-key registry is refcounted: overlapping entries that share a key
##    keep it held until the LAST release (no early release), and an interrupted
##    sequence / tree exit guarantee every held key is released.
##  - get_input_map key display round-trips through MCPKeyNames (parse . event_string).
##
## Step-window parity is by construction: game_time step compiles through the same
## _compile_input_events and injects through the same _inject_timeline_event as the
## sequence path white-boxed here. The step path's freeze/pause semantics make a
## bare-SceneTree drive hang-prone, so step key injection is covered by the shared
## code paths above, the server vitest, and live MCP validation, not re-driven here.
##
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_key_injection_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const KEY_ACT := "mcp_probe_key"          # bound to InputEventKey keycode J
const CTRL_S_ACT := "mcp_probe_ctrl_s"    # bound to keycode S + ctrl
const KEYCODE_ACT := "mcp_probe_keycode"  # bound to keycode M (logical)
const BARE_CTRL_ACT := "mcp_probe_bare_ctrl"  # bound to bare keycode CTRL
const PHYS_ACT := "mcp_probe_physical"    # bound to PHYSICAL keycode N (no logical keycode)

var _count := 0
var _failures := 0


class _Cap extends Node:
	## Captures InputEventKey delivery so _input/_unhandled_input reach is asserted.
	var keys: Array = []        # {keycode, physical, ctrl, shift, alt, meta, pressed}
	var unhandled := false
	func _ready() -> void:
		set_process_input(true)
		set_process_unhandled_input(true)
	func clear() -> void:
		keys.clear()
		unhandled = false
	func _input(event: InputEvent) -> void:
		if event is InputEventKey:
			var k := event as InputEventKey
			keys.append({"keycode": int(k.keycode), "physical": int(k.physical_keycode),
				"ctrl": k.ctrl_pressed, "shift": k.shift_pressed, "alt": k.alt_pressed,
				"meta": k.meta_pressed, "pressed": k.pressed})
	func _unhandled_input(event: InputEvent) -> void:
		if event is InputEventKey:
			unhandled = true
	func saw_pressed(keycode: int, ctrl: bool) -> bool:
		for e in keys:
			if int(e["keycode"]) == keycode and bool(e["pressed"]) and bool(e["ctrl"]) == ctrl:
				return true
		return false


func _initialize() -> void:
	_run()


func _register_key_action(name: String, keycode: Key, ctrl: bool = false) -> void:
	if InputMap.has_action(name):
		return
	InputMap.add_action(name)
	var bind := InputEventKey.new()
	bind.keycode = keycode
	bind.ctrl_pressed = ctrl
	InputMap.action_add_event(name, bind)


func _run() -> void:
	for i in 5:
		await process_frame

	_register_key_action(KEY_ACT, KEY_J)
	_register_key_action(CTRL_S_ACT, KEY_S, true)
	_register_key_action(KEYCODE_ACT, KEY_M)
	_register_key_action(BARE_CTRL_ACT, KEY_CTRL)
	# A PHYSICAL-keycode binding (no logical keycode) for the positive physical case.
	if not InputMap.has_action(PHYS_ACT):
		InputMap.add_action(PHYS_ACT)
		var pbind := InputEventKey.new()
		pbind.physical_keycode = KEY_N
		InputMap.action_add_event(PHYS_ACT, pbind)

	print("\n===================== KEY INJECTION TEST (#290) =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	var cap := _Cap.new()
	root.add_child(cap)
	for i in 3:
		await process_frame

	# ── 1. Polled is_key_pressed for a held key, released on interrupt ────────
	bridge._handle_execute_input_sequence([[{"key": "a", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("held {key:'a'} drives polled is_key_pressed(KEY_A)", Input.is_key_pressed(KEY_A), true)
	_check("logical key also sets physical (US-layout event)", Input.is_physical_key_pressed(KEY_A), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	_check("interrupting sequence released the held key", Input.is_key_pressed(KEY_A), false)

	# ── 2. physical:true sends a physical-only event ─────────────────────────
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "a", "physical": true, "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("physical:true drives is_physical_key_pressed", Input.is_physical_key_pressed(KEY_A), true)
	_check("physical:true leaves the LOGICAL keycode unset", Input.is_key_pressed(KEY_A), false)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	_check("physical hold released on interrupt", Input.is_physical_key_pressed(KEY_A), false)

	# ── 3. Modifier combo: each modifier pressed as a real key (polled) ──────
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "ctrl+s", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("combo holds the base key polled", Input.is_key_pressed(KEY_S), true)
	_check("combo holds the MODIFIER key polled (is_key_pressed(KEY_CTRL))", Input.is_key_pressed(KEY_CTRL), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	_check("combo base released after interrupt", Input.is_key_pressed(KEY_S), false)
	_check("combo modifier released after interrupt", Input.is_key_pressed(KEY_CTRL), false)
	# Case-insensitive parse equivalence (white-box).
	var lower: Dictionary = MCPKeyNames.parse("ctrl+s")
	var mixed_case: Dictionary = MCPKeyNames.parse("Ctrl+S")
	_check("key parse is case-insensitive", [int(lower["code"]), int(lower["mask"])], [int(mixed_case["code"]), int(mixed_case["mask"])])

	# ── 4. InputMap key bindings; modifier required for the chord ────────────
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "j", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("{key:'j'} fires the key-bound action", Input.is_action_pressed(KEY_ACT), true)
	bridge._handle_execute_input_sequence([[{"key": "s", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("plain {key:'s'} does NOT fire the Ctrl+S action (modifier required)", Input.is_action_pressed(CTRL_S_ACT), false)
	bridge._handle_execute_input_sequence([[{"key": "ctrl+s", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("{key:'ctrl+s'} fires the Ctrl+S action", Input.is_action_pressed(CTRL_S_ACT), true)

	# ── 5. Faithful edge: the combo also fires a bare-Ctrl-bound action ──────
	_check("EXPECTED: combo also presses a bare-Ctrl-bound action (real keyboard)", Input.is_action_pressed(BARE_CTRL_ACT), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame

	# ── 5b. A LONE modifier name is the modifier key itself ──────────────────
	# (a game binding bare Shift/Ctrl, like NEON RAMPAGE's dash = Shift). Caught
	# live: "shift" must not parse to a baseless modifier and reject as unknown.
	var bare: Dictionary = MCPKeyNames.parse("shift")
	_check("lone 'shift' parses to the Shift KEY (not a baseless modifier)", [int(bare["code"]), int(bare["mask"])], [int(KEY_SHIFT), 0])
	var bare_ambig: Dictionary = MCPKeyNames.parse("ctrl+shift")
	_check("baseless multi-modifier 'ctrl+shift' stays unknown", int(bare_ambig["code"]), int(KEY_NONE))
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "ctrl", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("{key:'ctrl'} drives polled is_key_pressed(KEY_CTRL)", Input.is_key_pressed(KEY_CTRL), true)
	_check("{key:'ctrl'} fires a bare-Ctrl-bound action", Input.is_action_pressed(BARE_CTRL_ACT), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame

	# ── 6. NEGATIVE physical: physical-only does not fire a keycode binding ──
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "m", "physical": true, "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("physical:true does NOT fire a keycode-bound action (documented footgun)", Input.is_action_pressed(KEYCODE_ACT), false)
	bridge._handle_execute_input_sequence([[{"key": "m", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("default (logical) DOES fire the same keycode-bound action", Input.is_action_pressed(KEYCODE_ACT), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	# POSITIVE physical: physical:true DOES fire a PHYSICAL-keycode binding (the
	# other half of the footgun — polled is_physical_key_pressed alone is not proof
	# that the InputMap physical-match path also fires).
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "n", "physical": true, "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("physical:true DOES fire a physical-keycode-bound action", Input.is_action_pressed(PHYS_ACT), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame

	# ── 7. _input / _unhandled_input delivery with modifier flags ────────────
	await _settle()
	cap.clear()
	bridge._handle_execute_input_sequence([[{"key": "ctrl+s", "start_ms": 0, "duration_ms": 100000}]])
	for i in 4:
		await process_frame
	_check("_input received the base key with the ctrl flag set", cap.saw_pressed(KEY_S, true), true)
	_check("_input received the modifier key (KEY_CTRL) as a real key", cap.saw_pressed(KEY_CTRL, false), true)
	_check("_unhandled_input also reached for injected keys", cap.unhandled, true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame

	# ── 8. Instant tap (duration 0 — the schema default) must not latch ──────
	await _settle()
	var tap: Dictionary = bridge._compile_input_events([{"key": "a", "start_ms": 0, "duration_ms": 0}])
	var tap_evts: Array = tap["events"]
	_check("instant-tap key press compiled before its release",
		[bool(tap_evts[0].get("is_press")), int(tap_evts[0]["time"]) < int(tap_evts[1]["time"])], [true, true])
	bridge._handle_execute_input_sequence([[{"key": "a", "start_ms": 0, "duration_ms": 0}]])
	for i in 6:
		await process_frame
	_check("instant-tap key is NOT latched after the sequence", Input.is_key_pressed(KEY_A), false)

	# ── 9. Refcount/overlap: a shared modifier is held until the LAST release ─
	await _settle()
	bridge._handle_execute_input_sequence([[
		{"key": "ctrl+s", "start_ms": 0, "duration_ms": 300},
		{"key": "ctrl+a", "start_ms": 100, "duration_ms": 300},
	]])
	# Timing-immune checks (a fixed wall-clock window could miss the boundary if no
	# frame lands in it): white-box the refcount reaching 2, and assert CTRL is held
	# on EVERY frame A is down — A outlives ctrl+s, so an early release of the shared
	# modifier shows up as "A down but CTRL up" on whatever frame it happens.
	var ctrl_key := "%d:%d" % [0, KEY_CTRL]
	var ctrl_count_max := 0
	var ctrl_dropped_while_a_held := false
	var saw_s := false
	var saw_a := false
	var guard := 0
	while bridge._sequence_running and guard < 800:
		guard += 1
		await process_frame
		var a_down := Input.is_key_pressed(KEY_A)
		if Input.is_key_pressed(KEY_S):
			saw_s = true
		if a_down:
			saw_a = true
		ctrl_count_max = maxi(ctrl_count_max, int(bridge._held_keys.get(ctrl_key, {}).get("count", 0)))
		if a_down and not Input.is_key_pressed(KEY_CTRL):
			ctrl_dropped_while_a_held = true
	for i in 4:
		await process_frame
	_check("overlap: base key S registered", saw_s, true)
	_check("overlap: base key A registered", saw_a, true)
	_check("overlap: CTRL refcount reached 2 (both combos held it; white-box, timing-immune)", ctrl_count_max, 2)
	_check("overlap: shared modifier never dropped while A was still held (no early release)", ctrl_dropped_while_a_held, false)
	_check("overlap: modifier released after the last entry", Input.is_key_pressed(KEY_CTRL), false)

	# ── 9b. Independent distinct keys (WASD-style): held and released separately ─
	await _settle()
	bridge._handle_execute_input_sequence([[
		{"key": "a", "start_ms": 0, "duration_ms": 130},
		{"key": "b", "start_ms": 0, "duration_ms": 100000},
	]])
	var both_down := false
	var a_off_b_on := false
	var ind_guard := 0
	while bridge._sequence_running and ind_guard < 800:
		ind_guard += 1
		await process_frame
		var a := Input.is_key_pressed(KEY_A)
		var b := Input.is_key_pressed(KEY_B)
		if a and b:
			both_down = true
		if (not a) and b:
			a_off_b_on = true
	_check("multi-key: distinct keys A and B held simultaneously", both_down, true)
	_check("multi-key: A released independently while B stayed held", a_off_b_on, true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	_check("multi-key: B released by the interrupting sequence", Input.is_key_pressed(KEY_B), false)

	# ── 9c. Shared base key, DIFFERENT modifiers (the registry keys on code only) ─
	# Documented edge (SF1): two combos sharing a base collapse to one refcounted
	# entry, so the base event's modifier FLAGS reflect the first combo — but the
	# POLLED key state stays correct (no stuck base key; both modifier keys held).
	await _settle()
	bridge._handle_execute_input_sequence([[
		{"key": "ctrl+s", "start_ms": 0, "duration_ms": 100000},
		{"key": "shift+s", "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	await process_frame
	_check("shared-base: S held once for both combos", Input.is_key_pressed(KEY_S), true)
	_check("shared-base: both distinct modifier keys held", [Input.is_key_pressed(KEY_CTRL), Input.is_key_pressed(KEY_SHIFT)], [true, true])
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame
	_check("shared-base: S, CTRL, SHIFT all released after interrupt (no stuck base)",
		[Input.is_key_pressed(KEY_S), Input.is_key_pressed(KEY_CTRL), Input.is_key_pressed(KEY_SHIFT)], [false, false, false])

	# ── 10. Abutting combos sharing a modifier: final state is clean ─────────
	# (The one-frame just_released edge on the shared modifier at the boundary is
	# accepted, matching the button double-tap-edge asymmetry — not asserted.)
	await _settle()
	bridge._handle_execute_input_sequence([[
		{"key": "ctrl+s", "start_ms": 0, "duration_ms": 120},
		{"key": "ctrl+a", "start_ms": 120, "duration_ms": 120},
	]])
	var ab_guard := 0
	while bridge._sequence_running and ab_guard < 800:
		ab_guard += 1
		await process_frame
	for i in 4:
		await process_frame
	_check("abutting combos: all keys clean after both segments",
		[Input.is_key_pressed(KEY_CTRL), Input.is_key_pressed(KEY_S), Input.is_key_pressed(KEY_A)], [false, false, false])

	# ── 11. Guaranteed release on tree exit ──────────────────────────────────
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": "ctrl+shift+f1", "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("tree-exit case armed (modifier held)", Input.is_key_pressed(KEY_CTRL), true)
	root.remove_child(bridge)
	_check("tree exit released the held base key", Input.is_key_pressed(KEY_F1), false)
	_check("tree exit released the held modifier (ctrl)", Input.is_key_pressed(KEY_CTRL), false)
	_check("tree exit released the held modifier (shift)", Input.is_key_pressed(KEY_SHIFT), false)
	root.add_child(bridge)
	await process_frame

	# ── 12. Raw int keycode + modifier-mask split ────────────────────────────
	await _settle()
	bridge._handle_execute_input_sequence([[{"key": KEY_B, "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("raw int keycode drives is_key_pressed", Input.is_key_pressed(KEY_B), true)
	bridge._handle_execute_input_sequence([[{"key": KEY_D | KEY_MASK_CTRL, "start_ms": 0, "duration_ms": 100000}]])
	await process_frame
	await process_frame
	_check("raw int with mask presses the base", Input.is_key_pressed(KEY_D), true)
	_check("raw int with mask presses the modifier too", Input.is_key_pressed(KEY_CTRL), true)
	bridge._handle_execute_input_sequence([[{"key": "z", "start_ms": 0, "duration_ms": 10}]])
	for i in 4:
		await process_frame

	# ── 13. Compile errors for unknown keys ──────────────────────────────────
	var bad_key: Dictionary = bridge._compile_input_events([{"key": "notakey"}])
	_check("unknown key name rejected", str(bad_key.get("error", "")).begins_with("Unknown key"), true)
	var bad_combo: Dictionary = bridge._compile_input_events([{"key": "ctrl+notakey"}])
	_check("unknown key in a combo rejected", str(bad_combo.get("error", "")).begins_with("Unknown key"), true)

	# ── 14. input_kinds carries a key count; mixed kinds counted ─────────────
	var mixed: Dictionary = bridge._compile_input_events([
		{"action_name": KEY_ACT, "duration_ms": 10},
		{"joy_button": "a", "duration_ms": 10},
		{"axis": "left_x", "value": 1.0, "duration_ms": 10},
		{"key": "ctrl+s", "duration_ms": 10},
	])
	_check("mixed timeline counts the key kind for the skew echo",
		mixed["kinds"], {"action": 1, "joy_button": 1, "axis": 1, "key": 1, "look": 0})

	# ── 15. event_string format + round-trip (get_input_map display) ─────────
	var ev := InputEventKey.new()
	ev.keycode = KEY_S
	ev.ctrl_pressed = true
	_check("logical combo stringifies canonically", MCPKeyNames.event_string(ev), "Ctrl+S")
	var rt: Dictionary = MCPKeyNames.parse(MCPKeyNames.event_string(ev))
	_check("logical combo round-trips through parse", [int(rt["code"]), int(rt["mask"])], [int(KEY_S), int(KEY_MASK_CTRL)])
	var mev := InputEventKey.new()
	mev.keycode = KEY_Q
	mev.meta_pressed = true
	_check("meta combo stringifies (find_keycode_from_string can't, our parser can)", MCPKeyNames.event_string(mev), "Meta+Q")
	var mrt: Dictionary = MCPKeyNames.parse(MCPKeyNames.event_string(mev))
	_check("meta combo round-trips", [int(mrt["code"]), int(mrt["mask"])], [int(KEY_Q), int(KEY_MASK_META)])
	var pev := InputEventKey.new()
	pev.physical_keycode = KEY_W
	_check("physical-only binding shows the (physical) marker", MCPKeyNames.event_string(pev), "W (physical)")
	# Integration: the bridge's get_input_map display routes through the same helper.
	_check("bridge._event_to_string matches MCPKeyNames.event_string", bridge._event_to_string(ev), "Ctrl+S")

	root.remove_child(bridge)
	bridge.free()
	cap.free()

	for a in [KEY_ACT, CTRL_S_ACT, KEYCODE_ACT, BARE_CTRL_ACT]:
		if InputMap.has_action(a):
			InputMap.erase_action(a)

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _settle() -> void:
	# A short gap + a few frames between holds, so a prior interrupt's release has
	# fully flushed before the next assertion (mirrors the joypad test).
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
