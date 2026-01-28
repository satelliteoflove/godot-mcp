@tool
extends EditorPlugin

const WebSocketServer := preload("res://addons/godot_mcp/websocket_server.gd")
const CommandRouter := preload("res://addons/godot_mcp/command_router.gd")
const StatusPanel := preload("res://addons/godot_mcp/ui/status_panel.tscn")
const MCPDebuggerPlugin := preload("res://addons/godot_mcp/core/mcp_debugger_plugin.gd")

const GAME_BRIDGE_AUTOLOAD := "MCPGameBridge"
const GAME_BRIDGE_PATH := "res://addons/godot_mcp/game_bridge/mcp_game_bridge.gd"

const SETTING_BIND_MODE := "godot_mcp/bind_mode"
const SETTING_CUSTOM_BIND_IP := "godot_mcp/custom_bind_ip"
const SETTING_PORT_OVERRIDE_ENABLED := "godot_mcp/port_override_enabled"
const SETTING_PORT_OVERRIDE := "godot_mcp/port_override"

var _websocket_server: WebSocketServer
var _command_router: CommandRouter
var _status_panel: Control
var _debugger_plugin: MCPDebuggerPlugin
var _restart_timer: Timer

var _current_bind_address := MCPConstants.LOCALHOST_BIND_ADDRESS
var _current_bind_mode: MCPEnums.BindMode = MCPEnums.BindMode.LOCALHOST


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

	_debugger_plugin = MCPDebuggerPlugin.new()
	add_debugger_plugin(_debugger_plugin)

	_restart_timer = Timer.new()
	_restart_timer.one_shot = true
	_restart_timer.timeout.connect(_do_restart_server)
	add_child(_restart_timer)

	_ensure_game_bridge_autoload()
	_ensure_bind_settings()
	_setup_bind_ui()
	_setup_version_display()
	_apply_bind_settings(true)
	MCPLog.info("Plugin initialized")


func _exit_tree() -> void:
	if _restart_timer:
		_restart_timer.stop()
		_restart_timer.queue_free()

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
		_command_router = null  # RefCounted - freed automatically

	MCPLog.info("Plugin disabled")


func _ensure_bind_settings() -> void:
	if not ProjectSettings.has_setting(SETTING_BIND_MODE):
		ProjectSettings.set_setting(SETTING_BIND_MODE, MCPEnums.BindMode.LOCALHOST)
	if not ProjectSettings.has_setting(SETTING_CUSTOM_BIND_IP):
		ProjectSettings.set_setting(SETTING_CUSTOM_BIND_IP, "")
	if not ProjectSettings.has_setting(SETTING_PORT_OVERRIDE_ENABLED):
		ProjectSettings.set_setting(SETTING_PORT_OVERRIDE_ENABLED, false)
	if not ProjectSettings.has_setting(SETTING_PORT_OVERRIDE):
		ProjectSettings.set_setting(SETTING_PORT_OVERRIDE, WebSocketServer.DEFAULT_PORT)
	ProjectSettings.save()


func _setup_bind_ui() -> void:
	if not _status_panel:
		return
	if _status_panel.has_method("set_config"):
		_status_panel.set_config(_get_bind_mode(), _get_custom_bind_ip(), _get_port_override_enabled(), _get_port_override())
	if _status_panel.has_signal("config_applied") and not _status_panel.config_applied.is_connected(_on_config_applied):
		_status_panel.config_applied.connect(_on_config_applied)


func _get_bind_mode() -> MCPEnums.BindMode:
	return ProjectSettings.get_setting(SETTING_BIND_MODE, MCPEnums.BindMode.LOCALHOST) as MCPEnums.BindMode


func _get_custom_bind_ip() -> String:
	return str(ProjectSettings.get_setting(SETTING_CUSTOM_BIND_IP, ""))


func _get_port_override_enabled() -> bool:
	return bool(ProjectSettings.get_setting(SETTING_PORT_OVERRIDE_ENABLED, false))


