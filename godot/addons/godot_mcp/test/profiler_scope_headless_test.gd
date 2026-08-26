extends SceneTree

## Headless test for profiler scope and run aggregates (godot-mcp #369, #370).
##
## get_active_processes / get_signal_connections / find_nodes used to be rooted
## at the current scene, so autoloads and exec-attached nodes never appeared and
## an absolute /root/<autoload> path would not resolve. The frame profiler kept
## only a 300-frame ring; whole-run aggregates now sit beside it.
##
## Not wired into CI (CI has no Godot). Run on demand:
##   godot --headless --path <project-with-addon> \
##     --script res://addons/godot_mcp/test/profiler_scope_headless_test.gd

const Bridge := preload("res://addons/godot_mcp/game_bridge/mcp_game_bridge.gd")
const Profiler := preload("res://addons/godot_mcp/game_bridge/mcp_frame_profiler.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	# A fake scene, a fake autoload registered in ProjectSettings, and the bridge.
	var scene := Node2D.new()
	scene.name = "Main"
	root.add_child(scene)
	current_scene = scene
	var hud := Node.new()
	hud.name = "HUD"
	hud.set_process(true)
	scene.add_child(hud)

	var conductor := Node.new()
	conductor.name = "Conductor"
	conductor.set_process(true)
	root.add_child(conductor)
	ProjectSettings.set_setting("autoload/Conductor", "*res://conductor.gd")

	var bridge: Node = Bridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame
	_check("bridge is in the tree", bridge.is_inside_tree(), true)
	var holder: Node = bridge._ensure_exec_holder()
	var staller := Node.new()
	staller.name = "Staller"
	staller.set_physics_process(true)
	holder.add_child(staller)
	await process_frame

	# --- path resolution (#369) ----------------------------------------------
	_check("scene-relative path still resolves", bridge._get_node_from_path("HUD", scene), hud)
	_check("/root/<scene>/... still resolves", bridge._get_node_from_path("/root/Main/HUD", scene), hud)
	_check("/root/<autoload> resolves", bridge._get_node_from_path("/root/Conductor", scene), conductor)
	_check("/root/MCPExecHolder/... resolves", bridge._get_node_from_path("/root/MCPExecHolder/Staller", scene), staller)
	_check("absolute path string for an autoload", bridge._node_path_string(conductor, scene), "/root/Conductor")
	_check("absolute path string for a scene node", bridge._node_path_string(hud, scene), "/root/Main/HUD")

	# --- location tags (#369) ------------------------------------------------
	_check("scene node tagged scene", bridge._node_location(hud, scene), "scene")
	_check("autoload tagged autoload", bridge._node_location(conductor, scene), "autoload")
	_check("exec holder child tagged exec", bridge._node_location(staller, scene), "exec")

	# --- process census over the whole tree (#369) ----------------------------
	var script_map: Dictionary = {}
	for child in root.get_children():
		if child == bridge:
			continue
		bridge._collect_processes(child, scene, script_map)
	var paths: Array = []
	var locs: Array = []
	for k in script_map:
		paths.append_array(script_map[k]["example_paths"])
		locs.append_array(script_map[k]["locations"])
	_check("census lists the scene node", paths.has("/root/Main/HUD"), true)
	_check("census lists the autoload", paths.has("/root/Conductor"), true)
	_check("census lists the exec-attached node", paths.has("/root/MCPExecHolder/Staller"), true)
	_check("census never lists the bridge itself", paths.has(str(bridge.get_path())), false)
	_check("locations cover all three kinds", locs.has("scene") and locs.has("autoload") and locs.has("exec"), true)

	# --- run aggregates beside the ring (#370) -------------------------------
	var prof = Profiler.new()
	Engine.max_fps = 240
	prof._toggle(true, [])
	for i in 400:
		prof._tick(0.00025, 0.0001, 0.0001, 1.0 / 60.0)
	prof._tick(0.020, 0.019, 0.0001, 1.0 / 60.0)  # one real stall
	prof._tick(0.0025, 0.002, 0.0001, 1.0 / 60.0) # just over half budget (4.17ms/2)
	var data: Dictionary = prof.get_buffer_data()
	_check("ring holds at most MAX_FRAMES", data["frame_count"], Profiler.MAX_FRAMES)
	_check("total counts every frame", data["total_frames_collected"], 402)
	var run: Dictionary = data["run"]
	_check("run frames equals total", run["frames"], 402)
	_check("run max is the stall", is_equal_approx(run["max_ft"], 0.020), true)
	_check("run max index points at the stall", run["max_frame_index"], 400)
	_check("run over_budget counts the stall only", run["over_budget"], 1)
	_check("run over_half_budget counts stall + the 2.5ms frame", run["over_half_budget"], 2)
	_check("histogram buckets the idle frames", run["histogram_ms"]["<=0.5ms"], 400)
	_check("histogram buckets the stall", run["histogram_ms"]["<=33.0ms"], 1)
	prof._toggle(false, [])
	prof._toggle(true, [])
	_check("restart clears the run", prof.get_run_stats()["frames"], 0)
	Engine.max_fps = 0

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
