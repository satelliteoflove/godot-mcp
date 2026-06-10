extends SceneTree

## Headless test for the 3D-aware digest fallback tier (godot-mcp #230).
##
## The `digest` fallback tier — what an un-instrumented project hits via
## select="auto" — historically selected only visible CanvasItems, so a 3D scene
## with no mcp_watch group and no _mcp_state() returned zero world entities. This
## test pins the fix: the fallback now also selects visible 3D WORLD nodes —
## VisualInstance3D (meshes/particles/sprites/labels/lights), GridMap, Camera3D,
## and CollisionObject3D (physics bodies + areas) — while skipping pure-structure
## Node3Ds (Marker3D, Skeleton3D, bare pivots) and honoring visibility, max_nodes,
## and the type filter. 2D behavior is unchanged.
##
## A real MCPGameBridge is instantiated WITHOUT adding it to the tree (so _ready's
## bridge setup never runs); _collect_runtime_state / _extract_node_state /
## _has_mcp_state_nodes are pure with respect to bridge state, so this is safe.
##
## Not wired into CI (CI has no Godot). Run on demand against any project with the
## addon present (the run-n-gun junction is the standard host):
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/digest_fallback_3d_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const Bridge := preload("res://addons/godot_mcp/game_bridge/mcp_game_bridge.gd")

var _count := 0
var _failures := 0

var _bridge: Node
var _scene: Node3D


func _initialize() -> void:
	# Coroutine so the Camera3D can register/apply before onscreen is sampled.
	_run()


func _run() -> void:
	_bridge = Bridge.new() # NOT added to the tree — no _ready side effects.
	_build_scene()
	# Let the camera become current and the viewport settle (mirrors the
	# onscreen headless test, which the 3D frustum path here also relies on).
	for i in 3:
		await process_frame

	_test_selection_and_exclusion()
	_test_entity_data_and_onscreen()
	_test_max_nodes_and_type_filter()
	_test_fallback_branch_conditions_hold()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


# ── Scene under test ───────────────────────────────────────────────────────────
#
# A Node3D root (like a real 3D scene) holding a curated mix of selectable world
# nodes, noise that must be skipped, a hidden mesh, and a 2D UI subtree.

func _build_scene() -> void:
	_scene = Node3D.new()
	_scene.name = "Scene" # a bare Node3D root — itself must NOT be selected
	root.add_child(_scene)

	var cam := Camera3D.new()
	cam.name = "Cam"
	_scene.add_child(cam)
	cam.current = true # identity transform → at origin looking down -Z

	# Local position, not global_position: _build_scene runs in _initialize() before
	# the tree is live, where global_position would hit the !is_inside_tree() guard
	# (spurious ERROR + silent degrade to local). Every parent is identity, so the
	# effective world position is identical once the node is in-tree.
	var mesh_front := MeshInstance3D.new()
	mesh_front.name = "MeshFront"
	_scene.add_child(mesh_front)
	mesh_front.position = Vector3(0, 0, -10) # in front of the camera

	var mesh_behind := MeshInstance3D.new()
	mesh_behind.name = "MeshBehind"
	_scene.add_child(mesh_behind)
	mesh_behind.position = Vector3(0, 0, 10) # behind the camera

	var mesh_hidden := MeshInstance3D.new()
	mesh_hidden.name = "MeshHidden"
	mesh_hidden.visible = false
	_scene.add_child(mesh_hidden)

	var gridmap := GridMap.new() # extends Node3D directly — the regression guard
	gridmap.name = "Grid"
	_scene.add_child(gridmap)

	var light := OmniLight3D.new()
	light.name = "Light"
	_scene.add_child(light)

	var body := CharacterBody3D.new() # a gameplay entity (FPS enemy/player)
	body.name = "Body"
	_scene.add_child(body)
	body.velocity = Vector3(1, 2, 3)

	var area := Area3D.new() # a CollisionObject3D that is NOT a PhysicsBody3D (trigger volume)
	area.name = "Trigger"
	_scene.add_child(area)

	# Noise: nodes that must be skipped — pure-structure Node3Ds AND a bake/helper
	# VisualInstance3D. Decal is a VisualInstance3D but NOT a GeometryInstance3D, so
	# the narrowed predicate must exclude it (guards against reverting to the broader
	# VisualInstance3D check, which would drag in decals/probes/occluders/etc).
	var marker := Marker3D.new()
	marker.name = "Marker"
	_scene.add_child(marker)
	var skel := Skeleton3D.new()
	skel.name = "Skel"
	_scene.add_child(skel)
	var decal := Decal.new()
	decal.name = "Decal"
	_scene.add_child(decal)

	# 2D UI subtree (CanvasLayer is not a CanvasItem, so it is itself skipped, but
	# its visible Control children must still surface — 2D parity).
	var ui := CanvasLayer.new()
	ui.name = "UI"
	_scene.add_child(ui)
	var label := Label.new()
	label.name = "Score"
	ui.add_child(label)
	var button := Button.new()
	button.name = "Start"
	ui.add_child(button)


