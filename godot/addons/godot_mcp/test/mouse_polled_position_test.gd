extends SceneTree

## Polled-position regression guard for injected mouse input (godot-mcp #228).
##
## THE KEYSTONE FACT, and the one most likely to be mis-assumed: whether
## Input.parse_input_event() drives the POLLED Viewport.get_mouse_position()
## depends on the DisplayServer, and the two answers are OPPOSITE:
##
##   - headless: injection updates the polled value (no OS cursor exists, so the
##     event-updated cache is all there is). This is why the original pointer
##     probe passed 10/10 headless.
##   - real window (Windows/X11/etc.): the ROOT window viewport's
##     get_mouse_position() live-reflects the PHYSICAL OS cursor; injection does
##     NOT move it. The EVENT PATH (event.position in _input/_unhandled_input) is
##     still faithful. So games that POLL get_mouse_position() (hover previews,
##     poll-based hold-to-paint) follow the real mouse and are NOT drivable by
##     injection — drive them through discrete event-path clicks instead, and
##     never assume the visual cursor reflects the injection. (warp_mouse would
##     move the polled value but hijacks the developer's real cursor — refused.)
##
## This test asserts BOTH halves so either one regressing fails loudly. The
## windowed half assumes the physical mouse is HELD STILL during the run (an
## automated invocation): it asserts injection leaves the polled value unchanged.
##
## Not wired into CI (CI has no Godot). Run on demand, BOTH ways:
##   & "<godot.exe>"            --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/mouse_polled_position_test.gd"   # windowed half
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/mouse_polled_position_test.gd"   # headless half
## Exit code 0 = all checks passed, 1 = at least one failed.

var _count := 0
var _failures := 0
var _evt_pos := Vector2(-1, -1)   # last position seen on the EVENT path


class EvtSpy extends Node:
	var owner_test
	func _unhandled_input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			owner_test._evt_pos = (event as InputEventMouseMotion).position


func _initialize() -> void:
	_run()


func _approx(a: Vector2, b: Vector2) -> bool:
	return a.distance_to(b) < 2.0


func _inject(p: Vector2) -> void:
	var mm := InputEventMouseMotion.new()
	mm.position = p
	mm.global_position = p
	Input.parse_input_event(mm)
	Input.flush_buffered_events()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== MOUSE POLLED-POSITION TEST =====================\n")
	var dsname := DisplayServer.get_name()
	print("DisplayServer name: %s" % dsname)
	print("NOTE: windowed run assumes the physical mouse is NOT moved during it.")

	var spy := EvtSpy.new()
	spy.owner_test = self
	root.add_child(spy)
	for i in 3:
		await process_frame

	var r_before := root.get_mouse_position()
	_data("get_mouse_position() before any injection", str(r_before))

	# Inject, then read the polled value with ZERO awaits (no frame boundary for an
	# OS event to intervene) — the tightest possible test of the cache.
	var target := Vector2(320, 180)
	_inject(target)
	var r_immediate := root.get_mouse_position()
	_data("injected position", str(target))
	_data("event-path position (authoritative)", str(_evt_pos))
	_data("get_mouse_position() immediately after flush", str(r_immediate))

	# The event path is faithful on EVERY platform — this is the proven invariant.
	_check("event path carries the injected position", _approx(_evt_pos, target), true)

	if dsname == "headless":
		_check("headless: injected motion DRIVES polled get_mouse_position()",
			_approx(r_immediate, target), true)
	else:
		# Real DisplayServer: polled value reflects the physical cursor, unchanged
		# by injection, and is NOT the injected target.
		_check("windowed: injection does NOT change polled get_mouse_position()",
			_approx(r_immediate, r_before), true)
		_check("windowed: polled get_mouse_position() is NOT the injected target",
			_approx(r_immediate, target), false)

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


func _data(label: String, value: Variant) -> void:
	print("   . %s = %s" % [label, str(value)])
