extends SceneTree

## Tier-2 probe (godot-mcp #228): is get_final_transform() a COMPLETE description
## of the window<->canvas mapping for injected mouse input, across every stretch
## configuration — not just the aspect=IGNORE pure-scale case the existing
## mouse_dpi_scale_test proved?
##
## WHY IT MATTERS. The bridge targets a CANVAS pixel (e.g. Camera.unproject_position
## of a world cell, or a Control's global rect centre) and must inject a WINDOW-space
## position so the event LANDS on that pixel. The proven recipe is: inject
## get_final_transform() * C_canvas. mouse_dpi_scale_test verified that under
## CANVAS_ITEMS + ASPECT_IGNORE (pure scale, ZERO offset). The untested configs each
## add something that case lacks:
##   - aspect=KEEP -> a LETTERBOX TRANSLATION OFFSET (non-zero transform origin)
##   - content_scale_factor != 1 -> an extra multiplier
##   - stretch mode=VIEWPORT -> a different input mapping path
## If get_final_transform() fails to capture any of these, the forward-transform
## SILENTLY misses and every click lands on the wrong cell. This probe tests the
## real bridge op as a ROUND-TRIP INVARIANT across a config matrix:
##   pick C_canvas -> inject get_final_transform()*C -> assert event arrives at C.
## Two canvas points per config separate a scale error from an offset error; each
## config also asserts a precondition (it actually created the transform feature it
## claims to test, so no config passes vacuously). A wait-for-stable on the
## transform kills the cold-start settle flake mouse_dpi_scale_test exhibited.
##
## WINDOWED — letterbox/viewport need a real window. Headless runs the scale-only
## subset (the rest are skipped + reported).
##   & "<godot.exe>" --path "<city-builder>" \
##       --script "res://addons/godot_mcp/test/mouse_transform_completeness_test.gd"
## Exit 0 = all checks passed, 1 = at least one failed.

var _count := 0
var _failures := 0


class Probe extends Node:
	var last_position := Vector2(-9999, -9999)
	func _unhandled_input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			last_position = (event as InputEventMouseMotion).position


var _probe: Probe


func _initialize() -> void:
	_run()


func _approx(a: Vector2, b: Vector2, eps := 2.5) -> bool:
	# canvas-space tolerance; a sub-1x inverse magnifies window jitter, so allow a
	# little proportional slack.
	return a.distance_to(b) <= maxf(eps, b.length() * 0.002)


func _inject(pos: Vector2) -> void:
	var mm := InputEventMouseMotion.new()
	mm.position = pos
	mm.global_position = pos
	Input.parse_input_event(mm)
	Input.flush_buffered_events()


# Poll get_final_transform() until it stops changing (the settle the dpi test
# lacked), or a frame budget elapses.
func _settle_transform() -> Transform2D:
	var prev := root.get_final_transform()
	for i in 60:
		await process_frame
		var cur := root.get_final_transform()
		if cur.is_equal_approx(prev):
			return cur
		prev = cur
	return prev


