extends EngineProfiler
class_name MCPFrameProfiler

const MAX_FRAMES := 300
const MONITOR_SAMPLE_INTERVAL := 10

var _active := false
var _buffer: Array[Dictionary] = []
var _frame_index := 0


func _toggle(enable: bool, _options: Array) -> void:
	_active = enable
	if enable:
		_buffer.clear()
		_frame_index = 0


func _tick(frame_time: float, process_time: float, physics_time: float, physics_frame_time: float) -> void:
	if not _active:
		return

	var entry := {
		"ft": frame_time,
		"pt": process_time,
		"pht": physics_time,
		"pft": physics_frame_time,
		"i": _frame_index,
	}

	if _frame_index % MONITOR_SAMPLE_INTERVAL == 0:
		entry["m"] = _snapshot_monitors()

	_buffer.append(entry)
	if _buffer.size() > MAX_FRAMES:
		_buffer.pop_front()

	_frame_index += 1


func get_buffer_data() -> Dictionary:
	return {
		"active": _active,
		"frame_count": _buffer.size(),
		"total_frames_collected": _frame_index,
		"max_fps": Engine.max_fps,
		"frames": _buffer.duplicate(),
	}


func _snapshot_monitors() -> Dictionary:
	return {
		"fps": Performance.get_monitor(Performance.TIME_FPS),
		"obj_count": int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		"node_count": int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		"orphan_nodes": int(Performance.get_monitor(Performance.OBJECT_ORPHAN_NODE_COUNT)),
		"mem_static": int(Performance.get_monitor(Performance.MEMORY_STATIC)),
		"render_objects": int(Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME)),
		"render_draw_calls": int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)),
		"render_primitives": int(Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)),
	}
