extends SceneTree

## Headless test for the mesh-integrity validator (game_bridge/mesh_validator.gd).
##
## Fixtures are hand-built ArrayMeshes carrying each corruption signature the
## validator exists to catch — inside-out winding, orphaned vertices (dropped
## triangles), degenerate UVs, NaN normals — plus clean geometry and the
## intentional-double-sided case, so both detection AND non-detection are
## pinned. The corruptions are constructed directly from arrays rather than by
## reproducing the engine-level SurfaceTool bugs, so the test stays stable
## across engine versions.
##
## Not wired into CI (CI has no Godot). Run against any project with the addon:
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/mesh_validator_headless_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const MeshValidator := preload("res://addons/godot_mcp/game_bridge/mesh_validator.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_test_clean_mesh_passes()
	_test_inside_out_winding()
	_test_cull_disabled_downgrades_winding()
	_test_dropped_triangles()
	_test_degenerate_uvs()
	_test_wrong_normals()
	_test_non_triangle_surfaces_skipped()
	_test_shared_mesh_deduped()
	_test_sniff()
	_test_max_findings_truncation()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _check(name: String, actual: Variant, expected: Variant) -> void:
	_count += 1
	if actual == expected:
		print("ok %d - %s" % [_count, name])
	else:
		_failures += 1
		printerr("not ok %d - %s (expected %s, got %s)" % [_count, name, expected, actual])


# ── fixtures ──────────────────────────────────────────────────────────────────

## A horizontal quad at y=0 with up normals. front_facing=true emits Godot's
## front winding (clockwise from the normal side: cross.dot(normal) < 0).
static func _quad_mesh(front_facing: bool, degenerate_uv: bool = false, with_tangents: bool = true) -> ArrayMesh:
	var verts := PackedVector3Array([
		Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)])
	var norms := PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP])
	var uvs := PackedVector2Array()
	for v in verts:
		# Degenerate: the V coordinate is constant across the face (the
		# uv=(x+z, y) horizontal-face mistake); valid: project onto (x, z).
		uvs.append(Vector2(v.x + v.z, v.y) if degenerate_uv else Vector2(v.x, v.z))
	# (0,1,2)/(0,2,3) yields cross.dot(UP) < 0 — Godot's front winding seen
	# from +Y (verified against PlaneMesh); (0,2,1)/(0,3,2) is inside-out.
	var idx := PackedInt32Array([0, 1, 2, 0, 2, 3] if front_facing else [0, 2, 1, 0, 3, 2])
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	if with_tangents:
		var tans := PackedFloat32Array()
		for i in verts.size():
			tans.append_array([1.0, 0.0, 0.0, 1.0])
		arrays[Mesh.ARRAY_TANGENT] = tans
	arrays[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


## A front-facing quad whose vertex buffer carries `orphans` extra vertices no
## triangle references — the dropped-triangles signature.
static func _orphan_mesh(orphans: int) -> ArrayMesh:
	var verts := PackedVector3Array([
		Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)])
	var norms := PackedVector3Array([Vector3.UP, Vector3.UP, Vector3.UP, Vector3.UP])
	for i in orphans:
		verts.append(Vector3(0, float(i) * 0.1, 0))
		norms.append(Vector3.UP)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 2, 1, 0, 3, 2])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	return mesh


static func _instance(mesh: ArrayMesh, name: String) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.name = name
	mi.mesh = mesh
	return mi


static func _root_with(nodes: Array[Node]) -> Node3D:
	var root := Node3D.new()
	root.name = "TestRoot"
	for n in nodes:
		root.add_child(n)
	return root


static func _kinds(result: Dictionary) -> Array:
	var kinds: Array = []
	for f: Dictionary in result["findings"]:
		kinds.append(f["kind"])
	return kinds


# ── cases ─────────────────────────────────────────────────────────────────────

