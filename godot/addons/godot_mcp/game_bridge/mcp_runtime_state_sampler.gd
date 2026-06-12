extends Node
class_name MCPRuntimeStateSampler

const MAX_FIELDS := 32
const MAX_SAMPLES_PER_FIELD := 200
const MAX_SIGNALS := 16
const MAX_EVENTS := 200
const MAX_ARGS_CHARS := 100    # total stringified-args cap per event
const MAX_ARG_CHARS := 40      # per-arg cap before joining
const MAX_SIGNAL_ARITY := 5

var _active: bool = false
var _specs: Array = []       # [{node, fields: [{key, resolver}]}]
var _hz: int = 20
var _duration_ms: int = 1000
# GAME time accumulated (unpaused, time_scale-scaled), NOT wall clock: under a
# godot_game_time freeze the tree is paused between steps, and counting wall time
# there would run the window down / log stale samples before the step that moves.
var _elapsed_ms: float = 0.0
var _frame_index: int = 0
var _sample_interval: int = 1  # sample every N frames
var _samples: Dictionary = {}  # field_key -> Array of {t_ms, value}
var _events: Array = []        # [{t_ms, source, signal, args?}] -- signal emissions this window
var _events_truncated: bool = false
var _events_dropped: int = 0   # total signal emissions dropped (per-signal cap or global cap)
var _per_signal_cap: int = MAX_EVENTS  # equal share of the budget, set once connections are known
var _signal_counts: Dictionary = {}    # "source:signal" -> kept count (enforces the per-signal cap)
var _signal_dropped: Dictionary = {}   # "source:signal" -> dropped count (reported to the agent)
var _field_truncated: Dictionary = {}  # full_key -> true once MAX_SAMPLES_PER_FIELD was hit
var _connections: Array = []   # [{node, sig_name, callable}] -- live connections to tear down


func start(specs: Array, hz: int, duration_ms: int, signal_specs: Array = []) -> Dictionary:
	_disconnect_all()  # a restart while connections are live must tear the old ones down
	_specs = []
	_samples = {}
	_events = []
	_events_truncated = false
	_events_dropped = 0
	_per_signal_cap = MAX_EVENTS
	_signal_counts = {}
	_signal_dropped = {}
	_field_truncated = {}
	_hz = clampi(hz, 1, 60)
	_duration_ms = clampi(duration_ms, 100, 5000)
	_elapsed_ms = 0.0
	_frame_index = 0
	_sample_interval = max(1, int(Engine.get_frames_per_second() / _hz)) if Engine.get_frames_per_second() > 0 else max(1, int(60.0 / _hz))

	var field_count := 0
	for spec in specs:
		if field_count >= MAX_FIELDS:
			break
		var node_path: String = spec.get("path", "")
		var fields: Array = spec.get("fields", [])
		if node_path.is_empty() or fields.is_empty():
			continue

		var node := _resolve_node(node_path)
		if node == null:
			continue

		var resolved_fields: Array = []
		for field_key in fields:
			if field_count >= MAX_FIELDS:
				break
			var full_key: String = node_path + ":" + str(field_key)
			_samples[full_key] = []
			resolved_fields.append({"key": field_key, "full_key": full_key})
			field_count += 1

		if not resolved_fields.is_empty():
			_specs.append({"node": node, "node_path": node_path, "fields": resolved_fields})

	_active = true
	set_process(true)

	var connected := 0
	var unresolved: Array = []
	var seen := {}
	for sig_spec in signal_specs:
		if not sig_spec is Dictionary:
			continue
		var sig_path: String = str(sig_spec.get("path", ""))
		var sig_name: String = str(sig_spec.get("signal", ""))
		if sig_path.is_empty() or sig_name.is_empty():
			continue
		var emitter := _resolve_node(sig_path)
		if emitter == null:
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "node_not_found"})
			continue
		# Dedupe on the RESOLVED node, not the path string: two spellings of the
		# same node ("/root/Scene/Child" vs "Child") would otherwise both
		# connect (our lambdas are distinct Callables, so connect() would not
		# reject the second one) and double-record every emission.
		var dedupe_key := str(emitter.get_instance_id()) + "\n" + sig_name
		if seen.has(dedupe_key):
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "duplicate"})
			continue
		seen[dedupe_key] = true
		if connected >= MAX_SIGNALS:
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "signal_cap"})
			continue
		var arg_count := _signal_arg_count(emitter, sig_name)
		if arg_count < 0:
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "signal_not_found"})
			continue
		if arg_count > MAX_SIGNAL_ARITY:
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "unsupported_arity"})
			continue
		var cb := _make_recorder(sig_path, sig_name, arg_count)
		# Immediate (not deferred) connect: emission-time recording, and the
		# recorder only appends to an Array -- safe inside main-thread physics
		# callbacks. NOT safe for signals emitted off the main thread (worker
		# threads, run_on_separate_thread physics): the append races collect().
		# Deferred connect would fix that but quantizes t_ms to frame
		# boundaries, destroying the exact-timing property -- documented as a
		# main-thread-emission limitation instead.
		if emitter.connect(StringName(sig_name), cb) != OK:
			unresolved.append({"path": sig_path, "signal": sig_name, "reason": "connect_failed"})
			continue
		_connections.append({"node": emitter, "sig_name": sig_name, "callable": cb})
		connected += 1

	# Equal-share fairness: once we know how many signals actually connected, give
	# each an EQUAL integer slice of the budget — floor(MAX_EVENTS / N). floor (not
	# ceil) so the shares SUM to <= MAX_EVENTS: every signal is then guaranteed its
	# full share regardless of emission order (a signal that saturates last is not
	# squeezed), and the global MAX_EVENTS cap below is a pure backstop the fair
	# shares never reach — so every drop is a genuine per-signal-cap drop and the
	# per-signal accounting is exact. A chatty signal cannot starve a rare one.
	# connected == 1 -> 200, i.e. the single-signal behavior is unchanged. Up to N-1
	# slots may go unused; intentional — true equal-share beats squeezing a few extra
	# events out of a chatty signal. maxi(1, ...) guards the degenerate large-N case.
	if connected > 0:
		_per_signal_cap = maxi(1, floori(float(MAX_EVENTS) / float(connected)))

	return {
		"resolved_fields": field_count,
		"connected_signals": connected,
		"unresolved_signals": unresolved,
	}


