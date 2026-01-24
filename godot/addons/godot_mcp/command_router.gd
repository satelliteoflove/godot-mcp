@tool
extends RefCounted
class_name MCPCommandRouter

var _commands: Dictionary = {}
var _handlers: Array[MCPBaseCommand] = []


func setup(plugin: EditorPlugin) -> void:
	_register_handler(MCPSystemCommands.new(), plugin)
	_register_handler(MCPSceneCommands.new(), plugin)
	_register_handler(MCPNodeCommands.new(), plugin)
	_register_handler(MCPScriptCommands.new(), plugin)
	_register_handler(MCPSelectionCommands.new(), plugin)
	_register_handler(MCPProjectCommands.new(), plugin)
	_register_handler(MCPDebugCommands.new(), plugin)
	_register_handler(MCPScreenshotCommands.new(), plugin)
	_register_handler(MCPAnimationCommands.new(), plugin)
	_register_handler(MCPTilemapCommands.new(), plugin)
	_register_handler(MCPResourceCommands.new(), plugin)
	_register_handler(MCPScene3DCommands.new(), plugin)
	_register_handler(MCPInputCommands.new(), plugin)


func _register_handler(handler: MCPBaseCommand, plugin: EditorPlugin) -> void:
	handler.setup(plugin)
	_handlers.append(handler)
	var cmds := handler.get_commands()
	for cmd_name in cmds:
		_commands[cmd_name] = cmds[cmd_name]


func handle_command(command: String, params: Dictionary):
	if not _commands.has(command):
		return MCPUtils.error("UNKNOWN_COMMAND", "Unknown command: %s" % command)

	var callable: Callable = _commands[command]
	var result = await callable.call(params)
	return result
