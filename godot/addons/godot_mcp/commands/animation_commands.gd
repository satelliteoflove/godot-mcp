@tool
extends MCPBaseCommand
class_name MCPAnimationCommands


const TRACK_TYPE_MAP := {
	"value": Animation.TYPE_VALUE,
	"position_3d": Animation.TYPE_POSITION_3D,
	"rotation_3d": Animation.TYPE_ROTATION_3D,
	"scale_3d": Animation.TYPE_SCALE_3D,
	"blend_shape": Animation.TYPE_BLEND_SHAPE,
	"method": Animation.TYPE_METHOD,
	"bezier": Animation.TYPE_BEZIER,
	"audio": Animation.TYPE_AUDIO,
	"animation": Animation.TYPE_ANIMATION
}

const LOOP_MODE_MAP := {
	"none": Animation.LOOP_NONE,
	"linear": Animation.LOOP_LINEAR,
	"pingpong": Animation.LOOP_PINGPONG
}


func get_commands() -> Dictionary:
	return {
		"list_animation_players": list_animation_players,
		"get_animation_player_info": get_animation_player_info,
		"get_animation_details": get_animation_details,
		"get_track_keyframes": get_track_keyframes,
		"play_animation": play_animation,
		"stop_animation": stop_animation,
		"seek_animation": seek_animation,
		"create_animation": create_animation,
		"delete_animation": delete_animation,
		"update_animation_properties": update_animation_properties,
		"add_animation_track": add_animation_track,
		"remove_animation_track": remove_animation_track,
		"add_keyframe": add_keyframe,
		"remove_keyframe": remove_keyframe,
		"update_keyframe": update_keyframe
	}


func _get_animation_player(node_path: String) -> AnimationPlayer:
	var node := _get_node(node_path)
	if not node:
		return null
	if not node is AnimationPlayer:
		return null
	return node as AnimationPlayer


func _get_animation(player: AnimationPlayer, anim_name: String) -> Animation:
	if not player.has_animation(anim_name):
		return null
	return player.get_animation(anim_name)


func _track_type_to_string(track_type: int) -> String:
	for key in TRACK_TYPE_MAP:
		if TRACK_TYPE_MAP[key] == track_type:
			return key
	return "unknown"


func _loop_mode_to_string(loop_mode: int) -> String:
	for key in LOOP_MODE_MAP:
		if LOOP_MODE_MAP[key] == loop_mode:
			return key
	return "none"


func _find_animation_players(node: Node, result: Array, root: Node) -> void:
	if node is AnimationPlayer:
		var relative_path := str(root.get_path_to(node))
		result.append({
			"path": relative_path,
			"name": node.name
		})
	for child in node.get_children():
		_find_animation_players(child, result, root)


func list_animation_players(params: Dictionary) -> Dictionary:
	var root_path: String = params.get("root_path", "")
	var root: Node

	if root_path.is_empty():
		root = EditorInterface.get_edited_scene_root()
	else:
		root = _get_node(root_path)

	if not root:
		return _error("NODE_NOT_FOUND", "Root node not found")

	var players := []
	_find_animation_players(root, players, root)

	return _success({"animation_players": players})


func get_animation_player_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer: %s" % node_path)

	var libraries := {}
	for lib_name in player.get_animation_library_list():
		var lib := player.get_animation_library(lib_name)
		libraries[lib_name] = Array(lib.get_animation_list())

	return _success({
		"current_animation": player.current_animation,
		"is_playing": player.is_playing(),
		"current_position": player.current_animation_position,
		"speed_scale": player.speed_scale,
		"libraries": libraries,
		"animation_count": player.get_animation_list().size()
	})


