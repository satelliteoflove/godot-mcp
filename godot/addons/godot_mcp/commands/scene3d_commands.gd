@tool
extends MCPBaseCommand
class_name MCPScene3DCommands


func get_commands() -> Dictionary:
	return {
		"get_spatial_info": get_spatial_info,
		"get_scene_bounds": get_scene_bounds,
	}


func get_spatial_info(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var node_path: String = params.get("node_path", "")
	var include_children: bool = params.get("include_children", false)
	var type_filter: String = params.get("type_filter", "")
	var max_results: int = params.get("max_results", 0)
	var within_aabb: Dictionary = params.get("within_aabb", {})

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	if not node is Node3D:
		return _error("NOT_NODE3D", "Node is not a Node3D: %s" % node_path)

	var filter_aabb: AABB = AABB()
	var use_aabb_filter := false
	if not within_aabb.is_empty():
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
	_collect_spatial_info(node, nodes, type_filter, include_children, use_aabb_filter, filter_aabb, state)

	var result := {"nodes": nodes, "count": nodes.size()}
	if state.stopped:
		result["truncated"] = true
		result["max_results"] = max_results
	return _success(result)


func _collect_spatial_info(node: Node, results: Array[Dictionary], type_filter: String, include_children: bool, use_aabb_filter: bool, filter_aabb: AABB, state: Dictionary) -> void:
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
			results.append(_get_node3d_info(node3d))
			state.count += 1

	if include_children and not state.stopped:
		for child in node.get_children():
			_collect_spatial_info(child, results, type_filter, true, use_aabb_filter, filter_aabb, state)
			if state.stopped:
				break


func _get_node3d_info(node: Node3D) -> Dictionary:
	var scene_root := EditorInterface.get_edited_scene_root()
	var relative_path := scene_root.get_path_to(node)
	var usable_path := "/root/" + scene_root.name
	if relative_path != NodePath("."):
		usable_path += "/" + str(relative_path)

	var gpos: Vector3 = node.global_position
	var grot: Vector3 = node.global_rotation
	var gscale: Vector3 = node.global_transform.basis.get_scale()

	var info := {
		"path": usable_path,
		"type": node.get_class(),
		"global_position": {"x": gpos.x, "y": gpos.y, "z": gpos.z},
		"global_rotation": {"x": grot.x, "y": grot.y, "z": grot.z},
		"global_scale": {"x": gscale.x, "y": gscale.y, "z": gscale.z},
		"visible": node.visible,
	}

	if node is VisualInstance3D:
		var aabb := (node as VisualInstance3D).get_aabb()
		var global_aabb := node.global_transform * aabb
		info["aabb"] = _serialize_aabb(aabb)
		info["global_aabb"] = _serialize_aabb(global_aabb)

	return info


func _serialize_aabb(aabb: AABB) -> Dictionary:
	return {
		"position": _serialize_value(aabb.position),
		"size": _serialize_value(aabb.size),
		"end": _serialize_value(aabb.end),
	}


func get_scene_bounds(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var root_path: String = params.get("root_path", "")
	var scene_root := EditorInterface.get_edited_scene_root()

	var search_root: Node = scene_root
	if not root_path.is_empty():
		search_root = _get_node(root_path)
		if not search_root:
			return _error("NODE_NOT_FOUND", "Root node not found: %s" % root_path)

	var state := {"aabb": AABB(), "count": 0, "first": true}
	_collect_bounds(search_root, state)

	if state.count == 0:
		return _error("NO_GEOMETRY", "No VisualInstance3D nodes found under: %s" % (root_path if not root_path.is_empty() else "scene root"))

	var usable_path := "/root/" + scene_root.name
	if search_root != scene_root:
		var relative_path := scene_root.get_path_to(search_root)
		usable_path += "/" + str(relative_path)

	return _success({
		"root_path": usable_path,
		"node_count": state.count,
		"combined_aabb": _serialize_aabb(state.aabb),
	})


func _collect_bounds(node: Node, state: Dictionary) -> void:
	if node is VisualInstance3D:
		var visual := node as VisualInstance3D
		var local_aabb := visual.get_aabb()
		var global_aabb := visual.global_transform * local_aabb

		if state.first:
			state.aabb = global_aabb
			state.first = false
		else:
			state.aabb = state.aabb.merge(global_aabb)
		state.count += 1

	for child in node.get_children():
		_collect_bounds(child, state)
