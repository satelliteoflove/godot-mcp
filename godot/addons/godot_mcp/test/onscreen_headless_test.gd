extends SceneTree

## Headless test for on-screen / in-frustum detection (addons/godot_mcp/game_bridge/onscreen.gd).
##
## Validates the `onscreen` flag geometry the digest reports, across the three
## camera setups called out in the perception spike (godot-mcp #200):
##   - 3D camera: positions inside / behind / beside / beyond the frustum.
##   - 2D camera with offset + zoom: the visible *world* rect (not the screen
##     rect), including the boundary (min edge inclusive, max edge exclusive)
##     and the regression where the old screen-rect test inverted the result.
##   - SubViewport: a node is judged against ITS OWN viewport's camera, so the
##     same world coordinate is on-screen in one SubViewport and off in another.
##
## This is not wired into CI (CI has no Godot). Run it on demand against any
## project that has the addon copied in (e.g. the city-builder dev project):
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/onscreen_headless_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const Onscreen := preload("res://addons/godot_mcp/game_bridge/onscreen.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	# Run as a coroutine so we can await a few frames for cameras to apply their
	# transforms before sampling.
	_run()


func _run() -> void:
	# Let autoloads settle and cameras register / apply canvas transforms.
	for i in 3:
		await process_frame

	# The 3D test is synchronous; the 2D tests await a frame for the camera to
	# apply its canvas transform, so each must be awaited to run to completion
	# before the next starts and before we report.
	_test_3d_frustum()
	await _test_2d_offset_and_boundary()
	await _test_2d_zoom()
	await _test_subviewport_isolation()
	await _test_notifier_path()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


# ── Tiny TAP-ish harness ──────────────────────────────────────────────────────

func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])


func _check_rect(label: String, got: Rect2, expected: Rect2) -> void:
	_count += 1
	if got.position.is_equal_approx(expected.position) and got.size.is_equal_approx(expected.size):
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])


# ── 3D frustum ────────────────────────────────────────────────────────────────

func _test_3d_frustum() -> void:
	# Camera at origin looking down -Z (identity transform), default perspective.
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.current = true

	var inside := _node3d_at(Vector3(0, 0, -10))
	var behind := _node3d_at(Vector3(0, 0, 10))
	var beside := _node3d_at(Vector3(1000, 0, -10))
	var beyond_far := _node3d_at(Vector3(0, 0, -5000)) # past the 4000 far plane

	_check("3D: in front is on-screen", Onscreen.compute(inside), true)
	_check("3D: behind camera is off-screen", Onscreen.compute(behind), false)
	_check("3D: far to the side is off-screen", Onscreen.compute(beside), false)
	_check("3D: beyond far plane is off-screen", Onscreen.compute(beyond_far), false)


# ── 2D offset + boundary (the core regression) ────────────────────────────────

func _test_2d_offset_and_boundary() -> void:
	# 200x200 SubViewport, camera centered on world (1000, 1000), no zoom.
	# Visible world rect is therefore Rect2(900, 900, 200, 200).
	var sv := _make_subviewport(Vector2i(200, 200))
	_make_camera2d(sv, Vector2(1000, 1000), Vector2.ONE)
	for i in 2:
		await process_frame

	_check_rect("2D: visible world rect tracks camera offset",
		Onscreen.visible_world_rect_2d(sv), Rect2(900, 900, 200, 200))

	var center := _node2d_at(sv, Vector2(1000, 1000))
	var origin := _node2d_at(sv, Vector2(0, 0))
	var min_edge := _node2d_at(sv, Vector2(900, 900))
	var max_edge := _node2d_at(sv, Vector2(1100, 1100))

	# Under the camera offset these are the right answers. The old code tested the
	# world position against the SCREEN rect Rect2(0,0,200,200), which inverted
	# them: it reported the centered node off-screen and the origin node on.
	_check("2D: node at camera center is on-screen", Onscreen.compute(center), true)
	_check("2D: distant node (world origin) is off-screen", Onscreen.compute(origin), false)
	_check("2D: min-edge corner is on-screen (inclusive)", Onscreen.compute(min_edge), true)
	_check("2D: max-edge corner is off-screen (exclusive)", Onscreen.compute(max_edge), false)


