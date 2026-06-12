extends RefCounted
## Mesh-integrity validation for procedurally generated geometry.
##
## Corrupt mesh data renders WITHOUT errors — inside-out winding shows up as
## "too dark" or "invisible walls", dropped triangles as see-through geometry,
## degenerate UVs as black shading after generate_tangents(). Nothing in the
## engine reports any of it, so an agent's first hypothesis is usually wrong
## (it tunes lighting). This validator turns those silent signatures into
## findings that carry their own cause and fix.
##
## Two entry points:
##  - validate(): full scan, on demand (the validate_meshes tool).
##  - sniff(): cheap per-surface check run automatically on scene load; its
##    one-line warnings get appended to screenshot results.

# Godot front faces wind CLOCKWISE seen from the normal side: a front
# triangle's right-hand cross points AWAY from its vertex normal. Verified
# against PlaneMesh — its first triangle has cross.dot(normal) == -1.
const _WINDING_EPS := 0.1
# Fraction thresholds: a few stray triangles are normal in hand-built or
# decimated meshes; systematic generator bugs corrupt a large share.
const _FRACTION_WARN := 0.05
# Per-surface work budget for the full scan (GDScript-speed bound). Larger
# surfaces are stride-sampled and the finding says so.
const _MAX_TRIS_SCANNED := 50000
const _SNIFF_SAMPLE_TRIS := 48
const _SNIFF_MAX_ELEMENTS := 300000


static func validate(root: Node, max_findings: int) -> Dictionary:
	var findings: Array[Dictionary] = []
	var checked_meshes := 0
	var checked_surfaces := 0
	# A mesh RESOURCE shared by many instances has one set of data — validate
	# it once, attributed to the first node found, instead of N duplicate
	# findings.
	var seen: Dictionary = {}
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var n: Node = stack.pop_back()
		for child in n.get_children():
			stack.push_back(child)
		var mesh: ArrayMesh = _array_mesh_of(n)
		if mesh == null or seen.has(mesh.get_instance_id()):
			continue
		seen[mesh.get_instance_id()] = true
		checked_meshes += 1
		for s in mesh.get_surface_count():
			if mesh.surface_get_primitive_type(s) != Mesh.PRIMITIVE_TRIANGLES:
				continue
			checked_surfaces += 1
			for f in _check_surface(mesh, s, _surface_cull_disabled(n, mesh, s)):
				f["node"] = str(root.get_path_to(n)) if root.is_ancestor_of(n) else str(n.name)
				f["surface"] = s
				findings.append(f)
	var total := findings.size()
	if findings.size() > max_findings:
		findings.resize(max_findings)
	var result := {
		"checked_meshes": checked_meshes,
		"checked_surfaces": checked_surfaces,
		"total_findings": total,
		"findings": findings,
	}
	if total > max_findings:
		result["note"] = "%d findings truncated to %d (max_findings)" % [total, max_findings]
	return result


## Cheap integrity sniff for one node, used by the on-scene-load pass.
## Returns short one-line warnings ("" entries never appear).
static func sniff(n: Node) -> Array[String]:
	var warnings: Array[String] = []
	var mesh: ArrayMesh = _array_mesh_of(n)
	if mesh == null:
		return warnings
	for s in mesh.get_surface_count():
		if mesh.surface_get_primitive_type(s) != Mesh.PRIMITIVE_TRIANGLES:
			continue
		var vlen := mesh.surface_get_array_len(s)
		var ilen := mesh.surface_get_array_index_len(s)
		# O(1) red flag for surfaces too big to walk here: fewer index slots
		# than vertices means triangles were lost. (Weak — orphans can hide
		# behind ilen >= vlen — so below a size budget we count for real.)
		if ilen > 0 and vlen > 0 and ilen < vlen:
			warnings.append("%s surf %d: %d verts but only %d indices — dropped triangles" % [n.name, s, vlen, ilen])
			continue
		# The budget bounds the ARRAY COPY too: surface_get_arrays() duplicates
		# every channel, a multi-MB scene-load hitch on big imported meshes.
		# Oversized surfaces keep only the O(1) check; the on-demand full
		# validate (stride-sampled) is the path that inspects them.
		if vlen + ilen > _SNIFF_MAX_ELEMENTS:
			continue
		var arrays: Array = mesh.surface_get_arrays(s)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var norms = arrays[Mesh.ARRAY_NORMAL]
		if verts.is_empty() or norms == null:
			continue
		var idx = arrays[Mesh.ARRAY_INDEX]
		# Real orphan count when affordable (integer-only pass): the definitive
		# dropped-triangles signature regardless of how the counts balance.
		if idx != null and vlen + ilen < _SNIFF_MAX_ELEMENTS:
			var pidx := idx as PackedInt32Array
			var used := PackedByteArray()
			used.resize(verts.size())
			for i in pidx.size():
				var v := pidx[i]
				if v >= 0 and v < used.size():
					used[v] = 1
			var orphans := 0
			for i in used.size():
				if used[i] == 0:
					orphans += 1
			if float(orphans) / float(verts.size()) > _FRACTION_WARN:
				warnings.append("%s surf %d: %d%% of vertices unreferenced — dropped triangles" % [n.name, s, orphans * 100 / verts.size()])
				continue
		var tri_count: int = ((idx as PackedInt32Array).size() if idx != null else verts.size()) / 3
		if tri_count == 0:
			continue
		var stride := maxi(1, tri_count / _SNIFF_SAMPLE_TRIS)
		var sampled := 0
		var inside_out := 0
		var non_finite := 0
		for t in range(0, tri_count, stride):
			sampled += 1
			var o := _orientation(verts, norms, idx, t * 3)
			if o == 1:
				inside_out += 1
			elif o == -2:
				non_finite += 1
		if non_finite > 0:
			warnings.append("%s surf %d: non-finite vertex data (NaN/INF)" % [n.name, s])
		elif inside_out * 2 > sampled:
			warnings.append("%s surf %d: ~%d%% of sampled triangles wind inside-out" % [n.name, s, inside_out * 100 / sampled])
	return warnings


