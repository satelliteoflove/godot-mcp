@tool
extends MCPBaseCommand
class_name MCPNodeCommands


func get_commands() -> Dictionary:
	return {
		"get_node_properties": get_node_properties,
		"create_node": create_node,
		"update_node": update_node,
		"delete_node": delete_node,
		"reparent_node": reparent_node
	}


func _require_scene_open() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")
	return {}


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
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

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
			var deserialized := MCPUtils.deserialize_value(properties[key])
			node.set(key, deserialized)

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
			var deserialized := MCPUtils.deserialize_value(properties[key])
			node.set(key, deserialized)

	return _success({})


func delete_node(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

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
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

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


