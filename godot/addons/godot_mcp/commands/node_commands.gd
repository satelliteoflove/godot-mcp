@tool
extends RefCounted
class_name MCPNodeCommands


func get_node_properties(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var properties := {}
	for prop in node.get_property_list():
		var name: String = prop["name"]
		if name.begins_with("_") or prop["usage"] & PROPERTY_USAGE_SCRIPT_VARIABLE == 0:
			if prop["usage"] & PROPERTY_USAGE_EDITOR == 0:
				continue

		var value = node.get(name)
		properties[name] = _serialize_value(value)

	return _success({"properties": properties})


func create_node(params: Dictionary) -> Dictionary:
	var parent_path: String = params.get("parent_path", "")
	var node_type: String = params.get("node_type", "")
	var node_name: String = params.get("node_name", "")
	var properties: Dictionary = params.get("properties", {})

	if parent_path.is_empty():
		return _error("INVALID_PARAMS", "parent_path is required")
	if node_type.is_empty():
		return _error("INVALID_PARAMS", "node_type is required")
	if node_name.is_empty():
		return _error("INVALID_PARAMS", "node_name is required")

	var parent := _get_node(parent_path)
	if not parent:
		return _error("NODE_NOT_FOUND", "Parent node not found: %s" % parent_path)

	if not ClassDB.class_exists(node_type):
		return _error("INVALID_TYPE", "Unknown node type: %s" % node_type)

	var node: Node = ClassDB.instantiate(node_type)
	if not node:
		return _error("CREATE_FAILED", "Failed to create node of type: %s" % node_type)

	node.name = node_name

	for key in properties:
		if node.has_method("set") and key in node:
			node.set(key, properties[key])

	parent.add_child(node)
	node.owner = EditorInterface.get_edited_scene_root()

	return _success({"node_path": str(node.get_path())})


func update_node(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var properties: Dictionary = params.get("properties", {})

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if properties.is_empty():
		return _error("INVALID_PARAMS", "properties is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	for key in properties:
		if key in node:
			node.set(key, properties[key])

	return _success({})


func delete_node(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var root := EditorInterface.get_edited_scene_root()
	if node == root:
		return _error("CANNOT_DELETE_ROOT", "Cannot delete the root node")

	node.get_parent().remove_child(node)
	node.queue_free()

	return _success({})


func reparent_node(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var new_parent_path: String = params.get("new_parent_path", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if new_parent_path.is_empty():
		return _error("INVALID_PARAMS", "new_parent_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var new_parent := _get_node(new_parent_path)
	if not new_parent:
		return _error("NODE_NOT_FOUND", "New parent not found: %s" % new_parent_path)

	var root := EditorInterface.get_edited_scene_root()
	if node == root:
		return _error("CANNOT_REPARENT_ROOT", "Cannot reparent the root node")

	node.reparent(new_parent)

	return _success({"new_path": str(node.get_path())})


func _get_node(path: String) -> Node:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return null

	if path == "/root" or path == str(root.get_path()):
		return root

	return root.get_node_or_null(path)


func _serialize_value(value: Variant) -> Variant:
	match typeof(value):
		TYPE_VECTOR2:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR3:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_COLOR:
			return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_OBJECT:
			if value == null:
				return null
			if value is Resource:
				return value.resource_path if value.resource_path else str(value)
			return str(value)
		_:
			return value


func _success(result: Dictionary) -> Dictionary:
	return {
		"status": "success",
		"result": result
	}


func _error(code: String, message: String) -> Dictionary:
	return {
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	}
