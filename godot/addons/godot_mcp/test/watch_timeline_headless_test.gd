extends SceneTree

## Headless checks for the watch-lifecycle event timeline (#198): signal
## connect/record/disconnect on MCPRuntimeStateSampler, caps/truncation,
## restart and freed-emitter teardown, the absolute-path _resolve_node fix
## (autoloads), and the AnimationTree "anim" read.
##
## Runs without a game or editor: current_scene is NULL under --script, which
## is exactly the failure mode the resolver fix closes — the /root/FakeAutoload
## checks below fail on the pre-fix sampler.
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/watch_timeline_headless_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

var _count := 0
var _failures := 0


class _Emitter extends Node:
	signal fired
	signal hit(amount)
	signal moved(x, y)
	signal six(a, b, c, d, e, f)
	var score := 7


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== WATCH TIMELINE TEST =====================\n")
	_check("root window is at /root (absolute paths resolve)", str(root.get_path()), "/root")

	var sampler := MCPRuntimeStateSampler.new()
	root.add_child(sampler)
	var emitter := _Emitter.new()
	emitter.name = "FakeAutoload"
	root.add_child(emitter)
	await process_frame

	_test_arities_and_args(sampler, emitter)
	await _test_timestamps(sampler, emitter)
	_test_event_cap(sampler, emitter)
	_test_fairness(sampler, emitter)
	_test_fairness_three(sampler, emitter)
	_test_field_samples_truncated(sampler, emitter)
	_test_freeze_pauses_sampling(sampler, emitter)
	_test_arg_caps(sampler, emitter)
	await _test_window_semantics(sampler, emitter)
	await _test_auto_stop(sampler, emitter)
	_test_restart_cleanup(sampler, emitter)
	_test_freed_emitter(sampler)
	await _test_freed_field_node(sampler)
	_test_reporting(sampler, emitter)
	await _test_field_absolute_path(sampler)
	_test_alias_dedupe(sampler)
	_test_resolution_preservation(sampler)
	await _test_animation_tree(sampler)

	sampler.stop()
	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS - %d checks" % _count)
	else:
		printerr("FAILED - %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _start_signals(sampler: MCPRuntimeStateSampler, sig_specs: Array, duration_ms: int = 5000) -> Dictionary:
	return sampler.start([], 20, duration_ms, sig_specs)


func _pump_ms(ms: int) -> void:
	var t0 := Time.get_ticks_msec()
	while Time.get_ticks_msec() - t0 < ms:
		await process_frame


func _test_arities_and_args(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	var res := _start_signals(sampler, [
		{"path": "/root/FakeAutoload", "signal": "fired"},
		{"path": "/root/FakeAutoload", "signal": "hit"},
		{"path": "/root/FakeAutoload", "signal": "moved"},
	])
	_check("arity: 3 signals connected", res.get("connected_signals"), 3)
	_check("arity: none unresolved", (res.get("unresolved_signals") as Array).size(), 0)

	emitter.fired.emit()
	emitter.hit.emit(3)
	emitter.moved.emit(1.5, 2)
	var events: Array = sampler.collect().get("events", [])
	_check("arity: 3 events recorded", events.size(), 3)
	if events.size() == 3:
		_check("arity-0: source is the requested path", events[0].get("source"), "/root/FakeAutoload")
		_check("arity-0: signal name", events[0].get("signal"), "fired")
		_check("arity-0: args key omitted", events[0].has("args"), false)
		_check("arity-1: args stringified", events[1].get("args"), "[3]")
		_check("arity-2: args stringified", events[2].get("args"), "[1.5, 2]")
	sampler.stop()


func _test_timestamps(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}])
	emitter.fired.emit()
	await _pump_ms(15)
	emitter.fired.emit()
	var events: Array = sampler.stop().get("events", [])
	_check("timestamps: 2 events", events.size(), 2)
	if events.size() == 2:
		_check("timestamps: first t_ms >= 0", int(events[0].get("t_ms")) >= 0, true)
		_check("timestamps: strictly increasing across a 15ms gap",
			int(events[1].get("t_ms")) > int(events[0].get("t_ms")), true)