static func _array_mesh_of(n: Node) -> ArrayMesh:
	# Engine primitives (BoxMesh, CylinderMesh, ...) are generator-correct by
	# construction; only code-built ArrayMeshes carry these bug classes.
	if n is MeshInstance3D and (n as MeshInstance3D).mesh is ArrayMesh:
		return (n as MeshInstance3D).mesh
	if n is MultiMeshInstance3D:
		var mm: MultiMesh = (n as MultiMeshInstance3D).multimesh
		if mm != null and mm.mesh is ArrayMesh:
			return mm.mesh
	return null


## Orientation of one triangle: 0 = correct (CW from normal side),
## 1 = inside-out, -1 = degenerate (skip), -2 = non-finite data.
static func _orientation(verts: PackedVector3Array, norms: PackedVector3Array, idx, base: int) -> int:
	var ia: int
	var ib: int
	var ic: int
	if idx != null and (idx as PackedInt32Array).size() > 0:
		var pidx := idx as PackedInt32Array
		ia = pidx[base]
		ib = pidx[base + 1]
		ic = pidx[base + 2]
	else:
		ia = base
		ib = base + 1
		ic = base + 2
	if ic >= verts.size() or ic >= norms.size():
		return -1
	var a := verts[ia]
	var b := verts[ib]
	var c := verts[ic]
	if not (a.is_finite() and b.is_finite() and c.is_finite()
			and norms[ia].is_finite() and norms[ib].is_finite() and norms[ic].is_finite()):
		return -2
	var cross := (b - a).cross(c - a)
	var cl := cross.length()
	if cl < 1e-12:
		return -1
	var vn := norms[ia] + norms[ib] + norms[ic]
	if vn.length_squared() < 0.01:
		return -1
	var d := cross.dot(vn) / (cl * vn.length())
	if d > _WINDING_EPS:
		return 1
	if d < -_WINDING_EPS:
		return 0
	return -1


# Effective material for one surface, in Godot's own precedence order. A
# double-sided material makes wrong winding invisible (nothing is culled), so
# winding findings on such surfaces are downgraded — but not dropped, because
# the inverted normals still break lighting.
static func _surface_cull_disabled(n: Node, mesh: ArrayMesh, s: int) -> bool:
	var mat: Material = null
	if n is GeometryInstance3D and (n as GeometryInstance3D).material_override != null:
		mat = (n as GeometryInstance3D).material_override
	elif n is MeshInstance3D and (n as MeshInstance3D).get_surface_override_material(s) != null:
		mat = (n as MeshInstance3D).get_surface_override_material(s)
	else:
		mat = mesh.surface_get_material(s)
	return mat is BaseMaterial3D and (mat as BaseMaterial3D).cull_mode == BaseMaterial3D.CULL_DISABLED