func get_animation_details(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	var tracks := []
	for i in range(anim.get_track_count()):
		tracks.append({
			"index": i,
			"type": _track_type_to_string(anim.track_get_type(i)),
			"path": str(anim.track_get_path(i)),
			"interpolation": anim.track_get_interpolation_type(i),
			"keyframe_count": anim.track_get_key_count(i)
		})

	var lib_name := ""
	var pure_name := anim_name
	if "/" in anim_name:
		var parts := anim_name.split("/", true, 1)
		lib_name = parts[0]
		pure_name = parts[1]

	return _success({
		"name": pure_name,
		"library": lib_name,
		"length": anim.length,
		"loop_mode": _loop_mode_to_string(anim.loop_mode),
		"step": anim.step,
		"track_count": anim.get_track_count(),
		"tracks": tracks
	})


func get_track_keyframes(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_index: int = params.get("track_index", -1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_index < 0:
		return _error("INVALID_PARAMS", "track_index is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	if track_index >= anim.get_track_count():
		return _error("TRACK_NOT_FOUND", "Track index out of range: %d" % track_index)

	var keyframes := []
	var track_type := anim.track_get_type(track_index)

	for i in range(anim.track_get_key_count(track_index)):
		var kf := {
			"time": anim.track_get_key_time(track_index, i),
			"transition": anim.track_get_key_transition(track_index, i)
		}

		match track_type:
			Animation.TYPE_METHOD:
				kf["method"] = anim.method_track_get_name(track_index, i)
				kf["args"] = anim.method_track_get_params(track_index, i)
			Animation.TYPE_BEZIER:
				kf["value"] = anim.bezier_track_get_key_value(track_index, i)
				kf["in_handle"] = _serialize_value(anim.bezier_track_get_key_in_handle(track_index, i))
				kf["out_handle"] = _serialize_value(anim.bezier_track_get_key_out_handle(track_index, i))
			_:
				kf["value"] = _serialize_value(anim.track_get_key_value(track_index, i))

		keyframes.append(kf)

	return _success({
		"track_path": str(anim.track_get_path(track_index)),
		"track_type": _track_type_to_string(track_type),
		"keyframes": keyframes
	})


func play_animation(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var custom_blend: float = params.get("custom_blend", -1.0)
	var custom_speed: float = params.get("custom_speed", 1.0)
	var from_end: bool = params.get("from_end", false)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	if not player.has_animation(anim_name):
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	player.play(anim_name, custom_blend, custom_speed, from_end)

	return _success({"playing": anim_name, "from_position": player.current_animation_position})


func stop_animation(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var keep_state: bool = params.get("keep_state", false)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	player.stop(keep_state)

	return _success({"stopped": true})


func seek_animation(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var seconds: float = params.get("seconds", 0.0)
	var update: bool = params.get("update", true)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("seconds"):
		return _error("INVALID_PARAMS", "seconds is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	player.seek(seconds, update)

	return _success({"position": player.current_animation_position})


func create_animation(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var lib_name: String = params.get("library_name", "")
	var length: float = params.get("length", 1.0)
	var loop_mode: String = params.get("loop_mode", "none")
	var step: float = params.get("step", 0.1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var lib: AnimationLibrary
	if player.has_animation_library(lib_name):
		lib = player.get_animation_library(lib_name)
	else:
		lib = AnimationLibrary.new()
		player.add_animation_library(lib_name, lib)

	if lib.has_animation(anim_name):
		return _error("ANIMATION_EXISTS", "Animation already exists: %s" % anim_name)

	var anim := Animation.new()
	anim.length = length
	if LOOP_MODE_MAP.has(loop_mode):
		anim.loop_mode = LOOP_MODE_MAP[loop_mode]
	anim.step = step

	var err := lib.add_animation(anim_name, anim)
	if err != OK:
		return _error("CREATE_FAILED", "Failed to create animation: %s" % error_string(err))

	return _success({"created": anim_name, "library": lib_name})


func delete_animation(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var lib_name: String = params.get("library_name", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	if not player.has_animation_library(lib_name):
		return _error("LIBRARY_NOT_FOUND", "Animation library not found: %s" % lib_name)

	var lib := player.get_animation_library(lib_name)
	if not lib.has_animation(anim_name):
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	lib.remove_animation(anim_name)

	return _success({"deleted": anim_name})


func update_animation_properties(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	var updated := {}

	if params.has("length"):
		anim.length = params["length"]
		updated["length"] = anim.length

	if params.has("loop_mode"):
		var loop_str: String = params["loop_mode"]
		if LOOP_MODE_MAP.has(loop_str):
			anim.loop_mode = LOOP_MODE_MAP[loop_str]
			updated["loop_mode"] = loop_str

	if params.has("step"):
		anim.step = params["step"]
		updated["step"] = anim.step

	return _success({"updated": anim_name, "properties": updated})


func add_animation_track(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_type: String = params.get("track_type", "")
	var track_path: String = params.get("track_path", "")
	var insert_at: int = params.get("insert_at", -1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_type.is_empty():
		return _error("INVALID_PARAMS", "track_type is required")
	if track_path.is_empty():
		return _error("INVALID_PARAMS", "track_path is required")

	if not TRACK_TYPE_MAP.has(track_type):
		return _error("INVALID_TRACK_TYPE", "Invalid track type: %s. Valid types: %s" % [track_type, ", ".join(TRACK_TYPE_MAP.keys())])

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	var godot_track_type: int = TRACK_TYPE_MAP[track_type]
	var track_index: int

	if insert_at >= 0:
		track_index = anim.add_track(godot_track_type, insert_at)
	else:
		track_index = anim.add_track(godot_track_type)

	anim.track_set_path(track_index, track_path)

	return _success({
		"track_index": track_index,
		"track_path": track_path,
		"track_type": track_type
	})


func remove_animation_track(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_index: int = params.get("track_index", -1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_index < 0:
		return _error("INVALID_PARAMS", "track_index is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	if track_index >= anim.get_track_count():
		return _error("TRACK_NOT_FOUND", "Track index out of range: %d" % track_index)

	anim.remove_track(track_index)

	return _success({"removed_track": track_index})


func add_keyframe(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_index: int = params.get("track_index", -1)
	var time: float = params.get("time", 0.0)
	var transition: float = params.get("transition", 1.0)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_index < 0:
		return _error("INVALID_PARAMS", "track_index is required")
	if not params.has("time"):
		return _error("INVALID_PARAMS", "time is required")
	if not params.has("value"):
		return _error("INVALID_PARAMS", "value is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	if track_index >= anim.get_track_count():
		return _error("TRACK_NOT_FOUND", "Track index out of range: %d" % track_index)

	var value = MCPUtils.deserialize_value(params["value"])
	var track_type := anim.track_get_type(track_index)
	var key_index: int

	match track_type:
		Animation.TYPE_BEZIER:
			key_index = anim.bezier_track_insert_key(track_index, time, value)
		Animation.TYPE_METHOD:
			var method_name: String = params.get("method_name", "")
			var args: Array = params.get("args", [])
			key_index = anim.method_track_add_key(track_index, time, method_name, args)
		_:
			key_index = anim.track_insert_key(track_index, time, value, transition)

	return _success({
		"keyframe_index": key_index,
		"time": time,
		"value": _serialize_value(value)
	})


func remove_keyframe(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_index: int = params.get("track_index", -1)
	var keyframe_index: int = params.get("keyframe_index", -1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_index < 0:
		return _error("INVALID_PARAMS", "track_index is required")
	if keyframe_index < 0:
		return _error("INVALID_PARAMS", "keyframe_index is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	if track_index >= anim.get_track_count():
		return _error("TRACK_NOT_FOUND", "Track index out of range: %d" % track_index)

	if keyframe_index >= anim.track_get_key_count(track_index):
		return _error("KEYFRAME_NOT_FOUND", "Keyframe index out of range: %d" % keyframe_index)

	anim.track_remove_key(track_index, keyframe_index)

	return _success({"removed_keyframe": keyframe_index, "track_index": track_index})


func update_keyframe(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")
	var track_index: int = params.get("track_index", -1)
	var keyframe_index: int = params.get("keyframe_index", -1)

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if anim_name.is_empty():
		return _error("INVALID_PARAMS", "animation_name is required")
	if track_index < 0:
		return _error("INVALID_PARAMS", "track_index is required")
	if keyframe_index < 0:
		return _error("INVALID_PARAMS", "keyframe_index is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var anim := _get_animation(player, anim_name)
	if not anim:
		return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)

	if track_index >= anim.get_track_count():
		return _error("TRACK_NOT_FOUND", "Track index out of range: %d" % track_index)

	if keyframe_index >= anim.track_get_key_count(track_index):
		return _error("KEYFRAME_NOT_FOUND", "Keyframe index out of range: %d" % keyframe_index)

	var result := {}

	if params.has("time"):
		var new_time: float = params["time"]
		var old_value = anim.track_get_key_value(track_index, keyframe_index)
		var old_transition := anim.track_get_key_transition(track_index, keyframe_index)
		anim.track_remove_key(track_index, keyframe_index)
		keyframe_index = anim.track_insert_key(track_index, new_time, old_value, old_transition)
		result["time"] = new_time
		result["keyframe_index"] = keyframe_index

	if params.has("value"):
		var new_value = MCPUtils.deserialize_value(params["value"])
		anim.track_set_key_value(track_index, keyframe_index, new_value)
		result["value"] = _serialize_value(new_value)

	if params.has("transition"):
		var new_transition: float = params["transition"]
		anim.track_set_key_transition(track_index, keyframe_index, new_transition)
		result["transition"] = new_transition

	return _success({"updated_keyframe": keyframe_index, "changes": result})