func _test_event_cap(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "hit"}])
	for i in 250:
		emitter.hit.emit(i)
	var result: Dictionary = sampler.stop()
	_check("cap: events stop at MAX_EVENTS", (result.get("events") as Array).size(),
		MCPRuntimeStateSampler.MAX_EVENTS)
	_check("cap: truncation flagged honestly", result.get("events_truncated"), true)
	# Single-signal path (cap == 200): 250 emitted -> 50 dropped, attributed to it.
	_check("cap: single signal reports its drops (250 - 200)", result.get("events_dropped"), 50)
	_check("cap: drop attributed to the single signal",
		int((result.get("events_dropped_by_signal", {}) as Dictionary).get("/root/FakeAutoload:hit", 0)), 50)

	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}])
	emitter.fired.emit()
	var result2: Dictionary = sampler.stop()
	_check("cap: truncated flag resets on restart", result2.get("events_truncated"), false)


func _test_fairness(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	# Two signals share the 200 budget -> ceil(200/2) = 100 each. A chatty "hit"
	# must NOT starve a rare "fired" (the headline #285 fix), and keep-first means
	# the EARLIEST hits survive. Emit order: 250 hits, THEN 5 fireds — under the old
	# global keep-first the 200 budget would fill with hits and starve every fired.
	_start_signals(sampler, [
		{"path": "/root/FakeAutoload", "signal": "hit"},
		{"path": "/root/FakeAutoload", "signal": "fired"},
	])
	for i in 250:
		emitter.hit.emit(i)
	for i in 5:
		emitter.fired.emit()
	var result: Dictionary = sampler.stop()
	var events: Array = result.get("events", [])
	var hits := events.filter(func(e): return e.get("signal") == "hit")
	var fireds := events.filter(func(e): return e.get("signal") == "fired")
	_check("fairness: chatty signal capped at its equal share floor(200/2)", hits.size(), 100)
	_check("fairness: rare signal NOT starved (all 5 kept)", fireds.size(), 5)
	_check("fairness: events_dropped counts only the overflow", result.get("events_dropped"), 150)
	var by_sig: Dictionary = result.get("events_dropped_by_signal", {})
	_check("fairness: drops attributed to the chatty signal", int(by_sig.get("/root/FakeAutoload:hit", 0)), 150)
	_check("fairness: rare signal records no drops", by_sig.has("/root/FakeAutoload:fired"), false)
	if hits.size() == 100:
		_check("keep-first: first kept hit is the earliest emission", hits[0].get("args"), "[0]")
		_check("keep-first: last kept hit is the 100th, not the 250th", hits[99].get("args"), "[99]")


func _test_fairness_three(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	# N=3 does NOT divide 200: floor(200/3)=66 each (ceil would give 67, and the global
	# 200 cap would then clip whichever signal saturates last to 66 -> an UNEQUAL
	# 67/67/66). floor makes the shares sum to 198 <= 200, so all three get EXACTLY 66
	# regardless of emission order. Asserting all three == 66 is what distinguishes floor
	# from ceil — under ceil this case would read 67/67/66 and fail.
	_start_signals(sampler, [
		{"path": "/root/FakeAutoload", "signal": "fired"},
		{"path": "/root/FakeAutoload", "signal": "hit"},
		{"path": "/root/FakeAutoload", "signal": "moved"},
	])
	for i in 100:
		emitter.fired.emit()
		emitter.hit.emit(i)
		emitter.moved.emit(i, i)
	var result: Dictionary = sampler.stop()
	var events: Array = result.get("events", [])
	var n_fired := events.filter(func(e): return e.get("signal") == "fired").size()
	var n_hit := events.filter(func(e): return e.get("signal") == "hit").size()
	var n_moved := events.filter(func(e): return e.get("signal") == "moved").size()
	_check("fairness N=3: fired gets exactly floor(200/3)=66", n_fired, 66)
	_check("fairness N=3: hit gets exactly floor(200/3)=66", n_hit, 66)
	_check("fairness N=3: moved gets exactly floor(200/3)=66 (equal, order-independent)", n_moved, 66)
	_check("fairness N=3: total kept == 3*66, under the global 200 backstop", events.size(), 198)
	_check("fairness N=3: total dropped == 3*(100-66)", result.get("events_dropped"), 102)


func _test_field_samples_truncated(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	# Sampled-field history caps at MAX_SAMPLES_PER_FIELD; overflow must be FLAGGED,
	# not silently dropped (#285 #4). Drive _process directly with the interval forced
	# to 1 so the sample count is deterministic and independent of the headless frame
	# rate (which makes the fps-derived _sample_interval unpredictable).
	# Watch a real field ("score", saturates) alongside a never-readable "ghost" field
	# (_read_field returns null, so it never appends and must never appear in
	# fields_truncated) — proving the flag is genuinely per-field, not blanket.
	sampler.start([{"path": "/root/FakeAutoload", "fields": ["score", "ghost"]}], 60, 5000, [])
	sampler._sample_interval = 1
	for i in MCPRuntimeStateSampler.MAX_SAMPLES_PER_FIELD + 25:
		sampler._process(0.0)
	var result: Dictionary = sampler.stop()
	var ft: Dictionary = result.get("fields_truncated", {})
	_check("field saturation: overflow flagged for the saturated field",
		ft.get("/root/FakeAutoload:score", false), true)
	var samples: Array = (result.get("fields", {}) as Dictionary).get("/root/FakeAutoload:score", [])
	_check("field saturation: samples stop exactly at the cap", samples.size(),
		MCPRuntimeStateSampler.MAX_SAMPLES_PER_FIELD)
	_check("field saturation: the un-saturated ghost field is NOT flagged",
		ft.has("/root/FakeAutoload:ghost"), false)
	_check("field saturation: only the saturated field is flagged", ft.size(), 1)


func _test_freeze_pauses_sampling(sampler: MCPRuntimeStateSampler, _emitter: _Emitter) -> void:
	# Regression: under a godot_game_time freeze the bridge holds the tree paused,
	# but the sampler inherits PROCESS_MODE_ALWAYS so _process keeps firing. Those
	# paused frames must NOT advance the window or record samples — otherwise the
	# window (formerly wall-clock) ran down during frozen idle and stepped tests
	# came back flat. Drive _process directly with the interval forced to 1.
	sampler.start([{"path": "/root/FakeAutoload", "fields": ["score"]}], 60, 5000, [])
	sampler._sample_interval = 1
	paused = true
	for i in 5:
		sampler._process(0.5)  # 5 frames @ 500ms each — would be 2500ms of WALL time
	var frozen: Dictionary = sampler.collect()
	var frozen_samples: int = ((frozen.get("fields", {}) as Dictionary).get("/root/FakeAutoload:score", []) as Array).size()
	_check("freeze: no samples recorded while the tree is paused", frozen_samples, 0)
	_check("freeze: window_ms does not advance while paused", frozen.get("window_ms"), 0)
	_check("freeze: window did NOT auto-stop during frozen idle", sampler.is_active(), true)
	# Unpause (a step): the same _process calls now sample and advance GAME time.
	paused = false
	for i in 3:
		sampler._process(0.5)  # 3 x 500ms == 1500ms of game time
	var live: Dictionary = sampler.collect()
	var live_samples: int = ((live.get("fields", {}) as Dictionary).get("/root/FakeAutoload:score", []) as Array).size()
	_check("freeze: sampling resumes once unpaused (step)", live_samples > 0, true)
	_check("freeze: window advances in GAME time once unpaused (~1500ms)",
		int(live.get("window_ms")) >= 1400, true)
	sampler.stop()


func _test_arg_caps(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "hit"}])
	emitter.hit.emit("x".repeat(500))
	var events: Array = sampler.stop().get("events", [])
	_check("arg cap: 1 event", events.size(), 1)
	if events.size() == 1:
		var args: String = events[0].get("args", "")
		_check("arg cap: total capped (<= MAX_ARGS_CHARS + ellipsis)",
			args.length() <= MCPRuntimeStateSampler.MAX_ARGS_CHARS + 3, true)


func _test_window_semantics(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	# collect() mid-window must NOT disconnect: recording continues to duration.
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}])
	emitter.fired.emit()
	var first: Array = sampler.collect().get("events", [])
	_check("window: first collect sees 1 event", first.size(), 1)
	await process_frame
	emitter.fired.emit()
	var second: Array = sampler.collect().get("events", [])
	_check("window: collect leaves connections live (2nd event recorded)", second.size(), 2)

	# stop() disconnects: emissions after it are not recorded.
	var stopped: Array = sampler.stop().get("events", [])
	_check("window: stop returns both events", stopped.size(), 2)
	_check("window: stop tears down connections", sampler._connections.is_empty(), true)
	emitter.fired.emit()
	_check("window: emission after stop not recorded",
		(sampler.collect().get("events") as Array).size(), 2)