static func _check_surface(mesh: ArrayMesh, s: int, cull_disabled: bool = false) -> Array[Dictionary]:
	var findings: Array[Dictionary] = []
	var arrays: Array = mesh.surface_get_arrays(s)
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	if verts.is_empty():
		return findings
	var norms = arrays[Mesh.ARRAY_NORMAL]
	var uvs = arrays[Mesh.ARRAY_TEX_UV]
	var tans = arrays[Mesh.ARRAY_TANGENT]
	var idx = arrays[Mesh.ARRAY_INDEX]
	var indexed: bool = idx != null and (idx as PackedInt32Array).size() > 0
	var tri_count: int = ((idx as PackedInt32Array).size() if indexed else verts.size()) / 3

	# 1. Orphaned vertices (indexed only): vertices no triangle references.
	#    The signature of triangles lost during construction.
	if indexed:
		var pidx := idx as PackedInt32Array
		var used := PackedByteArray()
		used.resize(verts.size())
		for i in pidx.size():
			var v := pidx[i]
			if v >= 0 and v < verts.size():
				used[v] = 1
		var orphans := 0
		for i in used.size():
			if used[i] == 0:
				orphans += 1
		var ofrac := float(orphans) / float(verts.size())
		if ofrac > _FRACTION_WARN:
			findings.append({
				"severity": "error",
				"kind": "dropped_triangles",
				"stat": "%d of %d vertices (%d%%) are never referenced by the index buffer" % [orphans, verts.size(), int(ofrac * 100.0)],
				"fix": "Triangles were lost while building this mesh. Typical cause: SurfaceTool.append_from() of an INDEXED mesh into a SurfaceTool that already holds raw add_vertex data corrupts index()/commit(). Deindex the source first (SurfaceTool.create_from -> deindex -> commit) or keep indexed and raw geometry in separate SurfaceTools.",
			})

	# Work budget: stride-sample huge surfaces instead of silently skipping.
	var stride := maxi(1, tri_count / _MAX_TRIS_SCANNED)
	var sampled_note := "" if stride == 1 else " (sampled 1/%d triangles)" % stride

	# 2. Winding vs normals, 3. degenerate UV / position triangles.
	var sampled := 0
	var inside_out := 0
	var correct := 0
	var non_finite_tris := 0
	var degen_pos := 0
	var degen_uv := 0
	var has_uv: bool = uvs != null and (uvs as PackedVector2Array).size() == verts.size()
	var puv: PackedVector2Array = uvs if has_uv else PackedVector2Array()
	var pidx2: PackedInt32Array = idx if indexed else PackedInt32Array()
	if norms != null and (norms as PackedVector3Array).size() == verts.size():
		var pnorms := norms as PackedVector3Array
		for t in range(0, tri_count, stride):
			sampled += 1
			var base := t * 3
			var o := _orientation(verts, pnorms, idx, base)
			match o:
				0: correct += 1
				1: inside_out += 1
				-1: degen_pos += 1
				-2: non_finite_tris += 1
			if has_uv and o != -2:
				var ia := pidx2[base] if indexed else base
				var ib := pidx2[base + 1] if indexed else base + 1
				var ic := pidx2[base + 2] if indexed else base + 2
				var e1 := puv[ib] - puv[ia]
				var e2 := puv[ic] - puv[ia]
				if absf(e1.cross(e2)) < 1e-12 and o != -1:
					degen_uv += 1
	if sampled > 0:
		var io_frac := float(inside_out) / float(sampled)
		if io_frac > _FRACTION_WARN:
			var wind_severity := "warning" if cull_disabled else "error"
			var cull_note := " NOTE: this surface's material is double-sided (cull disabled), so wrong winding hides nothing here — but inverted normals still mislight; this may also be intentional (foliage cards, decals)." if cull_disabled else ""
			if correct > sampled / 10:
				findings.append({
					"severity": wind_severity,
					"kind": "mixed_winding",
					"stat": "%d%% of triangles wind inside-out, %d%% correctly%s" % [int(io_frac * 100.0), correct * 100 / sampled, sampled_note],
					"fix": "The generator's point ordering is inconsistent between face families, so no fixed fan order is right for all of them. Enforce winding PER FACE: Godot front faces wind clockwise seen from the normal side, i.e. (b-a).cross(c-a).dot(normal) must be < 0 for every front triangle — swap two indices when it is not. Symptoms: some faces invisible from the side their normal points (see-through floors/walls), others lit on the wrong side (black under any sun)." + cull_note,
				})
			else:
				findings.append({
					"severity": wind_severity,
					"kind": "inside_out_winding",
					"stat": "%d%% of triangles wind inside-out%s" % [int(io_frac * 100.0), sampled_note],
					"fix": "Triangles wind counter-clockwise seen from their normal side, but Godot front faces wind CLOCKWISE — these faces are invisible from the side their normal points and/or are lit with an inverted normal (renders black under any light, looks like 'lighting is broken'). Fix the emission order so (b-a).cross(c-a).dot(normal) < 0, or as a stopgap set cull_mode = CULL_DISABLED to confirm the diagnosis visually." + cull_note,
				})
		if non_finite_tris > 0:
			findings.append({
				"severity": "error",
				"kind": "non_finite_data",
				"stat": "%d sampled triangles contain NaN/INF positions or normals%s" % [non_finite_tris, sampled_note],
				"fix": "Non-finite vertex data poisons everything downstream (lighting, culling, shadows) with no error reported. Usually a division by zero or normalize() of a zero vector in the generator.",
			})
		var uv_frac := (float(degen_uv) / float(sampled)) if sampled > 0 else 0.0
		if uv_frac > _FRACTION_WARN:
			findings.append({
				"severity": "error" if tans != null else "warning",
				"kind": "degenerate_uvs",
				"stat": "%d%% of triangles have zero UV area%s" % [int(uv_frac * 100.0), sampled_note],
				"fix": "Zero-area UVs (a UV coordinate that is constant across a face, e.g. uv=(x+z, y) on a horizontal face) make generate_tangents() emit garbage tangents, which can corrupt GPU-side normals on some vertex formats — flat faces shade black while angled ones look fine. Project UVs onto each face's dominant axis plane (|n.y| max -> (x,z); |n.x| max -> (z,y); else (x,y)). Triplanar materials do NOT make UVs irrelevant: tangent generation still reads them.",
			})
		var dp_frac := float(degen_pos) / float(sampled)
		if dp_frac > 0.25:
			findings.append({
				"severity": "warning",
				"kind": "degenerate_triangles",
				"stat": "%d%% of triangles have ~zero area or unusable normals%s" % [int(dp_frac * 100.0), sampled_note],
				"fix": "Wasted vertices at best; if unexpected, the generator is emitting collapsed faces.",
			})

	# 4. Tangent sanity (only when present).
	if tans != null:
		var ptans := tans as PackedFloat32Array
		var bad_tan := 0
		var tcount := ptans.size() / 4
		var tstride := maxi(1, tcount / _MAX_TRIS_SCANNED)
		var tsampled := 0
		for i in range(0, tcount, tstride):
			tsampled += 1
			var tx := ptans[i * 4]
			var ty := ptans[i * 4 + 1]
			var tz := ptans[i * 4 + 2]
			if is_nan(tx) or is_inf(tx) or is_nan(ty) or is_inf(ty) or is_nan(tz) or is_inf(tz):
				bad_tan += 1
			elif tx * tx + ty * ty + tz * tz < 0.25:
				bad_tan += 1
		if tsampled > 0 and float(bad_tan) / float(tsampled) > _FRACTION_WARN:
			findings.append({
				"severity": "error",
				"kind": "bad_tangents",
				"stat": "%d%% of tangents are NaN/zero" % [bad_tan * 100 / tsampled],
				"fix": "Broken tangents corrupt normal mapping and, with compressed vertex formats, the GPU normals themselves. Usual cause is generate_tangents() over degenerate UVs — fix the UVs (see degenerate_uvs) or skip tangents for untextured meshes.",
			})

	# 5. Normal sanity. NOTE: ArrayMesh stores normals octahedral-encoded, so
	# zero/NaN SOURCE normals are usually laundered into arbitrary unit
	# vectors at build time — post-storage they surface as orientation
	# ambiguity (check 2's degenerate bucket), not here. This check still
	# covers uncompressed/custom formats where raw values survive.
	if norms != null:
		var pn := norms as PackedVector3Array
		var bad_n := 0
		var nstride := maxi(1, pn.size() / _MAX_TRIS_SCANNED)
		var nsampled := 0
		for i in range(0, pn.size(), nstride):
			nsampled += 1
			var v := pn[i]
			if not v.is_finite() or v.length_squared() < 0.25:
				bad_n += 1
		if nsampled > 0 and float(bad_n) / float(nsampled) > _FRACTION_WARN:
			findings.append({
				"severity": "error",
				"kind": "zero_normals",
				"stat": "%d%% of vertex normals are NaN or near-zero length" % [bad_n * 100 / nsampled],
				"fix": "Unit-length normals are assumed by all lighting. The generator is forgetting set_normal() on some vertices or normalizing zero vectors.",
			})
	return findings
