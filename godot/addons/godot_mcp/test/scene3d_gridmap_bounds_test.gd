extends SceneTree
## Headless check for #379: godot_scene3d bounds include GridMap cells.
## Exercises MCPScene3DCommands._local_bounds directly (no editor needed).
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
	var script := load("res://addons/godot_mcp/commands/scene3d_commands.gd")
	var cmds = script.new()

	# Empty GridMap: no bounds at all (must not appear as a zero box at origin).
	var grid := GridMap.new()
	grid.cell_size = Vector3(2, 2, 2)
	root.add_child(grid)
	_check("empty GridMap has no bounds", cmds._local_bounds(grid).has("aabb"), false)

	# No mesh library: cells fall back to cell_size boxes. Cells (0,0,0) and (9,0,7)
	# with centered cells -> 0..20 x 0..2 x 0..16.
	grid.set_cell_item(Vector3i(0, 0, 0), 0)
	grid.set_cell_item(Vector3i(9, 0, 7), 0)
	var b: AABB = cmds._local_bounds(grid).get("aabb")
	_approx("cell boxes: min", b.position, Vector3(0, 0, 0))
	_approx("cell boxes: max", b.end, Vector3(20, 2, 16))

	# With a library mesh larger than the cell, the mesh AABB wins over the cell box.
	var lib := MeshLibrary.new()
	lib.create_item(0)
	var box := BoxMesh.new()
	box.size = Vector3(3, 1, 3)  # wider than the 2-unit cell, shorter
	lib.set_item_mesh(0, box)
	grid.mesh_library = lib
	b = cmds._local_bounds(grid).get("aabb")
	_approx("mesh aabb: min", b.position, Vector3(-0.5, 0.5, -0.5))
	_approx("mesh aabb: max", b.end, Vector3(20.5, 1.5, 16.5))

	# Item mesh transform offsets and cell_scale scales the drawn mesh.
	lib.set_item_mesh_transform(0, Transform3D(Basis(), Vector3(0, 1, 0)))
	grid.cell_scale = 2.0
	b = cmds._local_bounds(grid).get("aabb")
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
	cmds._collect_bounds(parent, state)
	_check("collect: GridMap counts as a visual node", state.count, 2)
	_approx("collect: merged min", state.aabb.position, Vector3(-10.5, 0.5, -0.5))
	_approx("collect: merged max", state.aabb.end, Vector3(20.5, 5.5, 16.5))

	print("1..%d" % _n)
	if _fail == 0:
		print("ALL PASS - %d checks" % _n)
	else:
		print("FAILED - %d of %d" % [_fail, _n])
	quit(0 if _fail == 0 else 1)
	return true
