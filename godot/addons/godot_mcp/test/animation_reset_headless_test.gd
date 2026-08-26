extends SceneTree

## Headless test for keyframe value typing (#363) and RESET handling (#364).
##
## Builds a real AnimationPlayer over a ColorRect and a Node3D, then drives the
## command helpers directly (no EditorInterface): the track-target resolver,
## key-value coercion, RESET key creation on add_track, and the save-time
## reset/restore round trip that stands in for the editor's reset_on_save.
##
## Not wired into CI (CI has no Godot). Run on demand:
##   godot --headless --path <project-with-addon> \
##     --script res://addons/godot_mcp/test/animation_reset_headless_test.gd

const AnimCmd := preload("res://addons/godot_mcp/commands/animation_commands.gd")
const SceneCmd := preload("res://addons/godot_mcp/commands/scene_commands.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	var holder := Node.new()
	holder.name = "Main"
	root.add_child(holder)
	var zone := ColorRect.new()
	zone.name = "Zone"
	zone.modulate = Color(1, 1, 1, 1)
	holder.add_child(zone)
	var cube := Node3D.new()
	cube.name = "Cube"
	cube.position = Vector3(1, 2, 3)
	holder.add_child(cube)
	var player := AnimationPlayer.new()
	player.name = "AnimationPlayer"
	holder.add_child(player)
	player.root_node = NodePath("..")

	var lib := AnimationLibrary.new()
	player.add_animation_library("", lib)
	var pulse := Animation.new()
	pulse.length = 1.0
	lib.add_animation("pulse", pulse)
	var t_mod := pulse.add_track(Animation.TYPE_VALUE)
	pulse.track_set_path(t_mod, NodePath("Zone:modulate"))
	var t_pos := pulse.add_track(Animation.TYPE_POSITION_3D)
	pulse.track_set_path(t_pos, NodePath("Cube"))
	var t_sub := pulse.add_track(Animation.TYPE_VALUE)
	pulse.track_set_path(t_sub, NodePath("Zone:modulate:r"))

	var anim_cmd = AnimCmd.new()
	var scene_cmd = SceneCmd.new()

	# --- resolve_track_target -------------------------------------------------
	var tgt: Dictionary = MCPUtils.resolve_track_target(player, pulse, t_mod)
	_check("Zone:modulate resolves", tgt.get("found", false), true)
	_check("Zone:modulate is a Color", tgt.get("type", -1), TYPE_COLOR)
	var tgt_pos: Dictionary = MCPUtils.resolve_track_target(player, pulse, t_pos)
	_check("position track resolves to the Node3D", tgt_pos.get("found", false) and tgt_pos["target"] == cube, true)
	var tgt_sub: Dictionary = MCPUtils.resolve_track_target(player, pulse, t_sub)
	_check("sub-property modulate:r resolves to a float", tgt_sub.get("type", -1), TYPE_FLOAT)

	# --- _coerce_key_value (#363) --------------------------------------------
	var c1: Dictionary = anim_cmd._coerce_key_value([1.6, 1.6, 1.6, 1], TYPE_COLOR)
	_check("4-array coerces to Color", c1["ok"] and c1["value"] == Color(1.6, 1.6, 1.6, 1), true)
	var c2: Dictionary = anim_cmd._coerce_key_value([1.4, 1.4], TYPE_VECTOR2)
	_check("2-array coerces to Vector2", c2["ok"] and c2["value"] == Vector2(1.4, 1.4), true)
	var c3: Dictionary = anim_cmd._coerce_key_value([1.6, 1.6], TYPE_COLOR)
	_check("wrong-length array for Color is rejected", c3["ok"], false)
	_check("rejection names the expected shape", str(c3.get("error", "")).contains("{r, g, b, a}"), true)
	var c4: Dictionary = anim_cmd._coerce_key_value("red", TYPE_COLOR)
	_check("String for Color is rejected", c4["ok"], false)
	var c5: Dictionary = anim_cmd._coerce_key_value(3, TYPE_FLOAT)
	_check("int widens to float", c5["ok"] and c5["value"] is float, true)
	var c6: Dictionary = anim_cmd._coerce_key_value(Color.RED, TYPE_COLOR)
	_check("already-typed value passes through", c6["ok"] and c6["value"] == Color.RED, true)
	var c7: Dictionary = anim_cmd._coerce_key_value([1, 2], TYPE_NIL)
	_check("unknown target type accepts anything", c7["ok"], true)
	_check("expected type read off the live property", anim_cmd._expected_key_type(player, pulse, t_mod), TYPE_COLOR)
	_check("expected type fixed by transform track", anim_cmd._expected_key_type(player, pulse, t_pos), TYPE_VECTOR3)

	# --- _ensure_reset_key (#364) --------------------------------------------
	_check("no RESET before", player.has_animation("RESET"), false)
	var r1: Dictionary = anim_cmd._ensure_reset_key(player, pulse, t_mod)
	_check("RESET key added for modulate", r1.get("added", false), true)
	_check("RESET animation now exists", player.has_animation("RESET"), true)
	var reset: Animation = player.get_animation("RESET")
	_check("RESET holds the current modulate", reset.track_get_key_value(0, 0), Color(1, 1, 1, 1))
	var r2: Dictionary = anim_cmd._ensure_reset_key(player, pulse, t_mod)
	_check("second call does not duplicate the track", r2.get("added", true), false)
	_check("still one RESET track", reset.get_track_count(), 1)
	var r3: Dictionary = anim_cmd._ensure_reset_key(player, pulse, t_pos)
	_check("RESET key added for the position track", r3.get("added", false), true)
	_check("position RESET key holds the rest position", reset.position_track_interpolate(1, 0.0), Vector3(1, 2, 3))

	# --- backfill over an animation authored without RESET keys ---------------
	var legacy := Animation.new()
	lib.add_animation("legacy", legacy)
	var l_scale := legacy.add_track(Animation.TYPE_SCALE_3D)
	legacy.track_set_path(l_scale, NodePath("Cube"))
	var l_missing := legacy.add_track(Animation.TYPE_VALUE)
	legacy.track_set_path(l_missing, NodePath("Nope:modulate"))
	var before_tracks := reset.get_track_count()
	var b1: Dictionary = anim_cmd._ensure_reset_key(player, legacy, l_scale)
	_check("backfill keys an unkeyed scale track", b1.get("added", false), true)
	var b2: Dictionary = anim_cmd._ensure_reset_key(player, legacy, l_missing)
	_check("unresolvable target is skipped with a reason", not b2.get("added", true) and b2.has("reason"), true)
	_check("backfill added exactly one RESET track", reset.get_track_count(), before_tracks + 1)

	# --- save-time reset round trip (#364) -----------------------------------
	# Simulate a preview having left the first keyframe on the nodes.
	zone.modulate = Color(1.6, 1.6, 1.6, 1)
	cube.position = Vector3(9, 9, 9)
	var backups: Array = scene_cmd._apply_reset_for_save(holder)
	_check("one mixer reset for save", backups.size(), 1)
	_check("modulate at rest value during the pack", zone.modulate, Color(1, 1, 1, 1))
	_check("position at rest value during the pack", cube.position, Vector3(1, 2, 3))
	var packed := PackedScene.new()
	packed.pack(holder)
	scene_cmd._restore_after_save(backups)
	_check("preview modulate restored after the pack", zone.modulate, Color(1.6, 1.6, 1.6, 1))
	_check("preview position restored after the pack", cube.position, Vector3(9, 9, 9))
	var state := packed.get_state()
	var saved_mod: Variant = null
	for i in state.get_node_count():
		if state.get_node_name(i) == "Zone":
			for p in state.get_node_property_count(i):
				if state.get_node_property_name(i, p) == "modulate":
					saved_mod = state.get_node_property_value(i, p)
	_check("packed scene carries the rest modulate (or default)", saved_mod == null or saved_mod == Color(1, 1, 1, 1), true)

	player.reset_on_save = false
	var none: Array = scene_cmd._apply_reset_for_save(holder)
	_check("reset_on_save=false is honored", none.size(), 0)

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s: expected %s, got %s" % [_count, label, str(expected), str(got)])