func _test_auto_stop(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}], 100)
	emitter.fired.emit()
	var t0 := Time.get_ticks_msec()
	while sampler.is_active() and Time.get_ticks_msec() - t0 < 2000:
		await process_frame
	_check("auto-stop: sampler stopped by duration", sampler.is_active(), false)
	_check("auto-stop: connections torn down", sampler._connections.is_empty(), true)
	emitter.fired.emit()
	_check("auto-stop: emission after window not recorded",
		(sampler.collect().get("events") as Array).size(), 1)

	# window_ms honesty: a late manual stop must NOT inflate the window to the
	# call time (stop() used to clobber the auto-stop timestamp).
	var settled: int = sampler.collect().get("window_ms")
	await _pump_ms(200)
	_check("auto-stop: window_ms stable across late collects",
		sampler.collect().get("window_ms"), settled)
	_check("auto-stop: late stop() keeps the auto-stop window_ms",
		sampler.stop().get("window_ms"), settled)


func _test_restart_cleanup(sampler: MCPRuntimeStateSampler, emitter: _Emitter) -> void:
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}])
	_start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "hit"}])
	emitter.fired.emit()
	emitter.hit.emit(1)
	var events: Array = sampler.stop().get("events", [])
	_check("restart: only the new watch records", events.size(), 1)
	if events.size() == 1:
		_check("restart: surviving event is from the new spec", events[0].get("signal"), "hit")
	_check("restart: old signal has no leftover connection",
		emitter.get_signal_connection_list("fired").size(), 0)