func _signal_arg_count(node: Node, sig_name: String) -> int:
	# Covers script signals AND built-ins (body_entered etc.). -1 = not found.
	for info in node.get_signal_list():
		if str(info.get("name", "")) == sig_name:
			return (info.get("args", []) as Array).size()
	return -1


func _make_recorder(path: String, sig_name: String, arg_count: int) -> Callable:
	# connect() requires the Callable arity to match the signal's; lambdas capture
	# path/sig_name by value so no get_path() happens at record time.
	match arg_count:
		0: return func() -> void: _record_event(path, sig_name, [])
		1: return func(a1) -> void: _record_event(path, sig_name, [a1])
		2: return func(a1, a2) -> void: _record_event(path, sig_name, [a1, a2])
		3: return func(a1, a2, a3) -> void: _record_event(path, sig_name, [a1, a2, a3])
		4: return func(a1, a2, a3, a4) -> void: _record_event(path, sig_name, [a1, a2, a3, a4])
		_: return func(a1, a2, a3, a4, a5) -> void: _record_event(path, sig_name, [a1, a2, a3, a4, a5])


func _record_event(source: String, sig_name: String, args: Array) -> void:
	if not _active:
		return
	# Per-signal fairness first, then the global hard cap. Keep-first: when a budget
	# is full we drop the NEW emission, so the earliest occurrences are preserved
	# (stable, reproducible t_ms; onset/causality kept). Every drop is counted.
	var key := source + ":" + sig_name
	if int(_signal_counts.get(key, 0)) >= _per_signal_cap or _events.size() >= MAX_EVENTS:
		_signal_dropped[key] = int(_signal_dropped.get(key, 0)) + 1
		_events_dropped += 1
		_events_truncated = true
		return
	var ev := {
		"t_ms": int(_elapsed_ms),
		"source": source,
		"signal": sig_name,
	}
	if not args.is_empty():
		# Stringify AT RECORD TIME -- an arg object may be freed before collect().
		# str() on an Object invokes its _to_string(); a _to_string() that mutates
		# the tree is the game's bug, not ours.
		ev["args"] = _stringify_args(args)
	_events.append(ev)
	_signal_counts[key] = int(_signal_counts.get(key, 0)) + 1


