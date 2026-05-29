extends Node
class_name MCPRuntimeStateSampler

const MAX_FIELDS := 32
const MAX_SAMPLES_PER_FIELD := 200

var _active: bool = false
var _specs: Array = []       # [{node, fields: [{key, resolver}]}]
var _hz: int = 20
var _duration_ms: int = 1000
var _start_time: int = 0
var _stop_time: int = 0      # set on auto-stop or manual stop; 0 = still running
var _frame_index: int = 0
var _sample_interval: int = 1  # sample every N frames
var _samples: Dictionary = {}  # field_key -> Array of {t_ms, value}


func start(specs: Array, hz: int, duration_ms: int) -> Dictionary:
	_specs = []
	_samples = {}
	_hz = clampi(hz, 1, 60)
	_duration_ms = clampi(duration_ms, 100, 5000)
	_start_time = Time.get_ticks_msec()
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

	_stop_time = 0
	_active = true
	set_process(true)
	return {"resolved_fields": field_count}


func _process(_delta: float) -> void:
	if not _active:
		return

	var elapsed := Time.get_ticks_msec() - _start_time

	if elapsed >= _duration_ms:
		_active = false
		_stop_time = Time.get_ticks_msec()
		set_process(false)
		return

	_frame_index += 1
	if _frame_index % _sample_interval != 0:
		return

	for spec in _specs:
		var node: Node = spec.node
		if not is_instance_valid(node):
			# node was freed — mark all fields and skip
			for field_info in spec.fields:
				var arr: Array = _samples.get(field_info.full_key, [])
				if arr.size() < MAX_SAMPLES_PER_FIELD:
					arr.append({"t_ms": elapsed, "value": "freed"})
			continue

		for field_info in spec.fields:
			var value = _read_field(node, field_info.key)
			if value == null:
				continue
			var arr: Array = _samples.get(field_info.full_key, [])
			if arr.size() < MAX_SAMPLES_PER_FIELD:
				arr.append({"t_ms": elapsed, "value": value})


func collect() -> Dictionary:
	var elapsed: int
	if _stop_time > 0:
		elapsed = _stop_time - _start_time
	elif _start_time > 0:
		elapsed = Time.get_ticks_msec() - _start_time
	else:
		elapsed = 0  # never started
	var total_samples := 0
	for key in _samples:
		total_samples += (_samples[key] as Array).size()
	return {
		"window_ms": elapsed,
		"sample_count": total_samples,
		"fields": _samples.duplicate(true),
	}


func stop() -> Dictionary:
	_active = false
	_stop_time = Time.get_ticks_msec()
	set_process(false)
	return collect()


func is_active() -> bool:
	return _active


func _resolve_node(path: String) -> Node:
	var tree := get_tree()
	if tree == null:
		return null
	var scene_root := tree.current_scene
	if scene_root == null:
		return null

	if path == "/root/" + scene_root.name or path == "/":
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