func _test_freed_emitter(sampler: MCPRuntimeStateSampler) -> void:
	var doomed := _Emitter.new()
	doomed.name = "Doomed"
	root.add_child(doomed)
	var res := _start_signals(sampler, [{"path": "/root/Doomed", "signal": "fired"}])
	_check("freed: connected before free", res.get("connected_signals"), 1)
	root.remove_child(doomed)
	doomed.free()
	var result: Dictionary = sampler.stop()  # must not error on the dead entry
	_check("freed: stop survives a freed emitter", result.get("events_truncated"), false)
	var res2 := _start_signals(sampler, [{"path": "/root/FakeAutoload", "signal": "fired"}])
	_check("freed: clean restart afterwards", res2.get("connected_signals"), 1)
	sampler.stop()


func _test_freed_field_node(sampler: MCPRuntimeStateSampler) -> void:
	# A typed `var node: Node = spec.node` on a freed instance is a script error
	# that aborts the sampling pass — the freed-marker path never ran. Pins the
	# untyped-assignment fix in _process (and _disconnect_all's twin).
	var doomed := _Emitter.new()
	doomed.name = "DoomedField"
	root.add_child(doomed)
	var res: Dictionary = sampler.start([{"path": "/root/DoomedField", "fields": ["score"]}], 60, 2000)
	_check("freed-field: field resolved before free", res.get("resolved_fields"), 1)
	await _pump_ms(50)
	root.remove_child(doomed)
	doomed.free()
	await _pump_ms(50)
	var result: Dictionary = sampler.stop()
	var samples: Array = (result.get("fields") as Dictionary).get("/root/DoomedField:score", [])
	var freed_markers := 0
	for s in samples:
		if str(s.get("value")) == "freed":
			freed_markers += 1
	_check("freed-field: sampling survived the free", samples.size() > 0, true)
	_check("freed-field: freed markers recorded after the free", freed_markers > 0, true)


