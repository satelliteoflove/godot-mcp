extends RefCounted

## On-screen / in-frustum detection for the runtime-state digest.
##
## Each entity in a `digest` can carry an `onscreen` bool. Getting that geometry
## right across 2D, 3D and SubViewport cameras is the fiddly part, so it lives
## here as pure, side-effect-free static helpers shared by MCPGameBridge and the
## headless test (test/onscreen_headless_test.gd).
##
## The camera is always resolved from the NODE'S OWN viewport, so a node that
## lives inside a SubViewport is tested against that SubViewport's camera rather
## than the main window camera.

# Visible world-space Rect2 for a 2D viewport. Maps the viewport's screen rect
# back through the inverse canvas transform, so camera offset, zoom, position
# and drag margins are all accounted for. (Under a rotated camera this is the
# axis-aligned bounds of the visible region, which is the right approximation
# for a coarse on-screen flag.)
static func visible_world_rect_2d(viewport: Viewport) -> Rect2:
	return viewport.get_canvas_transform().affine_inverse() * viewport.get_visible_rect()

# Whether `node` is on screen. Returns a bool when it can be decided, or null
# when it cannot (no camera of the matching dimension, or the node is neither
# 2D nor 3D) so the caller can omit the field rather than report a guess.
static func compute(node: Node) -> Variant:
	var viewport := node.get_viewport()
	if viewport == null:
		return null

	# 3D: the engine's frustum test is authoritative (handles perspective and
	# orthographic projections plus the near/far planes).
	if node is Node3D:
		var cam3d := viewport.get_camera_3d()
		if cam3d == null or not cam3d.is_inside_tree():
			return null
		return cam3d.is_position_in_frustum((node as Node3D).global_position)

	# 2D: an opted-in notifier is the most accurate signal when the game has one.
	if node is VisibleOnScreenNotifier2D:
		return (node as VisibleOnScreenNotifier2D).is_on_screen()

	# 2D fallback: test the world position against the camera's visible world
	# rect. Requires an active Camera2D; without one "on screen" is ambiguous so
	# we omit the field.
	if node is Node2D:
		if viewport.get_camera_2d() == null:
			return null
		return visible_world_rect_2d(viewport).has_point((node as Node2D).global_position)

	return null
