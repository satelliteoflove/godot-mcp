@tool
extends EditorPlugin

const WebSocketServer := preload("res://addons/godot_mcp/websocket_server.gd")
const CommandRouter := preload("res://addons/godot_mcp/command_router.gd")
const StatusPanel := preload("res://addons/godot_mcp/ui/status_panel.tscn")
const MCPDebuggerPlugin := preload("res://addons/godot_mcp/core/mcp_debugger_plugin.gd")

const GAME_BRIDGE_AUTOLOAD := "MCPGameBridge"
const GAME_BRIDGE_PATH := "res://addons/godot_mcp/game_bridge/mcp_game_bridge.gd"

var _websocket_server: WebSocketServer
var _command_router: CommandRouter
var _status_panel: Control
var _debugger_plugin: MCPDebuggerPlugin


func _enter_tree() -> void:
	_command_router = CommandRouter.new()
	_command_router.setup(self)

	_websocket_server = WebSocketServer.new()
	_websocket_server.command_received.connect(_on_command_received)
	_websocket_server.client_connected.connect(_on_client_connected)
	_websocket_server.client_disconnected.connect(_on_client_disconnected)
	add_child(_websocket_server)

	_status_panel = StatusPanel.instantiate()
	add_control_to_bottom_panel(_status_panel, "MCP")
	_update_status("Waiting for connection...")

	_debugger_plugin = MCPDebuggerPlugin.new()
	add_debugger_plugin(_debugger_plugin)

	_ensure_game_bridge_autoload()

	_websocket_server.start_server()
	print("[godot-mcp] Plugin initialized")


func _exit_tree() -> void:
	if _status_panel:
		remove_control_from_bottom_panel(_status_panel)
		_status_panel.queue_free()

	if _websocket_server:
		_websocket_server.stop_server()
		_websocket_server.queue_free()

	if _debugger_plugin:
		remove_debugger_plugin(_debugger_plugin)
		_debugger_plugin = null

	if _command_router:
		_command_router.free()

	print("[godot-mcp] Plugin disabled")


func _ensure_game_bridge_autoload() -> void:
	if not ProjectSettings.has_setting("autoload/" + GAME_BRIDGE_AUTOLOAD):
		ProjectSettings.set_setting("autoload/" + GAME_BRIDGE_AUTOLOAD, GAME_BRIDGE_PATH)
		ProjectSettings.save()
		print("[godot-mcp] Added MCPGameBridge autoload")


func get_debugger_plugin() -> MCPDebuggerPlugin:
	return _debugger_plugin


func _on_command_received(id: String, command: String, params: Dictionary) -> void:
	var response = await _command_router.handle_command(command, params)
	response["id"] = id
	_websocket_server.send_response(response)


func _on_client_connected() -> void:
	_update_status("Connected")
	print("[godot-mcp] Client connected")


func _on_client_disconnected() -> void:
	_update_status("Disconnected")
	print("[godot-mcp] Client disconnected")


func _update_status(status: String) -> void:
	if _status_panel and _status_panel.has_method("set_status"):
		_status_panel.set_status(status)