func _test_reporting(sampler: MCPRuntimeStateSampler, _emitter: _Emitter) -> void:
	var res := _start_signals(sampler, [
		{"path": "/root/Bogus", "signal": "fired"},
		{"path": "/root/FakeAutoload", "signal": "no_such_signal"},
		{"path": "/root/FakeAutoload", "signal": "six"},
		{"path": "/root/FakeAutoload", "signal": "fired"},
		{"path": "/root/FakeAutoload", "signal": "fired"},
	])
	_check("report: only the valid non-duplicate connected", res.get("connected_signals"), 1)
	var unresolved: Array = res.get("unresolved_signals", [])
	_check("report: 4 unresolved", unresolved.size(), 4)
	var reasons := {}
	for u in unresolved:
		reasons[u.get("reason")] = u
	_check("report: node_not_found named", reasons.has("node_not_found"), true)
	_check("report: signal_not_found named", reasons.has("signal_not_found"), true)
	_check("report: unsupported_arity (6 params) named", reasons.has("unsupported_arity"), true)
	_check("report: duplicate spec named", reasons.has("duplicate"), true)
	sampler.stop()

	# Connection cap: 20 distinct emitters, 16 connect, 4 report signal_cap.
	var extras: Array = []
	var sig_specs: Array = []
	for i in 20:
		var e := _Emitter.new()
		e.name = "CapEmitter%d" % i
		root.add_child(e)
		extras.append(e)
		sig_specs.append({"path": "/root/CapEmitter%d" % i, "signal": "fired"})
	var cap_res := _start_signals(sampler, sig_specs)
	_check("report: connections capped at MAX_SIGNALS", cap_res.get("connected_signals"),
		MCPRuntimeStateSampler.MAX_SIGNALS)
	var cap_unresolved: Array = cap_res.get("unresolved_signals", [])
	var cap_hits := 0
	for u in cap_unresolved:
		if u.get("reason") == "signal_cap":
			cap_hits += 1
	_check("report: overflow reported as signal_cap", cap_hits, 20 - MCPRuntimeStateSampler.MAX_SIGNALS)
	sampler.stop()
	for e in extras:
		root.remove_child(e)
		e.free()


func _test_field_absolute_path(sampler: MCPRuntimeStateSampler) -> void:
	# Field specs share _resolve_node, so /root/* (autoload-style) sampling must
	# work with current_scene null — the pre-fix sampler returns 0 fields here.
	var res: Dictionary = sampler.start(
		[{"path": "/root/FakeAutoload", "fields": ["score"]}], 60, 500)
	_check("fields: /root path resolves with no current_scene", res.get("resolved_fields"), 1)
	await _pump_ms(150)
	var result: Dictionary = sampler.stop()
	var samples: Array = (result.get("fields") as Dictionary).get("/root/FakeAutoload:score", [])
	_check("fields: autoload-style property sampled", samples.size() > 0, true)
	if samples.size() > 0:
		_check("fields: sampled value correct", samples[0].get("value"), 7)