func _test_clean_mesh_passes() -> void:
	var root := _root_with([_instance(_quad_mesh(true), "Clean")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("clean: one surface checked", result["checked_surfaces"], 1)
	_check("clean: no findings", result["total_findings"], 0)
	root.free()


func _test_inside_out_winding() -> void:
	var root := _root_with([_instance(_quad_mesh(false), "InsideOut")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("inside-out: detected", _kinds(result).has("inside_out_winding"), true)
	var f: Dictionary = result["findings"][0]
	_check("inside-out: severity error", f["severity"], "error")
	_check("inside-out: names the node", f["node"], "InsideOut")
	root.free()


func _test_cull_disabled_downgrades_winding() -> void:
	var mi := _instance(_quad_mesh(false), "DoubleSided")
	var mat := StandardMaterial3D.new()
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mi.material_override = mat
	var root := _root_with([mi])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("cull-disabled: still reported", _kinds(result).has("inside_out_winding"), true)
	var f: Dictionary = result["findings"][0]
	_check("cull-disabled: downgraded to warning", f["severity"], "warning")
	_check("cull-disabled: fix mentions double-sided", (f["fix"] as String).contains("double-sided"), true)
	root.free()


func _test_dropped_triangles() -> void:
	# 4 used + 12 orphans = 75% unreferenced.
	var root := _root_with([_instance(_orphan_mesh(12), "Dropped")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("orphans: detected", _kinds(result).has("dropped_triangles"), true)
	var f: Dictionary = result["findings"][0]
	_check("orphans: severity error", f["severity"], "error")
	_check("orphans: fix names append_from", (f["fix"] as String).contains("append_from"), true)
	root.free()


func _test_degenerate_uvs() -> void:
	var root := _root_with([_instance(_quad_mesh(true, true), "DegenUV")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("degen-uv: detected", _kinds(result).has("degenerate_uvs"), true)
	root.free()


func _test_wrong_normals() -> void:
	# The "forgot set_normal()" class of bug, as it is OBSERVABLE post-storage:
	# ArrayMesh stores normals octahedral-encoded, so zero/NaN source normals
	# are laundered into arbitrary unit vectors at build time and cannot be
	# read back. What survives is normals pointing nowhere near the face —
	# caught by the orientation check's ambiguity bucket. Fixture: an up-facing
	# quad whose normals all point sideways (+X), exactly perpendicular to the
	# geometric normal.
	var verts := PackedVector3Array([
		Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)])
	var norms := PackedVector3Array([Vector3.RIGHT, Vector3.RIGHT, Vector3.RIGHT, Vector3.RIGHT])
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = norms
	arrays[Mesh.ARRAY_INDEX] = PackedInt32Array([0, 1, 2, 0, 2, 3])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var root := _root_with([_instance(mesh, "WrongNormals")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("wrong-normals: surface was checked", result["checked_surfaces"], 1)
	_check("wrong-normals: flagged via orientation ambiguity",
		_kinds(result).has("degenerate_triangles"), true)
	root.free()


func _test_non_triangle_surfaces_skipped() -> void:
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = PackedVector3Array([Vector3.ZERO, Vector3.ONE])
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_LINES, arrays)
	var root := _root_with([_instance(mesh, "Lines")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("lines: surface not counted", result["checked_surfaces"], 0)
	_check("lines: no findings", result["total_findings"], 0)
	root.free()


func _test_shared_mesh_deduped() -> void:
	var shared := _quad_mesh(false)
	var root := _root_with([_instance(shared, "A"), _instance(shared, "B")])
	var result: Dictionary = MeshValidator.validate(root, 25)
	_check("dedup: shared resource checked once", result["checked_meshes"], 1)
	_check("dedup: one finding, not two", result["total_findings"], 1)
	root.free()


func _test_sniff() -> void:
	var bad := _instance(_orphan_mesh(12), "SniffBad")
	var bad_warnings: Array[String] = MeshValidator.sniff(bad)
	_check("sniff: orphan mesh warned", bad_warnings.size() > 0, true)
	_check("sniff: warning names dropped triangles",
		bad_warnings.size() > 0 and bad_warnings[0].contains("dropped triangles"), true)
	var good := _instance(_quad_mesh(true), "SniffGood")
	_check("sniff: clean mesh silent", MeshValidator.sniff(good).size(), 0)
	var flipped := _instance(_quad_mesh(false), "SniffFlipped")
	var flip_warnings: Array[String] = MeshValidator.sniff(flipped)
	_check("sniff: inside-out mesh warned",
		flip_warnings.size() > 0 and flip_warnings[0].contains("inside-out"), true)
	bad.free()
	good.free()
	flipped.free()


func _test_max_findings_truncation() -> void:
	var nodes: Array[Node] = []
	for i in 5:
		nodes.append(_instance(_quad_mesh(false), "Bad%d" % i))
	var root := _root_with(nodes)
	var result: Dictionary = MeshValidator.validate(root, 2)
	_check("truncation: total reports all", result["total_findings"], 5)
	_check("truncation: findings capped", (result["findings"] as Array).size(), 2)
	_check("truncation: note present", result.has("note"), true)
	root.free()
