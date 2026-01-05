@tool
class_name MCPBaseCommand
extends RefCounted

var _plugin: EditorPlugin


func setup(plugin: EditorPlugin) -> void:
	_plugin = plugin


func get_commands() -> Dictionary:
	return {}


func _success(result: Dictionary) -> Dictionary:
	return MCPUtils.success(result)


func _error(code: String, message: String) -> Dictionary:
	return MCPUtils.error(code, message)


func _get_node(path: String) -> Node:
	return MCPUtils.get_node_from_path(path)


func _serialize_value(value: Variant) -> Variant:
	return MCPUtils.serialize_value(value)


func _require_scene_open() -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")
	return {}


func _require_typed_node(path: String, type: String, type_error_code: String = "WRONG_TYPE") -> Variant:
	var node := _get_node(path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % path)
	if not node.is_class(type):
		return _error(type_error_code, "Expected %s, got %s" % [type, node.get_class()])
	return node


func _find_nodes_of_type(root: Node, type: String) -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	var scene_root := EditorInterface.get_edited_scene_root()
	if scene_root:
		_find_nodes_recursive(root, type, result, scene_root)
	return result


func _find_nodes_recursive(node: Node, type: String, result: Array[Dictionary], scene_root: Node) -> void:
	if node.is_class(type):
		result.append({"path": str(scene_root.get_path_to(node)), "name": node.name})
	for child in node.get_children():
		_find_nodes_recursive(child, type, result, scene_root)