func _get_port_override() -> int:
	var raw_value := ProjectSettings.get_setting(SETTING_PORT_OVERRIDE, WebSocketServer.DEFAULT_PORT)
	var port := int(raw_value)
	if port < MCPConstants.PORT_MIN or port > MCPConstants.PORT_MAX:
		MCPLog.warn("Invalid port override '%s'; falling back to default port %d" % [str(raw_value), WebSocketServer.DEFAULT_PORT])
		return WebSocketServer.DEFAULT_PORT
	return port


func _get_listen_port() -> int:
	return _get_port_override() if _get_port_override_enabled() else WebSocketServer.DEFAULT_PORT


func _resolve_bind_address() -> String:
	match _get_bind_mode():
		MCPEnums.BindMode.WSL:
			var ip := _get_wsl_vethernet_ipv4()
			if ip.is_empty():
				MCPLog.warn("WSL bind mode selected but vEthernet (WSL) IPv4 was not found; falling back to %s" % MCPConstants.LOCALHOST_BIND_ADDRESS)
				return MCPConstants.LOCALHOST_BIND_ADDRESS
			return ip
		MCPEnums.BindMode.CUSTOM:
			var ip := _get_custom_bind_ip().strip_edges()
			if ip.is_empty():
				MCPLog.warn("Custom bind mode selected but no IP was configured; falling back to %s" % MCPConstants.LOCALHOST_BIND_ADDRESS)
				return MCPConstants.LOCALHOST_BIND_ADDRESS
			if not _is_valid_ipv4(ip):
				MCPLog.warn("Custom bind mode selected but IP '%s' is not a valid IPv4 address; falling back to %s" % [ip, MCPConstants.LOCALHOST_BIND_ADDRESS])
				return MCPConstants.LOCALHOST_BIND_ADDRESS
			return ip
		_:
			return MCPConstants.LOCALHOST_BIND_ADDRESS


func _is_valid_ipv4(ip: String) -> bool:
	var s := ip.strip_edges()
	if s.is_empty():
		return false
	var parts := s.split(".")
	if parts.size() != 4:
		return false
	for p in parts:
		if p.is_empty() or not p.is_valid_int():
			return false
		var n := int(p)
		if n < 0 or n > 255:
			return false
	return true


func _is_valid_bind_address(ip: String) -> bool:
	if ip == "0.0.0.0" or ip == "127.0.0.1" or ip == "::" or ip == "::1":
		return true

	var local_ips := IP.get_local_addresses()
	return ip in local_ips


func _get_wsl_vethernet_ipv4() -> String:
	# Autodetect "vEthernet (WSL)" IPv4 via PowerShell (Windows only).
	if OS.get_name() != "Windows":
		return ""

	var output := []
	# Use ErrorAction Stop + catch so failures return an empty string and don't emit noisy errors.
	# Match any adapter alias that contains "WSL" to be resilient to name variations.
	# Note: The wildcard pattern 'vEthernet*WSL*' provides flexibility but may match
	# unexpected adapters in custom network configurations. Document expected adapter names.
	# SECURITY NOTE: Keep this PowerShell command as a fixed string literal. Do NOT concatenate
	# user input, project settings, environment variables, or any other external data into it,
	# as that could introduce command injection vulnerabilities. If dynamic behavior is needed,
	# implement strict validation and avoid direct string interpolation into PowerShell.
	var cmd := "try { $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $_.InterfaceAlias -like 'vEthernet*WSL*' } | Select-Object -First 1 -ExpandProperty IPAddress); if ($ip) { $ip } else { '' } } catch { '' }"
	var args := ["-NoProfile", "-Command", cmd]
	var code := OS.execute("powershell", args, output, false)
	if code != 0 or output.is_empty():
		return ""

	var text := String(output[0]).replace("\r", "")
	for line in text.split("\n"):
		var candidate := String(line).strip_edges()
		if _is_valid_ipv4(candidate):
			return candidate
	return ""


func _restart_server() -> void:
	# Debounce: stop any pending restart and schedule a new one
	if _websocket_server:
		_websocket_server.stop_server()
	_restart_timer.start(0.1)


