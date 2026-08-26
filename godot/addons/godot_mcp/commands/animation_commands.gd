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

# JSON shape an agent should send for each Variant type a key can hold.
const VALUE_SHAPE_HINT := {
	TYPE_COLOR: "{r, g, b, a}",
	TYPE_VECTOR2: "{x, y}",
	TYPE_VECTOR2I: "{x, y}",
	TYPE_VECTOR3: "{x, y, z}",
	TYPE_VECTOR3I: "{x, y, z}",
	TYPE_VECTOR4: "{x, y, z, w}",
	TYPE_QUATERNION: "{x, y, z, w}",
}

# Track types whose key value has a fixed Variant type regardless of target.
const TRACK_VALUE_TYPE := {
	Animation.TYPE_POSITION_3D: TYPE_VECTOR3,
	Animation.TYPE_SCALE_3D: TYPE_VECTOR3,
	Animation.TYPE_ROTATION_3D: TYPE_QUATERNION,
	Animation.TYPE_BLEND_SHAPE: TYPE_FLOAT,
	Animation.TYPE_BEZIER: TYPE_FLOAT,
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
		"create_reset_keys": create_reset_keys,
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


# The Variant type a key on this track must hold: fixed by the track type for
# transform/bezier/blend-shape tracks, otherwise read off the live target
# property; falling back to the track's first key. TYPE_NIL = unknowable.
func _expected_key_type(player: AnimationPlayer, anim: Animation, track_index: int) -> int:
	var track_type := anim.track_get_type(track_index)
	if TRACK_VALUE_TYPE.has(track_type):
		return TRACK_VALUE_TYPE[track_type]
	if track_type != Animation.TYPE_VALUE:
		return TYPE_NIL
	var target := MCPUtils.resolve_track_target(player, anim, track_index)
	if target.get("found", false) and target["type"] != TYPE_NIL:
		return target["type"]
	if anim.track_get_key_count(track_index) > 0:
		return typeof(anim.track_get_key_value(track_index, 0))
	return TYPE_NIL


# Fit a deserialized key value to the type the track writes (#363). A bare
# numeric array is unambiguous once the target type is known, so [r,g,b,a]
# becomes a Color and [x,y] a Vector2; anything else that does not match is
# rejected instead of being stored and silently coerced to black/zero by the
# property setter at play time. Returns {ok, value} or {ok: false, error}.
func _coerce_key_value(value: Variant, expected_type: int) -> Dictionary:
	if expected_type == TYPE_NIL or typeof(value) == expected_type:
		return {"ok": true, "value": value}
	var vt := typeof(value)
	if expected_type == TYPE_FLOAT and vt == TYPE_INT:
		return {"ok": true, "value": float(value)}
	if expected_type == TYPE_INT and vt == TYPE_FLOAT and is_equal_approx(value, roundf(value)):
		return {"ok": true, "value": int(value)}
	if vt == TYPE_ARRAY and _is_numeric_array(value):
		var a: Array = value
		match expected_type:
			TYPE_VECTOR2 when a.size() == 2: return {"ok": true, "value": Vector2(a[0], a[1])}
			TYPE_VECTOR2I when a.size() == 2: return {"ok": true, "value": Vector2i(a[0], a[1])}
			TYPE_VECTOR3 when a.size() == 3: return {"ok": true, "value": Vector3(a[0], a[1], a[2])}
			TYPE_VECTOR3I when a.size() == 3: return {"ok": true, "value": Vector3i(a[0], a[1], a[2])}
			TYPE_VECTOR4 when a.size() == 4: return {"ok": true, "value": Vector4(a[0], a[1], a[2], a[3])}
			TYPE_QUATERNION when a.size() == 4: return {"ok": true, "value": Quaternion(a[0], a[1], a[2], a[3])}
			TYPE_COLOR when a.size() == 3: return {"ok": true, "value": Color(a[0], a[1], a[2])}
			TYPE_COLOR when a.size() == 4: return {"ok": true, "value": Color(a[0], a[1], a[2], a[3])}
	var hint: String = VALUE_SHAPE_HINT.get(expected_type, type_string(expected_type))
	return {"ok": false, "error": "expected %s as %s, got %s" % [type_string(expected_type), hint, type_string(vt)]}


func _is_numeric_array(a: Array) -> bool:
	if a.is_empty():
		return false
	for v in a:
		if not (v is int or v is float):
			return false
	return true


# Mirror the editor panel's default "Create RESET Track(s)": when a track is
# added, the property's current value goes into a RESET animation key so a
# preview can be undone and reset_on_save has something to apply (#364).
# Returns {added: bool, value} — false when the target is unreachable or
# RESET already has this track.
func _ensure_reset_key(player: AnimationPlayer, anim: Animation, track_index: int) -> Dictionary:
	var track_type := anim.track_get_type(track_index)
	if track_type in [Animation.TYPE_METHOD, Animation.TYPE_AUDIO, Animation.TYPE_ANIMATION]:
		return {"added": false}
	var target := MCPUtils.resolve_track_target(player, anim, track_index)
	if not target.get("found", false):
		return {"added": false, "reason": "target not resolvable from the player's root_node"}
	var track_path := anim.track_get_path(track_index)

	var reset: Animation = player.get_animation("RESET") if player.has_animation("RESET") else null
	if reset == null:
		reset = Animation.new()
		reset.length = 0.001
		var lib: AnimationLibrary = player.get_animation_library("") if player.has_animation_library("") else null
		if lib == null:
			lib = AnimationLibrary.new()
			player.add_animation_library("", lib)
		lib.add_animation("RESET", reset)
	elif reset == anim:
		return {"added": false}

	for i in reset.get_track_count():
		if reset.track_get_path(i) == track_path and reset.track_get_type(i) == track_type:
			return {"added": false, "reason": "RESET already has this track"}

	var rt := reset.add_track(track_type)
	reset.track_set_path(rt, track_path)
	var current: Variant = target["value"]
	match track_type:
		Animation.TYPE_BEZIER:
			reset.bezier_track_insert_key(rt, 0.0, float(current))
		Animation.TYPE_BLEND_SHAPE:
			reset.blend_shape_track_insert_key(rt, 0.0, float(current))
		Animation.TYPE_POSITION_3D:
			reset.position_track_insert_key(rt, 0.0, current)
		Animation.TYPE_ROTATION_3D:
			reset.rotation_track_insert_key(rt, 0.0, current)
		Animation.TYPE_SCALE_3D:
			reset.scale_track_insert_key(rt, 0.0, current)
		_:
			reset.track_insert_key(rt, 0.0, current)
	return {"added": true, "value": _serialize_value(current)}


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

	var result := {"stopped": true}
	if not keep_state and not player.has_animation("RESET") and player.get_animation_list().size() > 0:
		# Godot's stop() leaves the first keyframe's values on the nodes; only a
		# RESET animation puts them back (#364).
		result["warning"] = ("No RESET animation on this player: the first keyframe values now sit on the " +
			"animated nodes and would be written by godot_scene save. Tracks added with add_track get " +
			"RESET keys automatically; for tracks authored elsewhere, add a RESET animation with the rest values.")
	return _success(result)


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

	var result := {
		"track_index": track_index,
		"track_path": track_path,
		"track_type": track_type,
	}
	if params.get("create_reset", true):
		var reset := _ensure_reset_key(player, anim, track_index)
		result["reset_key_added"] = reset.get("added", false)
		if reset.has("value"):
			result["reset_value"] = reset["value"]
		if reset.has("reason"):
			result["reset_skipped"] = reset["reason"]
	return _success(result)


# Backfill RESET keys for tracks authored before add_track keyed them (or by
# hand): every track on the named animation, or on all of the player's
# animations, gets a RESET key holding the property's CURRENT value where the
# RESET animation lacks one. Call it before previewing, while the nodes still
# hold their rest pose.
func create_reset_keys(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	var anim_name: String = params.get("animation_name", "")

	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var player := _get_animation_player(node_path)
	if not player:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_ANIMATION_PLAYER", "Node is not an AnimationPlayer")

	var names: Array = []
	if anim_name.is_empty():
		for n in player.get_animation_list():
			if n != "RESET":
				names.append(n)
	else:
		if not player.has_animation(anim_name):
			return _error("ANIMATION_NOT_FOUND", "Animation not found: %s" % anim_name)
		names.append(anim_name)

	var added: Array = []
	var skipped: Array = []
	for n in names:
		var anim := player.get_animation(n)
		for t in anim.get_track_count():
			var r := _ensure_reset_key(player, anim, t)
			var entry := {"animation": n, "track_index": t, "track_path": str(anim.track_get_path(t))}
			if r.get("added", false):
				entry["value"] = r.get("value")
				added.append(entry)
			else:
				entry["reason"] = r.get("reason", "track type has no rest value")
				skipped.append(entry)

	return _success({
		"animations": names,
		"added": added,
		"skipped": skipped,
		"has_reset": player.has_animation("RESET"),
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
	if track_type != Animation.TYPE_METHOD:
		var fit := _coerce_key_value(value, _expected_key_type(player, anim, track_index))
		if not fit["ok"]:
			return _error("TYPE_MISMATCH", "value for track %s: %s" % [anim.track_get_path(track_index), fit["error"]])
		value = fit["value"]
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
		if anim.track_get_type(track_index) != Animation.TYPE_METHOD:
			var fit := _coerce_key_value(new_value, _expected_key_type(player, anim, track_index))
			if not fit["ok"]:
				return _error("TYPE_MISMATCH", "value for track %s: %s" % [anim.track_get_path(track_index), fit["error"]])
			new_value = fit["value"]
		anim.track_set_key_value(track_index, keyframe_index, new_value)
		result["value"] = _serialize_value(new_value)

	if params.has("transition"):
		var new_transition: float = params["transition"]
		anim.track_set_key_transition(track_index, keyframe_index, new_transition)
		result["transition"] = new_transition

	return _success({"updated_keyframe": keyframe_index, "changes": result})
