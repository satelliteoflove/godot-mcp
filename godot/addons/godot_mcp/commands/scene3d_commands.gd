@tool
extends MCPBaseCommand
class_name MCPScene3DCommands
## godot_scene3d. While a game is running, both actions read the running
## game's live tree through the game bridge, so geometry spawned or filled in
## at runtime is measured (#405), the same way node find switches. Otherwise
## they read the scene open in the editor. Every result carries
## source: "game" | "editor" so the agent knows which tree it got.

const SpatialQuery := preload("res://addons/godot_mcp/game_bridge/spatial_query.gd")

# A game that is playing but whose bridge hasn't announced ready yet (an F5
# launch moments ago) gets this long before we give up rather than silently
# reading the editor scene instead.
const READY_TIMEOUT := 5.0
const GAME_TIMEOUT := 10.0


func get_commands() -> Dictionary:
	return {
		"get_spatial_info": get_spatial_info,
		"get_scene_bounds": get_scene_bounds,
	}


func get_spatial_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	if EditorInterface.is_playing_scene():
		return await _query_game("get_spatial_info", params)

	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	return _finish(SpatialQuery.spatial_info(node, params, _editor_path), "editor")


func get_scene_bounds(params: Dictionary) -> Dictionary:
	if EditorInterface.is_playing_scene():
		return await _query_game("get_scene_bounds", params)

	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var root_path: String = params.get("root_path", "")
	var search_root: Node = EditorInterface.get_edited_scene_root()
	if not root_path.is_empty():
		search_root = _get_node(root_path)
		if not search_root:
			return _error("NODE_NOT_FOUND", "Root node not found: %s" % root_path)

	var result := SpatialQuery.scene_bounds(search_root, root_path if not root_path.is_empty() else "scene root")
	if not result.has("error"):
		result["root_path"] = _editor_path(search_root)
	return _finish(result, "editor")


# Editor nodes are reported as /root/<SceneRoot>/..., matching the paths the
# running game uses for the same nodes.
func _editor_path(node: Node) -> String:
	var scene_root := EditorInterface.get_edited_scene_root()
	var relative_path := scene_root.get_path_to(node)
	var usable_path := "/root/" + scene_root.name
	if relative_path != NodePath("."):
		usable_path += "/" + str(relative_path)
	return usable_path


func _finish(result: Dictionary, source: String) -> Dictionary:
	if result.has("error"):
		return _error(str(result.error), str(result.get("message", "")))
	result["source"] = source
	return _success(result)


func _query_game(msg_type: String, params: Dictionary) -> Dictionary:
	var debugger = _plugin.get_debugger_plugin() if _plugin else null
	if debugger == null:
		return _error("NO_SESSION", "No debugger plugin available")

	var start := Time.get_ticks_msec()
	while not debugger.is_bridge_ready():
		if not EditorInterface.is_playing_scene():
			return _error("GAME_EXITED", "The game exited before %s could run (stopped, quit, or crashed)" % msg_type)
		if (Time.get_ticks_msec() - start) / 1000.0 > READY_TIMEOUT:
			return _error("NO_SESSION",
				"A game is running but its MCP bridge did not report ready within %.0fs, " % READY_TIMEOUT +
				"so its live tree can't be read. Stop the game to query the editor scene instead.")
		await Engine.get_main_loop().process_frame

	if not debugger.send_game_message(msg_type, [params]):
		return _error("SEND_FAILED", "Failed to send message to game")

	start = Time.get_ticks_msec()
	while not debugger.has_response(msg_type):
		if not debugger.has_active_session():
			return _error("GAME_EXITED", "The game exited while waiting for %s (stopped, quit, or crashed)" % msg_type)
		if (Time.get_ticks_msec() - start) / 1000.0 > GAME_TIMEOUT:
			debugger.clear_response(msg_type)
			return _error("TIMEOUT", "Timed out waiting for %s response" % msg_type)
		await Engine.get_main_loop().process_frame

	var response = debugger.get_response(msg_type)
	debugger.clear_response(msg_type)
	if not response is Dictionary:
		return _error("GAME_ERROR", "Unexpected %s response from the game" % msg_type)
	return _finish(response, "game")
