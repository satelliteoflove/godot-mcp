@tool
extends RefCounted
class_name MCPCommandRouter

const SceneCommands := preload("res://addons/godot_mcp/commands/scene_commands.gd")
const NodeCommands := preload("res://addons/godot_mcp/commands/node_commands.gd")
const ScriptCommands := preload("res://addons/godot_mcp/commands/script_commands.gd")
const EditorCommands := preload("res://addons/godot_mcp/commands/editor_commands.gd")

var _plugin: EditorPlugin
var _scene_commands: SceneCommands
var _node_commands: NodeCommands
var _script_commands: ScriptCommands
var _editor_commands: EditorCommands


func setup(plugin: EditorPlugin) -> void:
	_plugin = plugin
	_scene_commands = SceneCommands.new()
	_node_commands = NodeCommands.new()
	_script_commands = ScriptCommands.new()
	_editor_commands = EditorCommands.new()


func handle_command(command: String, params: Dictionary) -> Dictionary:
	match command:
		"get_scene_tree":
			return _scene_commands.get_scene_tree(params)
		"get_current_scene":
			return _scene_commands.get_current_scene(params)
		"open_scene":
			return _scene_commands.open_scene(params)
		"save_scene":
			return _scene_commands.save_scene(params)
		"create_scene":
			return _scene_commands.create_scene(params)

		"get_node_properties":
			return _node_commands.get_node_properties(params)
		"create_node":
			return _node_commands.create_node(params)
		"update_node":
			return _node_commands.update_node(params)
		"delete_node":
			return _node_commands.delete_node(params)
		"reparent_node":
			return _node_commands.reparent_node(params)

		"get_script":
			return _script_commands.get_script(params)
		"get_current_script":
			return _script_commands.get_current_script(params)
		"create_script":
			return _script_commands.create_script(params)
		"edit_script":
			return _script_commands.edit_script(params)
		"attach_script":
			return _script_commands.attach_script(params)
		"detach_script":
			return _script_commands.detach_script(params)

		"get_editor_state":
			return _editor_commands.get_editor_state(params)
		"get_selected_nodes":
			return _editor_commands.get_selected_nodes(params)
		"select_node":
			return _editor_commands.select_node(params)
		"run_project":
			return _editor_commands.run_project(params)
		"stop_project":
			return _editor_commands.stop_project(params)
		"get_debug_output":
			return _editor_commands.get_debug_output(params)
		"get_project_info":
			return _editor_commands.get_project_info(params)
		"list_project_files":
			return _editor_commands.list_project_files(params)
		"search_files":
			return _editor_commands.search_files(params)
		"get_project_settings":
			return _editor_commands.get_project_settings(params)

		_:
			return _error("UNKNOWN_COMMAND", "Unknown command: %s" % command)


func _error(code: String, message: String) -> Dictionary:
	return {
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	}
