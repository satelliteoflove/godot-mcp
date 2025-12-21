@tool
extends RefCounted
class_name MCPCommandRouter

var _commands: Dictionary = {}
var _handlers: Array[MCPBaseCommand] = []


func setup(_plugin: EditorPlugin) -> void:
	_register_handler(MCPSceneCommands.new())
	_register_handler(MCPNodeCommands.new())
	_register_handler(MCPScriptCommands.new())
	_register_handler(MCPSelectionCommands.new())
	_register_handler(MCPProjectCommands.new())
	_register_handler(MCPFileCommands.new())
	_register_handler(MCPDebugCommands.new())
	_register_handler(MCPScreenshotCommands.new())
	_register_handler(MCPAnimationCommands.new())
	_register_handler(MCPTilemapCommands.new())


func _register_handler(handler: MCPBaseCommand) -> void:
	_handlers.append(handler)
	var cmds := handler.get_commands()
	for cmd_name in cmds:
		_commands[cmd_name] = cmds[cmd_name]


func handle_command(command: String, params: Dictionary) -> Dictionary:
	if not _commands.has(command):
		return MCPUtils.error("UNKNOWN_COMMAND", "Unknown command: %s" % command)

	var callable: Callable = _commands[command]
	return callable.call(params)