func _stringify_args(args: Array) -> String:
	var parts: PackedStringArray = []
	for a in args:
		var s := str(a)
		if s.length() > MAX_ARG_CHARS:
			s = s.substr(0, MAX_ARG_CHARS) + "..."
		parts.append(s)
	var joined := "[" + ", ".join(parts) + "]"
	if joined.length() > MAX_ARGS_CHARS:
		joined = joined.substr(0, MAX_ARGS_CHARS) + "..."
	return joined


func _disconnect_all() -> void:
	for c in _connections:
		# UNTYPED on purpose: assigning a freed instance to a typed Node var is
		# itself a script error that would abort this loop before
		# is_instance_valid ever ran, leaving stale entries behind. Freed
		# emitters drop their connections with the object; disconnecting a dead
		# entry would error too, hence both guards.
		var node = c.node
		if is_instance_valid(node) and node.is_connected(StringName(c.sig_name), c.callable):
			node.disconnect(StringName(c.sig_name), c.callable)
	_connections.clear()


func _exit_tree() -> void:
	_disconnect_all()


func _process(delta: float) -> void:
	if not _active:
		return

	# Measure the window in GAME time and only sample while it actually advances.
	# The sampler inherits PROCESS_MODE_ALWAYS, so _process keeps firing under a
	# godot_game_time freeze (tree paused) even though gameplay is static. Counting
	# those frames would (1) fill the window with stale values and (2) run the
	# auto-stop down during frozen idle, so a later step lands outside the window.
	# Skipping while paused makes the window span only live gameplay / step time.
	var tree := get_tree()
	if tree != null and tree.paused:
		return
	_elapsed_ms += delta * 1000.0  # time_scale-scaled, unpaused-only == game time

	if _elapsed_ms >= float(_duration_ms):
		_active = false
		set_process(false)
		# Window over: stop recording signal emissions too. An emission landing
		# between the window closing and this frame is recorded with t_ms
		# slightly past the window -- harmless and honest.
		_disconnect_all()
		return

	_frame_index += 1
	if _frame_index % _sample_interval != 0:
		return

	for spec in _specs:
		# Untyped: a typed assignment of a freed instance is a script error that
		# would abort the whole sampling pass (same hazard as _disconnect_all).
		var node = spec.node
		if not is_instance_valid(node):
			# node was freed — mark all fields and skip
			for field_info in spec.fields:
				var arr: Array = _samples.get(field_info.full_key, [])
				if arr.size() < MAX_SAMPLES_PER_FIELD:
					arr.append({"t_ms": int(_elapsed_ms), "value": "freed"})
				else:
					_field_truncated[field_info.full_key] = true
			continue

		for field_info in spec.fields:
			var value = _read_field(node, field_info.key)
			if value == null:
				continue
			var arr: Array = _samples.get(field_info.full_key, [])
			if arr.size() < MAX_SAMPLES_PER_FIELD:
				arr.append({"t_ms": int(_elapsed_ms), "value": value})
			else:
				_field_truncated[field_info.full_key] = true


func collect() -> Dictionary:
	var elapsed := int(_elapsed_ms)
	var total_samples := 0
	for key in _samples:
		total_samples += (_samples[key] as Array).size()
	return {
		"window_ms": elapsed,
		"sample_count": total_samples,
		"fields": _samples.duplicate(true),
		# duplicate: a mid-window collect leaves recording live, so the caller's
		# copy must not alias the still-growing array.
		"events": _events.duplicate(true),
		"events_truncated": _events_truncated,
		"events_dropped": _events_dropped,
		"events_dropped_by_signal": _signal_dropped.duplicate(true),
		"fields_truncated": _field_truncated.duplicate(true),
	}


func stop() -> Dictionary:
	# _elapsed_ms already holds the game-time window and freezes once _active is
	# false, so a late manual stop can't inflate window_ms past the real window end.
	_active = false
	set_process(false)
	_disconnect_all()
	return collect()


func is_active() -> bool:
	return _active


