@tool
extends MCPBaseCommand
class_name MCPSceneCommands


func get_commands() -> Dictionary:
	return {
		"get_scene_tree": get_scene_tree,
		"open_scene": open_scene,
		"save_scene": save_scene,
		"reload_scene": reload_scene
	}


func get_scene_tree(params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	# 0 = unlimited for both caps (the default when the param is omitted), so the
	# full tree is unchanged unless a caller opts into trimming it.
	var max_depth: int = int(params.get("max_depth", 0))
	var max_children: int = int(params.get("max_children", 0))
	return _success({"tree": _build_tree(root, 1, max_depth, max_children)})


func _build_tree(node: Node, depth: int, max_depth: int, max_children: int) -> Dictionary:
	var result := {
		"name": node.name,
		"type": node.get_class(),
	}

	if node is Node2D:
		var pos: Vector2 = node.position
		result["position"] = {"x": pos.x, "y": pos.y}
	elif node is Node3D:
		var pos: Vector3 = node.position
		result["position"] = {"x": pos.x, "y": pos.y, "z": pos.z}

	var child_nodes := node.get_children()
	var child_count := child_nodes.size()
	if child_count == 0:
		return result

	# Depth cap: at the limit, stop recursing and just report how many direct
	# children were cut off.
	if max_depth > 0 and depth >= max_depth:
		result["truncated_children"] = child_count
		return result

	# Breadth cap: list the first max_children and report the remainder.
	var limit := child_count
	if max_children > 0 and child_count > max_children:
		limit = max_children

	var children: Array[Dictionary] = []
	for i in range(limit):
		children.append(_build_tree(child_nodes[i], depth + 1, max_depth, max_children))

	result["children"] = children
	if limit < child_count:
		result["truncated_children"] = child_count - limit

	return result


func open_scene(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")
	if scene_path.is_empty():
		return _error("INVALID_PARAMS", "scene_path is required")

	if not FileAccess.file_exists(scene_path):
		return _error("FILE_NOT_FOUND", "Scene file not found: %s" % scene_path)

	EditorInterface.open_scene_from_path(scene_path)
	return _success({"path": scene_path})


func save_scene(params: Dictionary) -> Dictionary:
	var resolved: Variant = _resolve_scene_path(params.get("path", ""))
	if resolved is Dictionary:
		return resolved
	var path: String = resolved

	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return _error("NO_SCENE", "No scene is currently open")

	# What gets packed is always the active tab. An explicit path that names a
	# different file would overwrite that file with this tab's content (#346), so
	# it is only accepted as a "save as" for a scene that has no file yet.
	var current_file := root.scene_file_path
	if not current_file.is_empty():
		var target := _localize_scene_path(path)
		if target != _localize_scene_path(current_file):
			return _error("SCENE_MISMATCH",
				"scene_path %s is not the active scene (%s); save packs the active tab, " % [target, current_file] +
				"so this would overwrite %s with the wrong content. " % target +
				"Open the target scene first, or omit scene_path to save the active one.")
		path = target

	# This save packs the tree directly rather than going through EditorNode,
	# so the editor's reset_on_save never runs and a previewed animation pose
	# would be written into the file (#364). Apply each mixer's RESET animation
	# for the duration of the pack, then put the preview pose back.
	var reset_backups := _apply_reset_for_save(root)

	var packed_scene := PackedScene.new()
	var err := packed_scene.pack(root)
	_restore_after_save(reset_backups)
	if err != OK:
		return _error("PACK_FAILED", "Failed to pack scene: %s" % error_string(err))

	err = ResourceSaver.save(packed_scene, path)
	if err != OK:
		return _error("SAVE_FAILED", "Failed to save scene: %s" % error_string(err))

	var result := {"path": path}
	var reset_players: Array[String] = []
	for b in reset_backups:
		reset_players.append(b["player"])
	if not reset_players.is_empty():
		result["reset_applied"] = reset_players
	return _success(result)


# Emulates AnimationMixer's reset-on-save (apply_reset/make_backup are not
# scriptable): for every mixer under root with reset_on_save and a RESET
# animation, remember each RESET-tracked property's current value, then write
# the RESET key value in its place. Returns the backups for _restore_after_save.
func _apply_reset_for_save(root: Node) -> Array:
	var backups: Array = []
	var mixers: Array = []
	_collect_mixers(root, mixers)
	for mixer in mixers:
		if not mixer.reset_on_save or not mixer.has_animation("RESET"):
			continue
		var reset: Animation = mixer.get_animation("RESET")
		var entries: Array = []
		for t in reset.get_track_count():
			if reset.track_get_key_count(t) == 0:
				continue
			var target := MCPUtils.resolve_track_target(mixer, reset, t)
			if not target.get("found", false):
				continue
			var reset_value: Variant
			match reset.track_get_type(t):
				Animation.TYPE_VALUE:
					reset_value = reset.track_get_key_value(t, 0)
				Animation.TYPE_BEZIER:
					reset_value = reset.bezier_track_get_key_value(t, 0)
				Animation.TYPE_POSITION_3D:
					reset_value = reset.position_track_interpolate(t, 0.0)
				Animation.TYPE_ROTATION_3D:
					reset_value = reset.rotation_track_interpolate(t, 0.0)
				Animation.TYPE_SCALE_3D:
					reset_value = reset.scale_track_interpolate(t, 0.0)
				_:
					continue
			entries.append({"target": target["target"], "subpath": target["subpath"],
				"type": reset.track_get_type(t), "value": target["value"]})
			_write_track_value(target["target"], target["subpath"], reset.track_get_type(t), reset_value)
		if not entries.is_empty():
			backups.append({"player": str(root.get_path_to(mixer)), "entries": entries})
	return backups


func _restore_after_save(backups: Array) -> void:
	for b in backups:
		for e in b["entries"]:
			if is_instance_valid(e["target"]):
				_write_track_value(e["target"], e["subpath"], e["type"], e["value"])


func _write_track_value(target: Object, subpath: NodePath, track_type: int, value: Variant) -> void:
	match track_type:
		Animation.TYPE_POSITION_3D:
			(target as Node3D).position = value
		Animation.TYPE_ROTATION_3D:
			(target as Node3D).quaternion = value
		Animation.TYPE_SCALE_3D:
			(target as Node3D).scale = value
		_:
			target.set_indexed(subpath, value)


func _collect_mixers(node: Node, out: Array) -> void:
	if node is AnimationMixer:
		out.append(node)
	for c in node.get_children():
		_collect_mixers(c, out)


# Reload an already-open scene from disk, picking up a direct .tscn edit without
# the heavyweight `restart`. Disk wins: any unsaved in-memory edits to this scene
# (e.g. an unsaved godot_node_edit) are discarded. Only open scenes can be
# reloaded in place; an unopened path is rejected so the caller uses open_scene.
func reload_scene(params: Dictionary) -> Dictionary:
	var resolved: Variant = _resolve_scene_path(params.get("scene_path", ""))
	if resolved is Dictionary:
		return resolved
	var scene_path := _localize_scene_path(resolved)

	if not FileAccess.file_exists(scene_path):
		return _error("FILE_NOT_FOUND", "Scene file not found: %s" % scene_path)

	if not scene_path in EditorInterface.get_open_scenes():
		return _error("NOT_OPEN", "Scene is not open in the editor; use open_scene to open it: %s" % scene_path)

	EditorInterface.reload_scene_from_path(scene_path)
	return _success({"path": scene_path})


# Resolve the scene-file path to act on: the caller-supplied path, or the current
# edited scene's file when none was given. Returns the path String, or an error
# Dictionary (NO_SCENE / NO_PATH) the caller returns unchanged. Shared by
# save_scene and reload_scene so the NO_SCENE/NO_PATH handling lives in one place.
func _resolve_scene_path(provided_path: String) -> Variant:
	if not provided_path.is_empty():
		return provided_path
	var err := _require_scene_open()
	if err:
		return err
	var path := EditorInterface.get_edited_scene_root().scene_file_path
	if path.is_empty():
		return _error("NO_PATH", "The current scene has not been saved to a file and no scene path was provided")
	return path


# Normalize a scene path to the canonical res:// form that get_open_scenes() and
# FileAccess use. A uid:// reference (the editor writes these into .tscn since
# 4.4) is resolved to its res:// path; an absolute path is localized. An
# unresolvable uid is returned unchanged so the existence check reports it.
func _localize_scene_path(path: String) -> String:
	if path.begins_with("uid://"):
		var id := ResourceUID.text_to_id(path)
		if ResourceUID.has_id(id):
			return ResourceUID.get_id_path(id)
		return path
	return ProjectSettings.localize_path(path)

