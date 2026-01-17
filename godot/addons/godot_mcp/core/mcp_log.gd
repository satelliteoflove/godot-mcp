@tool
class_name MCPLog
extends RefCounted

const PREFIX := "[godot-mcp] "

static func info(message: String) -> void:
	print(PREFIX + message)

static func warn(message: String) -> void:
	push_warning(PREFIX + message)

static func error(message: String) -> void:
	push_error(PREFIX + message)