# ── Collection helper ──────────────────────────────────────────────────────────

func _collect(max_nodes: int, type_filter: String) -> Array:
	var results: Array = []
	_bridge._collect_runtime_state(_scene, _scene, "fallback", "mcp_watch",
		"", type_filter, [], max_nodes, results)
	return results


func _has_type(results: Array, t: String) -> bool:
	for e in results:
		if str(e.get("type", "")) == t:
			return true
	return false


func _find_by_name(results: Array, suffix: String) -> Variant:
	for e in results:
		if str(e.get("path", "")).ends_with(suffix):
			return e
	return null


# ── Checks ─────────────────────────────────────────────────────────────────────

func _test_selection_and_exclusion() -> void:
	var r := _collect(40, "")

	# 3D world nodes are selected (the whole point of #230).
	_check("MeshInstance3D selected", _find_by_name(r, "/MeshFront") != null, true)
	_check("GridMap selected (regression guard — NOT a VisualInstance3D)",
		_has_type(r, "GridMap"), true)
	_check("Camera3D selected", _has_type(r, "Camera3D"), true)
	_check("OmniLight3D selected (Light3D — VisualInstance3D, not GeometryInstance3D)",
		_has_type(r, "OmniLight3D"), true)
	_check("CharacterBody3D (physics body) selected", _has_type(r, "CharacterBody3D"), true)
	_check("Area3D (CollisionObject3D, not PhysicsBody3D) selected", _has_type(r, "Area3D"), true)

	# Noise is skipped: pure-structure Node3Ds AND bake/helper VisualInstance3Ds.
	_check("Marker3D excluded (noise)", _has_type(r, "Marker3D"), false)
	_check("Skeleton3D excluded (noise)", _has_type(r, "Skeleton3D"), false)
	_check("Decal excluded (VisualInstance3D but not GeometryInstance3D)", _has_type(r, "Decal"), false)

	# Visibility gating: a hidden mesh is excluded; the bare Node3D root too.
	_check("hidden MeshInstance3D excluded", _find_by_name(r, "/MeshHidden") == null, true)
	_check("bare Node3D root excluded", _find_by_name(r, "/root/Scene") == null, true)

	# 2D parity: visible Controls still surface, unchanged.
	_check("2D Label still selected", _has_type(r, "Label"), true)
	_check("2D Button still selected", _has_type(r, "Button"), true)


func _test_entity_data_and_onscreen() -> void:
	var r := _collect(40, "")

	# Selected 3D entities carry real data through the tier (extraction wiring).
	var front: Variant = _find_by_name(r, "/MeshFront")
	var has_pos: bool = front != null and (front as Dictionary).has("pos") \
		and ((front as Dictionary)["pos"] as Dictionary).has("z")
	_check("selected mesh carries 3D pos {x,y,z}", has_pos, true)
	if front != null:
		_check("mesh pos.z reflects placement", (front as Dictionary)["pos"]["z"], -10.0)

	var body: Variant = _find_by_name(r, "/Body")
	var vel_ok: bool = body != null and (body as Dictionary).has("vel") \
		and (body as Dictionary)["vel"]["z"] == 3.0
	_check("CharacterBody3D reports velocity", vel_ok, true)

	# onscreen flag is present and correct for 3D (current Camera3D resolved).
	if front != null:
		_check("mesh in front is onscreen", (front as Dictionary).get("onscreen", null), true)
	var behind: Variant = _find_by_name(r, "/MeshBehind")
	if behind != null:
		_check("mesh behind camera is offscreen", (behind as Dictionary).get("onscreen", null), false)


func _test_max_nodes_and_type_filter() -> void:
	# max_nodes still bounds the result.
	var capped := _collect(2, "")
	_check("max_nodes caps the result", capped.size(), 2)

	# type filter still narrows post-selection.
	var grids := _collect(40, "GridMap")
	var all_grid := grids.size() > 0
	for e in grids:
		if str(e.get("type", "")) != "GridMap":
			all_grid = false
	_check("type filter narrows to GridMap only", all_grid and grids.size() == 1, true)


func _test_fallback_branch_conditions_hold() -> void:
	# The real resolver (_handle_get_runtime_state) is not directly callable in this
	# SceneTree harness — it reads tree.current_scene (null here) and replies via
	# EngineDebugger. So rather than exercise the auto→fallback branch itself, this
	# pins its two INPUT conditions: with no mcp_watch members and no _mcp_state()
	# nodes, auto would resolve to fallback (per the resolver order in the bridge).
	_check("no mcp_watch members (auto would pick fallback)", get_nodes_in_group("mcp_watch").size(), 0)
	_check("no _mcp_state() nodes (auto would pick fallback)", _bridge._has_mcp_state_nodes(_scene), false)


# ── Tiny TAP-ish harness ──────────────────────────────────────────────────────

func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
