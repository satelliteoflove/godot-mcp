extends SceneTree
## Headless check for #379: godot_scene3d bounds include GridMap cells, and for
## #405: the shared spatial_query.gd helper (used by both the editor command and
## the game bridge) reports info and bounds with caller-supplied paths.
## Exercises game_bridge/spatial_query.gd directly (no editor needed).
##
##   godot --headless --path <project> --script res://addons/godot_mcp/test/scene3d_gridmap_bounds_test.gd

var _n := 0
var _fail := 0


func _check(label: String, got, want) -> void:
	_n += 1
	if got == want:
		print("ok %d - %s" % [_n, label])
	else:
		_fail += 1
		print("not ok %d - %s (got %s, want %s)" % [_n, label, got, want])


func _approx(label: String, got: Vector3, want: Vector3) -> void:
	_check(label, got.is_equal_approx(want), true)


var _ran := false


func _process(_delta: float) -> bool:
	if _ran:
		return false
	_ran = true
	print("===================== SCENE3D GRIDMAP BOUNDS TEST =====================")
	var cmds = load("res://addons/godot_mcp/game_bridge/spatial_query.gd")

	# Empty GridMap: no bounds at all (must not appear as a zero box at origin).
	var grid := GridMap.new()
	grid.cell_size = Vector3(2, 2, 2)
	root.add_child(grid)
	_check("empty GridMap has no bounds", cmds.local_bounds(grid).has("aabb"), false)

	# No mesh library: cells fall back to cell_size boxes. Cells (0,0,0) and (9,0,7)
	# with centered cells -> 0..20 x 0..2 x 0..16.
	grid.set_cell_item(Vector3i(0, 0, 0), 0)
	grid.set_cell_item(Vector3i(9, 0, 7), 0)
	var b: AABB = cmds.local_bounds(grid).get("aabb")
	_approx("cell boxes: min", b.position, Vector3(0, 0, 0))
	_approx("cell boxes: max", b.end, Vector3(20, 2, 16))

	# With a library mesh larger than the cell, the mesh AABB wins over the cell box.
	var lib := MeshLibrary.new()
	lib.create_item(0)
	var box := BoxMesh.new()
	box.size = Vector3(3, 1, 3)  # wider than the 2-unit cell, shorter
	lib.set_item_mesh(0, box)
	grid.mesh_library = lib
	b = cmds.local_bounds(grid).get("aabb")
	_approx("mesh aabb: min", b.position, Vector3(-0.5, 0.5, -0.5))
	_approx("mesh aabb: max", b.end, Vector3(20.5, 1.5, 16.5))

	# Item mesh transform offsets and cell_scale scales the drawn mesh.
	lib.set_item_mesh_transform(0, Transform3D(Basis(), Vector3(0, 1, 0)))
	grid.cell_scale = 2.0
	b = cmds.local_bounds(grid).get("aabb")
	_approx("mesh_transform + cell_scale: min", b.position, Vector3(-2, 2, -2))
	_approx("mesh_transform + cell_scale: max", b.end, Vector3(22, 4, 18))

	# Sibling mesh instance and the GridMap merge in _collect_bounds under a parent.
	grid.cell_scale = 1.0
	lib.set_item_mesh_transform(0, Transform3D())
	var parent := Node3D.new()
	root.add_child(parent)
	grid.reparent(parent)
	var mi := MeshInstance3D.new()
	var far := BoxMesh.new()
	far.size = Vector3(1, 1, 1)
	mi.mesh = far
	mi.position = Vector3(-10, 5, 0)
	parent.add_child(mi)
	var state := {"aabb": AABB(), "count": 0, "first": true}
	cmds.collect_bounds(parent, state)
	_check("collect: GridMap counts as a visual node", state.count, 2)
	_approx("collect: merged min", state.aabb.position, Vector3(-10.5, 0.5, -0.5))
	_approx("collect: merged max", state.aabb.end, Vector3(20.5, 5.5, 16.5))

	# A MeshInstance3D with no mesh (runtime-assigned) has no bounds and is not counted.
	var bare := MeshInstance3D.new()
	bare.position = Vector3(50, 50, 50)
	parent.add_child(bare)
	_check("mesh-less MeshInstance3D has no bounds", cmds.local_bounds(bare).has("aabb"), false)
	state = {"aabb": AABB(), "count": 0, "first": true}
	cmds.collect_bounds(parent, state)
	_check("collect: mesh-less instance not counted", state.count, 2)
	_approx("collect: mesh-less instance does not stretch the box", state.aabb.end, Vector3(20.5, 5.5, 16.5))

	# spatial_info / scene_bounds through the shared entry points (#405).
	var path_of := func(n: Node) -> String: return "/live/" + str(n.name)
	parent.name = "Level"
	grid.name = "Floor"
	var info: Dictionary = cmds.spatial_info(grid, {}, path_of)
	_check("spatial_info: one node", info.get("count"), 1)
	var node0: Dictionary = info.nodes[0]
	_check("spatial_info: path comes from path_of", node0.get("path"), "/live/Floor")
	_check("spatial_info: GridMap carries a global_aabb", node0.has("global_aabb"), true)
	_check("spatial_info: global_aabb end", node0.global_aabb.end, {"x": 20.5, "y": 1.5, "z": 16.5})

	info = cmds.spatial_info(parent, {"include_children": true, "type_filter": "MeshInstance3D"}, path_of)
	_check("spatial_info: type_filter over children", info.get("count"), 2)
	info = cmds.spatial_info(parent, {"include_children": true, "max_results": 1}, path_of)
	_check("spatial_info: max_results truncates", info.get("truncated"), true)
	info = cmds.spatial_info(parent, {"include_children": true, "within_aabb": {"position": {"x": -11, "y": 4, "z": -1}, "size": {"x": 2, "y": 2, "z": 2}}}, path_of)
	_check("spatial_info: within_aabb keeps only the far mesh", info.get("count"), 1)

	var plain := Node.new()
	root.add_child(plain)
	_check("spatial_info: non-Node3D is an error", cmds.spatial_info(plain, {}, path_of).get("error"), "NOT_NODE3D")

	var bounds: Dictionary = cmds.scene_bounds(parent, "scene root")
	_check("scene_bounds: node_count", bounds.get("node_count"), 2)
	_check("scene_bounds: combined end", bounds.combined_aabb.end, {"x": 20.5, "y": 5.5, "z": 16.5})
	_check("scene_bounds: empty subtree is NO_GEOMETRY", cmds.scene_bounds(plain, "x").get("error"), "NO_GEOMETRY")

	print("1..%d" % _n)
	if _fail == 0:
		print("ALL PASS - %d checks" % _n)
	else:
		print("FAILED - %d of %d" % [_fail, _n])
	quit(0 if _fail == 0 else 1)
	return true
