extends SceneTree

## Regression guard for a stuck-held bug in the execute_input_sequence engine.
## Drives the REAL MCPGameBridge node.
##
## THE BUG: MCPGameBridge._handle_execute_input_sequence() begins each call with
## `_sequence_events.clear()`. If a prior sequence is still mid-flight (e.g. the
## editor side hit its INPUT_TIMEOUT and the agent retried, or a second call
## overlapped), any already-fired press whose paired RELEASE is still queued has
## that release dropped by the clear — latching the action "pressed" in the Input
## singleton with nothing left to release it, so it never lifts until restart.
##
## THE FIX: track actions whose press has fired in `_held_actions` and release
## them before clearing / on tree exit, so a clear can never strand a release.
## This test asserts the FIXED invariant: starting a new sequence while one is
## mid-flight must NOT leave the earlier action latched.
##
## Pre-fix this test FAILS check "A not latched after overlapping start"; post-fix
## it PASSES. Runs HEADLESS or windowed (Input action singleton is drivable on
## both). The bridge's _ready() early-returns without a debugger session, which is
## fine — the sequence engine and its EngineDebugger.send_message replies are
## inert/no-ops here; only the _process drain + held tracking are under test.
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_sequence_stuck_held_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const ACTION_A := "mcp_probe_seq_a"
const ACTION_B := "mcp_probe_seq_b"

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame
	for a in [ACTION_A, ACTION_B]:
		if not InputMap.has_action(a):
			InputMap.add_action(a)

	print("\n===================== INPUT-SEQUENCE STUCK-HELD TEST =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame

	# First sequence: a LONG hold of A (release scheduled far in the future).
	bridge._handle_execute_input_sequence([[
		{"action_name": ACTION_A, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame  # one frame: press at t=0 fires, release at t=100000 stays queued
	_check("A pressed after first sequence starts its hold", Input.is_action_pressed(ACTION_A), true)

	# Second sequence STARTS while A's hold is still mid-flight. The shipped code
	# clears the queue here, dropping A's pending release. The fix releases A first.
	bridge._handle_execute_input_sequence([[
		{"action_name": ACTION_B, "start_ms": 0, "duration_ms": 10},
	]])
	await process_frame
	_check("A NOT latched after an overlapping sequence start (the bug guard)",
		Input.is_action_pressed(ACTION_A), false)

	# And the second sequence itself should run and release B cleanly.
	await create_timer(0.06).timeout
	for i in 4:
		await process_frame
	_check("B released after its short hold completes", Input.is_action_pressed(ACTION_B), false)

	# Tree-exit must not strand a held action either: start a hold, then remove.
	bridge._handle_execute_input_sequence([[
		{"action_name": ACTION_A, "start_ms": 0, "duration_ms": 100000},
	]])
	await process_frame
	_check("A pressed again for the exit-tree case", Input.is_action_pressed(ACTION_A), true)
	root.remove_child(bridge)
	_check("A released when the bridge leaves the tree", Input.is_action_pressed(ACTION_A), false)
	bridge.free()

	for a in [ACTION_A, ACTION_B]:
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
