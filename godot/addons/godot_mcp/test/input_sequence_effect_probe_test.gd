extends SceneTree

## Behavior guard for the input-sequence effect signal (#240).
## Drives the REAL MCPGameBridge node.
##
## THE GAP: execute_input_sequence reported only "N actions executed" — pure event
## dispatch, no indication whether the inputs changed the world. A 12s sequence run
## while the player was dead returned "success" identically to one that worked.
##
## THE SIGNAL: the bridge now attaches an optional effect probe — GDScript
## expressions evaluated before the first input and again after the last — plus
## always-on context (scene / pause / freeze / game-vs-wall time). This test covers
## the two pieces the feature rests on:
##  1. _compute_report_deltas() — the pure before/after diff behind the verdict.
##  2. The drain/settle path — a report-ful sequence defers its result a couple
##     frames so the probe's `after` reflects the final input, then emits + resets.
##
## EngineDebugger.send_message is inert without a debug session (as in the
## stuck-held test), so the end-to-end check inspects the bridge's own state rather
## than the sent dict. Runs HEADLESS or windowed.
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_sequence_effect_probe_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const ACTION := "mcp_probe_effect_a"

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame
	if not InputMap.has_action(ACTION):
		InputMap.add_action(ACTION)

	print("\n===================== INPUT-SEQUENCE EFFECT-PROBE TEST =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame

	# --- 1. _compute_report_deltas (pure) -----------------------------------
	var d1 := bridge._compute_report_deltas({"a": 1, "b": "x"}, {"a": 1, "b": "x"})
	_check("identical before/after -> any_changed false", d1["any_changed"], false)
	_check("unchanged field flagged not-changed", d1["report"]["a"]["changed"], false)

	var d2 := bridge._compute_report_deltas({"a": 1}, {"a": 2})
	_check("differing value -> changed", d2["report"]["a"]["changed"], true)
	_check("any differing field -> any_changed true", d2["any_changed"], true)
	_check("before value preserved", d2["report"]["a"]["before"], 1)
	_check("after value preserved", d2["report"]["a"]["after"], 2)

	# An expression that started erroring drops out of `after`; a missing reading
	# reads as null and counts as changed (the world did move).
	var d3 := bridge._compute_report_deltas({"a": 5}, {})
	_check("missing after reads as null", d3["report"]["a"]["after"], null)
	_check("missing after counts as changed", d3["report"]["a"]["changed"], true)

	# --- 2. drain/settle + clean emit on a report-ful sequence --------------
	# `1 + 1` evaluates in the predicate context (tree/root always present), so the
	# probe path is exercised with no game-specific autoload.
	bridge._handle_execute_input_sequence([
		[{"action_name": ACTION, "start_ms": 0, "duration_ms": 10}],
		["1 + 1"],
	])
	_check("report-ful sequence started", bridge._sequence_running, true)
	_check("baseline captured before any input", bridge._sequence_report_before.has("1 + 1"), true)

	await create_timer(0.05).timeout
	for i in 6:
		await process_frame
	_check("sequence finished (running cleared)", bridge._sequence_running, false)
	_check("drain flag cleared", bridge._sequence_draining, false)
	_check("probe state reset after emit", bridge._sequence_report.is_empty(), true)
	_check("the tap registered and released (not latched)", Input.is_action_pressed(ACTION), false)

	# --- 3. a bad report expression rejects without starting a sequence -----
	bridge._handle_execute_input_sequence([
		[{"action_name": ACTION, "start_ms": 0, "duration_ms": 10}],
		["bogus_identifier_xyz + 1"],
	])
	_check("invalid report expression does NOT start a sequence", bridge._sequence_running, false)

	root.remove_child(bridge)
	bridge.free()
	if InputMap.has_action(ACTION):
		InputMap.erase_action(ACTION)

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