func _resolve_node(path: String) -> Node:
	var tree := get_tree()
	if tree == null:
		return null
	var scene_root := tree.current_scene

	# "/" means the scene root, NOT the root Window -- keep ahead of the absolute
	# attempt or a bare-/ NodePath would return the Window.
	if path == "/":
		return scene_root

	# Absolute paths resolve from /root regardless of current_scene -- this is
	# what makes autoloads (/root/G) watchable, including during scene
	# transitions when current_scene is null.
	if path.begins_with("/") and tree.root != null:
		var abs_hit := tree.root.get_node_or_null(NodePath(path))
		if abs_hit != null:
			return abs_hit

	if scene_root == null:
		return null

	if path == "/root/" + scene_root.name:
		return scene_root

	if path.begins_with("/root/"):
		var parts := path.split("/")
		# parts[0]="", parts[1]="root", parts[2]=scene_name, parts[3+]=relative
		if parts.size() >= 3 and parts[2] == scene_root.name:
			if parts.size() == 3:
				return scene_root
			var relative := "/".join(parts.slice(3))
			return scene_root.get_node_or_null(relative)

	return scene_root.get_node_or_null(path)


func _read_field(node: Node, key: String) -> Variant:
	match key:
		"pos.x":
			if node is Node2D:
				return snapped((node as Node2D).global_position.x, 0.01)
			if node is Node3D:
				return snapped((node as Node3D).global_position.x, 0.01)
		"pos.y":
			if node is Node2D:
				return snapped((node as Node2D).global_position.y, 0.01)
			if node is Node3D:
				return snapped((node as Node3D).global_position.y, 0.01)
		"pos.z":
			if node is Node3D:
				return snapped((node as Node3D).global_position.z, 0.01)
		"vel.x":
			if node is CharacterBody2D:
				return snapped((node as CharacterBody2D).velocity.x, 0.01)
			if node is RigidBody2D:
				return snapped((node as RigidBody2D).linear_velocity.x, 0.01)
			if node is CharacterBody3D:
				return snapped((node as CharacterBody3D).velocity.x, 0.01)
			if node is RigidBody3D:
				return snapped((node as RigidBody3D).linear_velocity.x, 0.01)
		"vel.y":
			if node is CharacterBody2D:
				return snapped((node as CharacterBody2D).velocity.y, 0.01)
			if node is RigidBody2D:
				return snapped((node as RigidBody2D).linear_velocity.y, 0.01)
			if node is CharacterBody3D:
				return snapped((node as CharacterBody3D).velocity.y, 0.01)
			if node is RigidBody3D:
				return snapped((node as RigidBody3D).linear_velocity.y, 0.01)
		"vel.z":
			if node is CharacterBody3D:
				return snapped((node as CharacterBody3D).velocity.z, 0.01)
			if node is RigidBody3D:
				return snapped((node as RigidBody3D).linear_velocity.z, 0.01)
		"rot":
			if node is Node2D:
				return snapped(rad_to_deg((node as Node2D).global_rotation), 0.01)
			if node is Node3D:
				return snapped(rad_to_deg((node as Node3D).global_rotation.y), 0.01)
		"anim":
			if node is AnimationPlayer:
				return (node as AnimationPlayer).current_animation
			if node is AnimatedSprite2D:
				return (node as AnimatedSprite2D).animation
			if node is AnimationTree:
				# Only state-machine roots expose parameters/playback; BlendTree
				# and other roots fall through to null (silent skip, matching the
				# other inapplicable-field arms).
				var playback = node.get("parameters/playback")
				if playback is AnimationNodeStateMachinePlayback:
					return String(playback.get_current_node())
		"anim_frame":
			if node is AnimatedSprite2D:
				return (node as AnimatedSprite2D).frame

	# Custom state fallback — `is Dictionary` guards against _mcp_state() errors,
	# which are non-fatal in GDScript (Godot prints the error and returns null).
	if node.has_method("_mcp_state"):
		var state = node._mcp_state()
		if state is Dictionary and state.has(key):
			var val = state[key]
			if val is float or val is int:
				return snapped(float(val), 0.01)
			return val

	# Generic property fallback
	if key in node:
		var val = node.get(key)
		if val is float or val is int:
			return snapped(float(val), 0.01)
		if val is String or val is bool:
			return val

	return null
