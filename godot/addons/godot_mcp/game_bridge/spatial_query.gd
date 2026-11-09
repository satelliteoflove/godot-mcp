extends RefCounted
## Spatial queries behind godot_scene3d, shared by the editor command (which
## reads the scene open in the editor) and the game bridge (which reads the
## running game's live tree), so both report the same numbers the same way
## (#405). Nothing here touches EditorInterface: the caller resolves the start
## node and supplies how a node's path is written.
##
## Errors come back as {"error": CODE, "message": text}; callers turn them into
## their own error responses.


## Spatial data for `node`, and for its Node3D descendants when
## params.include_children is set. path_of is a Callable(Node) -> String.
## Returns {nodes, count[, truncated, max_results]} or an error.
static func spatial_info(node: Node, params: Dictionary, path_of: Callable) -> Dictionary:
	if not node is Node3D:
		return {"error": "NOT_NODE3D", "message": "Node is not a Node3D: %s" % path_of.call(node)}

	var include_children: bool = bool(params.get("include_children", false))
	var raw_filter = params.get("type_filter")
	var type_filter: String = raw_filter if raw_filter is String else ""
	var raw_max = params.get("max_results")
	var max_results: int = int(raw_max) if (raw_max is int or raw_max is float) else 0
	var within_aabb = params.get("within_aabb", {})

	var filter_aabb := AABB()
	var use_aabb_filter := false
	if within_aabb is Dictionary and not within_aabb.is_empty():
		var pos: Dictionary = within_aabb.get("position", {})
		var size: Dictionary = within_aabb.get("size", {})
		if pos.has("x") and size.has("x"):
			filter_aabb = AABB(
				Vector3(pos.get("x", 0), pos.get("y", 0), pos.get("z", 0)),
				Vector3(size.get("x", 0), size.get("y", 0), size.get("z", 0))
			)
			use_aabb_filter = true

	var nodes: Array[Dictionary] = []
	var state := {"max": max_results, "count": 0, "stopped": false}
	_collect_spatial_info(node, nodes, type_filter, include_children, use_aabb_filter, filter_aabb, state, path_of)

	var result := {"nodes": nodes, "count": nodes.size()}
	if state.stopped:
		result["truncated"] = true
		result["max_results"] = max_results
	return result


## Combined global AABB of every node under search_root that draws something
## measurable. Returns {node_count, combined_aabb} or a NO_GEOMETRY error whose
## message names `label`.
static func scene_bounds(search_root: Node, label: String) -> Dictionary:
	var state := {"aabb": AABB(), "count": 0, "first": true}
	collect_bounds(search_root, state)
	if state.count == 0:
		return {"error": "NO_GEOMETRY", "message": "No VisualInstance3D or populated GridMap nodes found under: %s" % label}
	return {"node_count": state.count, "combined_aabb": serialize_aabb(state.aabb)}


static func _collect_spatial_info(node: Node, results: Array[Dictionary], type_filter: String, include_children: bool, use_aabb_filter: bool, filter_aabb: AABB, state: Dictionary, path_of: Callable) -> void:
	if state.max > 0 and state.count >= state.max:
		state.stopped = true
		return

	if node is Node3D:
		var node3d := node as Node3D
		var type_matches := type_filter.is_empty() or node.is_class(type_filter)
		var aabb_matches := true
		if use_aabb_filter:
			aabb_matches = filter_aabb.has_point(node3d.global_position)
		if type_matches and aabb_matches:
			results.append(_node3d_info(node3d, path_of))
			state.count += 1

	if include_children and not state.stopped:
		for child in node.get_children():
			_collect_spatial_info(child, results, type_filter, true, use_aabb_filter, filter_aabb, state, path_of)
			if state.stopped:
				break


static func _node3d_info(node: Node3D, path_of: Callable) -> Dictionary:
	var gscale: Vector3 = node.global_transform.basis.get_scale()
	var info := {
		"path": path_of.call(node),
		"type": node.get_class(),
		"global_position": _vec3(node.global_position),
		"global_rotation": _vec3(node.global_rotation),
		"global_scale": _vec3(gscale),
		"visible": node.visible,
	}

	var bounds := local_bounds(node)
	if bounds.has("aabb"):
		var aabb: AABB = bounds.aabb
		info["aabb"] = serialize_aabb(aabb)
		info["global_aabb"] = serialize_aabb(node.global_transform * aabb)

	return info


## Local-space bounds of a node that draws something, or {} when it draws
## nothing we can measure (no mesh, or a GridMap with no cells). VisualInstance3D
## reports its own AABB. GridMap is a
## plain Node3D that renders through its own RenderingServer instances, so its
## bounds are folded from the placed cells: each cell contributes its library
## mesh's AABB (through the item mesh transform, cell orientation and
## cell_scale, at the cell's local origin), or a cell_size box when the item
## has no mesh -- so it covers what is actually drawn, not just the grid (#379).
static func local_bounds(node: Node) -> Dictionary:
	if node is VisualInstance3D:
		var aabb := (node as VisualInstance3D).get_aabb()
		# A MeshInstance3D with no mesh (assigned at runtime, null in the editor)
		# reports a zero-size AABB at its origin. That is not geometry: counting it
		# would merge a point into the subtree bounds and report a bogus zero box.
		if aabb.size == Vector3.ZERO:
			return {}
		return {"aabb": aabb}
	if node is GridMap:
		var grid := node as GridMap
		var cells := grid.get_used_cells()
		if cells.is_empty():
			return {}
		var library: MeshLibrary = grid.mesh_library
		var cell_box := AABB(-grid.cell_size / 2.0, grid.cell_size)
		var scale_basis := Basis().scaled(Vector3.ONE * grid.cell_scale)
		var total := AABB()
		var first := true
		for cell in cells:
			var item := grid.get_cell_item(cell)
			var origin: Vector3 = grid.map_to_local(cell)
			var cell_aabb: AABB
			var mesh: Mesh = library.get_item_mesh(item) if library != null and library.get_item_list().has(item) else null
			if mesh != null:
				var orientation := grid.get_basis_with_orthogonal_index(grid.get_cell_item_orientation(cell))
				var xform := Transform3D(orientation * scale_basis, origin) * library.get_item_mesh_transform(item)
				cell_aabb = xform * mesh.get_aabb()
			else:
				cell_aabb = AABB(cell_box.position + origin, cell_box.size)
			if first:
				total = cell_aabb
				first = false
			else:
				total = total.merge(cell_aabb)
		return {"aabb": total}
	return {}


static func collect_bounds(node: Node, state: Dictionary) -> void:
	var bounds := local_bounds(node)
	if bounds.has("aabb"):
		var global_aabb: AABB = (node as Node3D).global_transform * bounds.aabb

		if state.first:
			state.aabb = global_aabb
			state.first = false
		else:
			state.aabb = state.aabb.merge(global_aabb)
		state.count += 1

	for child in node.get_children():
		collect_bounds(child, state)


static func serialize_aabb(aabb: AABB) -> Dictionary:
	return {
		"position": _vec3(aabb.position),
		"size": _vec3(aabb.size),
		"end": _vec3(aabb.end),
	}


static func _vec3(v: Vector3) -> Dictionary:
	return {"x": v.x, "y": v.y, "z": v.z}
