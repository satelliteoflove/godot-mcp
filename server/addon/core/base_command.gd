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
