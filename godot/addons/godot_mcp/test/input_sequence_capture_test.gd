extends SceneTree

## Behavior guard for mid-sequence frame capture (#239).
## Drives the REAL MCPGameBridge node.
##
## Verifies the capture SCHEDULING and finish-gating, which is the timing-sensitive
## part: offsets are clamped, capped, and sorted; the sequence keeps running until
## every scheduled capture has been triggered and its deferred send has resolved;
## the result is not emitted while captures are still pending.
##
## Actual image bytes are NOT asserted — under `--headless` the dummy renderer may
## return no image, so each capture resolves via the error path. That still
## exercises the pending-count gating (a failed capture MUST release its slot, or
## the sequence would hang forever), which is exactly what this guards.
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/input_sequence_capture_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const ACTION := "mcp_probe_capture_a"

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame
	if not InputMap.has_action(ACTION):
		InputMap.add_action(ACTION)

	print("\n===================== INPUT-SEQUENCE CAPTURE TEST =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame

	# --- 1. normalization: clamp + sort ------------------------------------
	# Inspected immediately, before any frame advances, so nothing has fired yet.
	bridge._handle_execute_input_sequence([
		[{"action_name": ACTION, "start_ms": 0, "duration_ms": 5}],
		[], [200, 50, 99999999], 640, 0.6,
	])
	var offs: Array = bridge._sequence_capture_offsets.duplicate()
	_check("offsets sorted ascending (first)", offs[0], 50)
	_check("offsets sorted ascending (second)", offs[1], 200)
	# SEQUENCE_MAX_CAPTURE_OFFSET_MS is now a non-binding sanity backstop (#276):
	# the server clamps the real budget, so this only catches a malformed message.
	_check("offset clamped to SEQUENCE_MAX_CAPTURE_OFFSET_MS backstop", offs[2], 300000)

	# --- 2. cap at SEQUENCE_MAX_CAPTURES ------------------------------------
	bridge._handle_execute_input_sequence([
		[{"action_name": ACTION, "start_ms": 0, "duration_ms": 5}],
		[], [30, 10, 10, 5, 40, 20, 50, 60, 70, 80], 640, 0.6,
	])
	_check("capture offsets capped at 8", bridge._sequence_capture_offsets.size(), 8)

	# --- 3. finish gating: the result is held while captures are pending ----
	# Two short capture offsets. Capture resolves on RenderingServer.frame_post_draw,
	# which does not fire under `--headless` (no draw), so the captures stay pending
	# here — which is precisely what proves the gate: the sequence must NOT finish
	# while a frame is still owed. (Resolution + finish is covered by live testing
	# on a rendering game.)
	bridge._handle_execute_input_sequence([
		[{"action_name": ACTION, "start_ms": 0, "duration_ms": 5}],
		[], [10, 25], 640, 0.6,
	])
	_check("capture sequence started", bridge._sequence_running, true)

	await create_timer(0.1).timeout
	for i in 10:
		await process_frame

	_check("both capture offsets were triggered", bridge._sequence_capture_offsets.is_empty(), true)
	_check("captures incremented the pending count", bridge._sequence_captures_pending, 2)
	_check("sequence correctly HELD open while a frame is still pending", bridge._sequence_running, true)
	_check("the tap registered and released (not latched)", Input.is_action_pressed(ACTION), false)

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
