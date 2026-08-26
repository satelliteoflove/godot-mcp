@tool
extends MCPBaseCommand
class_name MCPSystemCommands


const RESTART_ACK_GRACE_SEC := 0.3
const RESCAN_TIMEOUT_SEC := 60


func get_commands() -> Dictionary:
	return {
		"mcp_handshake": mcp_handshake,
		"heartbeat": heartbeat,
		"restart_editor": restart_editor,
		"rescan_filesystem": rescan_filesystem,
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


# Make the editor pick up assets written to disk by something other than the
# editor (a PNG, .tres, font, ...) without a restart (#350). The editor only
# scans on focus or startup, neither reachable from the bridge, so a freshly
# written texture has no .import sidecar yet and any scene that references it
# loads with an empty resource. scan() detects new and changed files and runs
# their imports; waiting for is_scanning() to clear means the next open/reload
# sees the imported result. Existing assets that changed on disk but were not
# picked up by the scan can be forced through with `paths`.
func rescan_filesystem(params: Dictionary) -> Dictionary:
	var paths: Array = params.get("paths", [])
	var efs := EditorInterface.get_resource_filesystem()
	if efs == null:
		return _error("NO_FILESYSTEM", "EditorFileSystem is not available")

	var reimport: PackedStringArray = []
	var missing: Array[String] = []
	for p in paths:
		var local := ProjectSettings.localize_path(str(p))
		if FileAccess.file_exists(local):
			reimport.append(local)
		else:
			missing.append(local)
	if not missing.is_empty():
		return _error("FILE_NOT_FOUND", "Cannot reimport, file(s) not found: %s" % ", ".join(missing))

	var start := Time.get_ticks_msec()
	efs.scan()
	# scan() either runs synchronously or kicks off a thread with is_scanning()
	# already true, so polling from here is safe. Imports run on the main thread
	# after the walk finishes and is_scanning() stays true until they are done.
	while efs.is_scanning():
		if (Time.get_ticks_msec() - start) / 1000.0 > RESCAN_TIMEOUT_SEC:
			return _error("SCAN_TIMEOUT",
				"Filesystem scan did not finish within %ds; the editor may still be importing." % RESCAN_TIMEOUT_SEC)
		await Engine.get_main_loop().process_frame

	if not reimport.is_empty():
		efs.reimport_files(reimport)

	return _success({
		"scanned": true,
		"reimported": Array(reimport),
		"duration_ms": Time.get_ticks_msec() - start,
	})


func _get_addon_version() -> String:
	var config := ConfigFile.new()
	var err := config.load("res://addons/godot_mcp/plugin.cfg")
	if err == OK:
		return config.get_value("plugin", "version", "unknown")
	return "unknown"
