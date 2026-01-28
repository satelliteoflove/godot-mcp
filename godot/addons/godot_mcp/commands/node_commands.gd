@tool
extends MCPBaseCommand
class_name MCPNodeCommands

const FIND_NODES_TIMEOUT := 5.0

var _find_nodes_pending := false
var _find_nodes_result: Dictionary = {}


func get_commands() -> Dictionary:
	return {
		"get_node_properties": get_node_properties,
		"find_nodes": find_nodes,
		"create_node": create_node,
		"update_node": update_node,
		"delete_node": delete_node,
		"reparent_node": reparent_node,
		"connect_signal": connect_signal
	}


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


func find_nodes(params: Dictionary) -> Dictionary:
	var name_pattern: String = params.get("name_pattern", "")
	var type_filter: String = params.get("type", "")
	var root_path: String = params.get("root_path", "")

	if name_pattern.is_empty() and type_filter.is_empty():
		return _error("INVALID_PARAMS", "At least one of name_pattern or type is required")

	var debugger := _plugin.get_debugger_plugin() as MCPDebuggerPlugin
	if debugger and EditorInterface.is_playing_scene() and debugger.has_active_session():
		return await _find_nodes_via_game(debugger, name_pattern, type_filter, root_path)

	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var scene_root := EditorInterface.get_edited_scene_root()
	var search_root: Node = scene_root

	if not root_path.is_empty():
		search_root = _get_node(root_path)
		if not search_root:
			return _error("NODE_NOT_FOUND", "Root node not found: %s" % root_path)

	var matches: Array[Dictionary] = []
	_find_recursive(search_root, scene_root, name_pattern, type_filter, matches)

	return _success({"matches": matches, "count": matches.size()})


func _find_nodes_via_game(debugger: MCPDebuggerPlugin, name_pattern: String, type_filter: String, root_path: String) -> Dictionary:
	_find_nodes_pending = true
	_find_nodes_result = {}

	if debugger.find_nodes_received.is_connected(_on_find_nodes_received):
		debugger.find_nodes_received.disconnect(_on_find_nodes_received)
	debugger.find_nodes_received.connect(_on_find_nodes_received, CONNECT_ONE_SHOT)
	debugger.request_find_nodes(name_pattern, type_filter, root_path)

	var start_time := Time.get_ticks_msec()
	while _find_nodes_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > FIND_NODES_TIMEOUT:
			_find_nodes_pending = false
			if debugger.find_nodes_received.is_connected(_on_find_nodes_received):
				debugger.find_nodes_received.disconnect(_on_find_nodes_received)
			return _error("TIMEOUT", "Game did not respond within %d seconds" % int(FIND_NODES_TIMEOUT))

	return _find_nodes_result


func _on_find_nodes_received(matches: Array, count: int, error: String) -> void:
	_find_nodes_pending = false
	if not error.is_empty():
		_find_nodes_result = _error("GAME_ERROR", error)
	else:
		_find_nodes_result = _success({"matches": matches, "count": count})


func _find_recursive(node: Node, scene_root: Node, name_pattern: String, type_filter: String, results: Array[Dictionary]) -> void:
	var name_matches := name_pattern.is_empty() or node.name.matchn(name_pattern)
	var type_matches := type_filter.is_empty() or node.is_class(type_filter)

	if name_matches and type_matches:
		var relative_path := scene_root.get_path_to(node)
		var usable_path := "/root/" + scene_root.name
		if relative_path != NodePath("."):
			usable_path += "/" + str(relative_path)

		results.append({
			"path": usable_path,
			"type": node.get_class()
		})

	for child in node.get_children():
		_find_recursive(child, scene_root, name_pattern, type_filter, results)


func create_node(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var parent_path: String = params.get("parent_path", "")
	var node_type: String = params.get("node_type", "")
	var scene_path: String = params.get("scene_path", "")
	var node_name: String = params.get("node_name", "")
	var properties: Dictionary = params.get("properties", {})

	if parent_path.is_empty():
		return _error("INVALID_PARAMS", "parent_path is required")
	if node_name.is_empty():
		return _error("INVALID_PARAMS", "node_name is required")
	if node_type.is_empty() and scene_path.is_empty():
		return _error("INVALID_PARAMS", "Either node_type or scene_path is required")
	if not node_type.is_empty() and not scene_path.is_empty():
		return _error("INVALID_PARAMS", "Provide node_type OR scene_path, not both")

	var parent := _get_node(parent_path)
	if not parent:
		return _error("NODE_NOT_FOUND", "Parent node not found: %s" % parent_path)

	var node: Node
	if not scene_path.is_empty():
		if not ResourceLoader.exists(scene_path):
			return _error("SCENE_NOT_FOUND", "Scene not found: %s" % scene_path)
		var packed_scene: PackedScene = load(scene_path)
		if not packed_scene:
			return _error("LOAD_FAILED", "Failed to load scene: %s" % scene_path)
		node = packed_scene.instantiate(PackedScene.GEN_EDIT_STATE_INSTANCE)
		if not node:
			return _error("INSTANTIATE_FAILED", "Failed to instantiate: %s" % scene_path)
	else:
		if not ClassDB.class_exists(node_type):
			return _error("INVALID_TYPE", "Unknown node type: %s" % node_type)
		node = ClassDB.instantiate(node_type)
		if not node:
			return _error("CREATE_FAILED", "Failed to create node of type: %s" % node_type)

	node.name = node_name

	for key in properties:
		if node.has_method("set") and key in node:
			var deserialized := MCPUtils.deserialize_value(properties[key])
			node.set(key, deserialized)

	parent.add_child(node)
	var scene_root := EditorInterface.get_edited_scene_root()
	_set_owner_recursive(node, scene_root)

	return _success({"node_path": str(scene_root.get_path_to(node))})


func _set_owner_recursive(node: Node, owner: Node) -> void:
	node.owner = owner
	for child in node.get_children():
		_set_owner_recursive(child, owner)


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

	if new_parent == node or node.is_ancestor_of(new_parent):
		return _error("INVALID_REPARENT", "Cannot reparent a node to itself or its descendant")

	node.reparent(new_parent)

	return _success({"new_path": str(root.get_path_to(node))})


func connect_signal(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var node_path: String = params.get("node_path", "")
	var signal_name: String = params.get("signal_name", "")
	var target_path: String = params.get("target_path", "")
	var method_name: String = params.get("method_name", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if signal_name.is_empty():
		return _error("INVALID_PARAMS", "signal_name is required")
	if target_path.is_empty():
		return _error("INVALID_PARAMS", "target_path is required")
	if method_name.is_empty():
		return _error("INVALID_PARAMS", "method_name is required")

	var source_node := _get_node(node_path)
	if not source_node:
		return _error("NODE_NOT_FOUND", "Source node not found: %s" % node_path)

	var target_node := _get_node(target_path)
	if not target_node:
		return _error("NODE_NOT_FOUND", "Target node not found: %s" % target_path)

	if not source_node.has_signal(signal_name):
		return _error("SIGNAL_NOT_FOUND", "Signal '%s' not found on node %s" % [signal_name, node_path])

	if source_node.is_connected(signal_name, Callable(target_node, method_name)):
		return _error("ALREADY_CONNECTED", "Signal '%s' is already connected to %s.%s()" % [signal_name, target_path, method_name])

	var err := source_node.connect(signal_name, Callable(target_node, method_name), CONNECT_PERSIST)
	if err != OK:
		return _error("CONNECT_FAILED", "Failed to connect signal: %s" % error_string(err))

	EditorInterface.mark_scene_as_unsaved()

	return _success({})


