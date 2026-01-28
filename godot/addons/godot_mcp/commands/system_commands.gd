@tool
extends MCPBaseCommand
class_name MCPSystemCommands


func get_commands() -> Dictionary:
	return {
		"mcp_handshake": mcp_handshake,
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


func _get_addon_version() -> String:
	var config := ConfigFile.new()
	var err := config.load("res://addons/godot_mcp/plugin.cfg")
	if err == OK:
		return config.get_value("plugin", "version", "unknown")
	return "unknown"