# ── 2D zoom ───────────────────────────────────────────────────────────────────

func _test_2d_zoom() -> void:
	# Zoom (2,2) halves the visible world extent: Rect2(950, 950, 100, 100).
	var sv := _make_subviewport(Vector2i(200, 200))
	_make_camera2d(sv, Vector2(1000, 1000), Vector2(2, 2))
	for i in 2:
		await process_frame

	_check_rect("2D zoom: visible world rect shrinks with zoom",
		Onscreen.visible_world_rect_2d(sv), Rect2(950, 950, 100, 100))

	var inside := _node2d_at(sv, Vector2(960, 960))
	var outside := _node2d_at(sv, Vector2(940, 940)) # inside the old (zoom-ignoring) rect, outside this one
	_check("2D zoom: node inside zoomed rect is on-screen", Onscreen.compute(inside), true)
	_check("2D zoom: node outside zoomed rect is off-screen", Onscreen.compute(outside), false)


# ── SubViewport isolation ─────────────────────────────────────────────────────

func _test_subviewport_isolation() -> void:
	# Two SubViewports with cameras centered on different world points. A node at
	# world (1000,1000) is on-screen only in the viewport whose camera is there —
	# proving the camera is resolved per-node from the node's own viewport.
	var sv_here := _make_subviewport(Vector2i(200, 200))
	_make_camera2d(sv_here, Vector2(1000, 1000), Vector2.ONE)
	var sv_far := _make_subviewport(Vector2i(200, 200))
	_make_camera2d(sv_far, Vector2(5000, 5000), Vector2.ONE)
	for i in 2:
		await process_frame

	var here := _node2d_at(sv_here, Vector2(1000, 1000))
	var far := _node2d_at(sv_far, Vector2(1000, 1000))
	_check("SubViewport: on-screen under the camera that frames it", Onscreen.compute(here), true)
	_check("SubViewport: same world coord off-screen under a different viewport's camera",
		Onscreen.compute(far), false)


# ── VisibleOnScreenNotifier2D path ────────────────────────────────────────────

func _test_notifier_path() -> void:
	# When the node is a VisibleOnScreenNotifier2D we defer to is_on_screen().
	# Headless has no real rendering-server visibility, so we assert only that the
	# path is taken and returns a bool (never null), not a specific value.
	var sv := _make_subviewport(Vector2i(200, 200))
	_make_camera2d(sv, Vector2(0, 0), Vector2.ONE)
	var notifier := VisibleOnScreenNotifier2D.new()
	sv.add_child(notifier)
	notifier.global_position = Vector2.ZERO
	for i in 2:
		await process_frame

	_check("Notifier: compute() returns a bool via is_on_screen()",
		typeof(Onscreen.compute(notifier)), TYPE_BOOL)


# ── Builders ──────────────────────────────────────────────────────────────────

func _node3d_at(pos: Vector3) -> Node3D:
	var n := Node3D.new()
	root.add_child(n)
	n.global_position = pos
	return n


func _make_subviewport(size: Vector2i) -> SubViewport:
	var sv := SubViewport.new()
	sv.size = size
	root.add_child(sv)
	return sv


func _make_camera2d(sv: SubViewport, world_pos: Vector2, zoom: Vector2) -> Camera2D:
	var cam := Camera2D.new()
	cam.zoom = zoom
	sv.add_child(cam)
	cam.global_position = world_pos
	cam.make_current()
	return cam


func _node2d_at(sv: SubViewport, world_pos: Vector2) -> Node2D:
	var n := Node2D.new()
	sv.add_child(n)
	n.global_position = world_pos
	return n