func _reset_to_identity() -> void:
	root.content_scale_mode = Window.CONTENT_SCALE_MODE_DISABLED
	root.content_scale_aspect = Window.CONTENT_SCALE_ASPECT_IGNORE
	root.content_scale_factor = 1.0
	root.content_scale_size = Vector2i(0, 0)


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n================= TRANSFORM COMPLETENESS PROBE =================\n")
	var ds := DisplayServer.get_name()
	print("DisplayServer: %s" % ds)
	var windowed := ds != "headless"
	print("OS DPI diagnostics: screen_get_scale=%s  screen_dpi=%d" % [
		str(DisplayServer.screen_get_scale()), DisplayServer.screen_get_dpi()])
	print("(injected position is WINDOW-client space, so OS display scaling — which maps")
	print(" window px -> physical px — does NOT enter the position calculation.)\n")

	_probe = Probe.new()
	root.add_child(_probe)

	# name, mode, aspect, size, factor, win, needs_window, precondition tag
	var configs := [
		{"name": "identity (DISABLED)", "mode": Window.CONTENT_SCALE_MODE_DISABLED,
			"aspect": Window.CONTENT_SCALE_ASPECT_IGNORE, "size": Vector2i(0, 0),
			"factor": 1.0, "win": Vector2i(1280, 720), "needs_window": false, "pre": "identity"},
		{"name": "canvas_items IGNORE 2x", "mode": Window.CONTENT_SCALE_MODE_CANVAS_ITEMS,
			"aspect": Window.CONTENT_SCALE_ASPECT_IGNORE, "size": Vector2i(640, 360),
			"factor": 1.0, "win": Vector2i(1280, 720), "needs_window": false, "pre": "scale"},
		{"name": "canvas_items KEEP letterbox", "mode": Window.CONTENT_SCALE_MODE_CANVAS_ITEMS,
			"aspect": Window.CONTENT_SCALE_ASPECT_KEEP, "size": Vector2i(640, 360),
			"factor": 1.0, "win": Vector2i(1280, 800), "needs_window": true, "pre": "offset"},
		{"name": "canvas_items factor 1.5", "mode": Window.CONTENT_SCALE_MODE_CANVAS_ITEMS,
			"aspect": Window.CONTENT_SCALE_ASPECT_IGNORE, "size": Vector2i(640, 360),
			"factor": 1.5, "win": Vector2i(1280, 720), "needs_window": true, "pre": "scale"},
		{"name": "VIEWPORT mode 2x", "mode": Window.CONTENT_SCALE_MODE_VIEWPORT,
			"aspect": Window.CONTENT_SCALE_ASPECT_IGNORE, "size": Vector2i(640, 360),
			"factor": 1.0, "win": Vector2i(1280, 720), "needs_window": true, "pre": "scale"},
	]

	for cfg in configs:
		await _run_config(cfg, windowed)

	_reset_to_identity()

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _run_config(cfg: Dictionary, windowed: bool) -> void:
	print("\n--- config: %s ---" % cfg["name"])
	if cfg["needs_window"] and not windowed:
		print("   . skipped (needs a real window; headless can't letterbox/viewport)")
		return

	_reset_to_identity()
	for i in 4:
		await process_frame

	if windowed:
		root.size = cfg["win"]
	root.content_scale_mode = cfg["mode"]
	root.content_scale_aspect = cfg["aspect"]
	root.content_scale_size = cfg["size"]
	root.content_scale_factor = cfg["factor"]

	var fxform := await _settle_transform()
	var inv := fxform.affine_inverse()
	_data("get_final_transform()", str(fxform))
	_data("scale / origin", "%s / %s" % [str(fxform.get_scale()), str(fxform.get_origin())])

	# Precondition: this config actually built the feature it claims to test.
	match cfg["pre"]:
		"identity":
			_check("[%s] transform is ~identity" % cfg["name"],
				fxform.is_equal_approx(Transform2D.IDENTITY), true)
		"scale":
			_check("[%s] a non-identity SCALE is in effect" % cfg["name"],
				absf(fxform.get_scale().x - 1.0) > 0.05, true)
		"offset":
			# The whole point of the letterbox case: a NON-ZERO translation offset.
			_check("[%s] a non-zero letterbox OFFSET is in effect" % cfg["name"],
				fxform.get_origin().length() > 1.0, true)

	# The canvas extent we can safely aim inside (the logical/visible canvas).
	var extent := Vector2(cfg["size"]) if cfg["size"] != Vector2i(0, 0) else Vector2(cfg["win"])
	# Two interior canvas targets: separates a scale error from an offset error.
	var targets := [extent * 0.4, extent * 0.6]
	for c in targets:
		await _assert_roundtrip(cfg["name"], fxform, inv, c)


# THE bridge invariant: to hit canvas target C, inject get_final_transform()*C and
# the event must arrive at C.
func _assert_roundtrip(name: String, fxform: Transform2D, inv: Transform2D, c_canvas: Vector2) -> void:
	var inject_win := fxform * c_canvas
	_probe.last_position = Vector2(-9999, -9999)
	_inject(inject_win)
	await process_frame
	var got := _probe.last_position
	_data("canvas target %s -> inject window %s -> event %s" % [
		str(c_canvas), str(inject_win), str(got)], "")
	_check("[%s] forward-transformed click LANDS on canvas target %s" % [name, str(c_canvas)],
		_approx(got, c_canvas), true)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])


func _data(label: String, value: Variant) -> void:
	if str(value) == "":
		print("   . %s" % label)
	else:
		print("   . %s = %s" % [label, str(value)])