func _do_restart_server() -> void:
	if not is_inside_tree() or not _websocket_server:
		return

	var bind := _resolve_bind_address()

	# Verify IP is local
	if not _is_valid_bind_address(bind):
		MCPLog.error("IP '%s' is not assigned to any local network interface. Aborting bind." % bind)
		MCPLog.warn("Please check your IP configuration and local network interfaces.")
		_update_status("Error: IP %s not found on this machine" % bind)
		return

	var port := _get_listen_port()
	_current_bind_address = bind
	_current_bind_mode = _get_bind_mode()
	var mode_name := MCPEnums.get_mode_name(_current_bind_mode)

	var err := _websocket_server.start_server(port, bind)
	if err != OK:
		_update_status("Failed to bind %s:%d (%s)" % [bind, port, error_string(err)])
		return

	_update_status("Waiting for connection... (bind %s:%d [%s])" % [bind, port, mode_name])
	MCPLog.info("Server listening on %s:%d [%s]" % [bind, port, mode_name])


func _apply_bind_settings(restart: bool) -> void:
	_current_bind_address = _resolve_bind_address()
	_current_bind_mode = _get_bind_mode()
	if restart:
		_restart_server()
	else:
		_update_status("Waiting for connection... (bind %s:%d [%s])" % [_current_bind_address, _get_listen_port(), MCPEnums.get_mode_name(_current_bind_mode)])


func _on_config_applied(config: Dictionary) -> void:
	ProjectSettings.set_setting(SETTING_BIND_MODE, config.get("bind_mode", MCPEnums.BindMode.LOCALHOST))
	ProjectSettings.set_setting(SETTING_CUSTOM_BIND_IP, str(config.get("custom_ip", "")))
	ProjectSettings.set_setting(SETTING_PORT_OVERRIDE_ENABLED, bool(config.get("port_override_enabled", false)))
	ProjectSettings.set_setting(SETTING_PORT_OVERRIDE, int(config.get("port_override", WebSocketServer.DEFAULT_PORT)))
	ProjectSettings.save()
	_apply_bind_settings(true)


func _ensure_game_bridge_autoload() -> void:
	if not ProjectSettings.has_setting("autoload/" + GAME_BRIDGE_AUTOLOAD):
		ProjectSettings.set_setting("autoload/" + GAME_BRIDGE_AUTOLOAD, GAME_BRIDGE_PATH)
		ProjectSettings.save()
		MCPLog.info("Added MCPGameBridge autoload")


func get_debugger_plugin() -> MCPDebuggerPlugin:
	return _debugger_plugin


func _on_command_received(id: String, command: String, params: Dictionary) -> void:
	var response = await _command_router.handle_command(command, params)
	response["id"] = id
	_websocket_server.send_response(response)


func _on_client_connected() -> void:
	var host_info := ""
	if _websocket_server.get_connected_host():
		host_info = " from %s:%d" % [_websocket_server.get_connected_host(), _websocket_server.get_connected_port()]
	var bind_info := "(%s: %s:%d)" % [MCPEnums.get_mode_name(_current_bind_mode), _current_bind_address, _get_listen_port()]
	_update_status("Connected%s %s" % [host_info, bind_info])
	MCPLog.info("Client connected%s %s" % [host_info, bind_info])


func _on_client_disconnected() -> void:
	_update_status("Disconnected")
	if _status_panel and _status_panel.has_method("clear_server_version"):
		_status_panel.clear_server_version()
	MCPLog.info("Client disconnected")


func _update_status(status: String) -> void:
	if _status_panel and _status_panel.has_method("set_status"):
		_status_panel.set_status(status)


func _setup_version_display() -> void:
	if _status_panel and _status_panel.has_method("set_addon_version"):
		_status_panel.set_addon_version(_get_addon_version())


func _get_addon_version() -> String:
	var config := ConfigFile.new()
	var err := config.load("res://addons/godot_mcp/plugin.cfg")
	if err == OK:
		return config.get_value("plugin", "version", "")
	return ""


func on_server_version_received(version: String) -> void:
	if _status_panel and _status_panel.has_method("set_server_version"):
		_status_panel.set_server_version(version)