func _test_alias_dedupe(sampler: MCPRuntimeStateSampler) -> void:
	# Two spellings of the SAME node must not double-connect: dedupe is on the
	# resolved instance, not the path string.
	var scene := Node.new()
	scene.name = "AliasScene"
	var child := _Emitter.new()
	child.name = "AliasChild"
	scene.add_child(child)
	root.add_child(scene)
	current_scene = scene

	var res := _start_signals(sampler, [
		{"path": "/root/AliasScene/AliasChild", "signal": "fired"},
		{"path": "AliasChild", "signal": "fired"},
	])
	_check("alias: only one connection for two spellings", res.get("connected_signals"), 1)
	var unresolved: Array = res.get("unresolved_signals", [])
	_check("alias: second spelling reported as duplicate",
		unresolved.size() == 1 and unresolved[0].get("reason") == "duplicate", true)
	child.fired.emit()
	_check("alias: one emission records one event",
		(sampler.stop().get("events") as Array).size(), 1)

	current_scene = null
	root.remove_child(scene)
	scene.free()


func _test_resolution_preservation(sampler: MCPRuntimeStateSampler) -> void:
	var scene := Node.new()
	scene.name = "FakeScene"
	var child := Node.new()
	child.name = "Child"
	scene.add_child(child)
	root.add_child(scene)
	current_scene = scene

	_check("resolve: relative path against current_scene", sampler._resolve_node("Child"), child)
	_check("resolve: /root/<scene>/Child remap", sampler._resolve_node("/root/FakeScene/Child"), child)
	_check("resolve: bare / is the scene root, not the Window", sampler._resolve_node("/"), scene)
	_check("resolve: /root/<scene> is the scene root", sampler._resolve_node("/root/FakeScene"), scene)
	_check("resolve: absolute autoload path still wins", sampler._resolve_node("/root/FakeAutoload") != null, true)

	current_scene = null
	root.remove_child(scene)
	scene.free()
	_check("resolve: null current_scene + / degrades to null", sampler._resolve_node("/"), null)


func _test_animation_tree(sampler: MCPRuntimeStateSampler) -> void:
	# Built fully in code: AnimationTree is an AnimationMixer in 4.x, so it takes
	# the library directly — no AnimationPlayer needed.
	var lib := AnimationLibrary.new()
	for anim_name in ["a", "b"]:
		var anim := Animation.new()
		anim.length = 0.05
		lib.add_animation(anim_name, anim)

	var sm := AnimationNodeStateMachine.new()
	for state in ["a", "b"]:
		var node := AnimationNodeAnimation.new()
		node.animation = state
		sm.add_node(state, node)
	sm.add_transition("a", "b", AnimationNodeStateMachineTransition.new())

	var at := AnimationTree.new()
	at.tree_root = sm
	root.add_child(at)
	at.add_animation_library("", lib)
	at.active = true
	var playback = at.get("parameters/playback")
	_check("animtree: state machine exposes playback",
		playback is AnimationNodeStateMachinePlayback, true)

	playback.start("a")
	var t0 := Time.get_ticks_msec()
	while str(sampler._read_field(at, "anim")) != "a" and Time.get_ticks_msec() - t0 < 1000:
		await process_frame
	_check("animtree: _read_field reads current state", sampler._read_field(at, "anim"), "a")
	_check("animtree: value is a String (wire-stable)",
		sampler._read_field(at, "anim") is String, true)

	playback.travel("b")
	t0 = Time.get_ticks_msec()
	while str(sampler._read_field(at, "anim")) != "b" and Time.get_ticks_msec() - t0 < 1000:
		await process_frame
	_check("animtree: transition observed via the sampler read", sampler._read_field(at, "anim"), "b")

	var blend := AnimationTree.new()
	blend.tree_root = AnimationNodeBlendTree.new()
	root.add_child(blend)
	_check("animtree: BlendTree root yields null (documented silent skip)",
		sampler._read_field(blend, "anim"), null)

	root.remove_child(at)
	at.free()
	root.remove_child(blend)
	blend.free()


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
