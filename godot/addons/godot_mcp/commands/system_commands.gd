@tool
extends MCPBaseCommand
class_name MCPSystemCommands


const RESTART_ACK_GRACE_SEC := 0.3


func get_commands() -> Dictionary:
	return {
		"mcp_handshake": mcp_handshake,
		"heartbeat": heartbeat,
		"restart_editor": restart_editor,
	}


func mcp_handshake(params: Dictionary) -> Dictionary:
	var server_version: String = params.get("server_version", "unknown")

	if _plugin and _plugin.has_method("on_server_version_received"):
		_plugin.on_server_version_received(server_version)

	return _success({
		"addon_version": _get_addon_version(),
		"godot_version": Engine.get_version_info()["string"],
		"project_path": ProjectSettings.globalize_path("res://"),
		"project_name": ProjectSettings.get_setting("application/config/name", ""),
		"server_version_received": server_version
	})


func heartbeat(_params: Dictionary) -> Dictionary:
	return _success({"status": "ok"})


func restart_editor(params: Dictionary) -> Dictionary:
	var save: bool = params.get("save", true)

	# Restarting tears down this websocket along with the editor, so defer the
	# actual restart by a short grace period. That lets this acknowledgement
	# flush to the client first; the MCP server then auto-reconnects once the
	# editor is back. (EditorInterface.restart_editor itself defers the quit to
	# end-of-frame, which alone is too early for the response to make it out.)
	var tree := Engine.get_main_loop() as SceneTree
	if tree:
		tree.create_timer(RESTART_ACK_GRACE_SEC).timeout.connect(
			func() -> void: EditorInterface.restart_editor(save)
		)
	else:
		EditorInterface.restart_editor(save)

	return _success({"restarting": true, "save": save})


func _get_addon_version() -> String:
	var config := ConfigFile.new()
	var err := config.load("res://addons/godot_mcp/plugin.cfg")
	if err == OK:
		return config.get_value("plugin", "version", "unknown")
	return "unknown"
