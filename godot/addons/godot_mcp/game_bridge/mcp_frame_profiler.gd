extends EngineProfiler
class_name MCPFrameProfiler

const MAX_FRAMES := 300
const MONITOR_SAMPLE_INTERVAL := 10

# Frame-time histogram edges in ms. Fixed and coarse on purpose: the run
# aggregates must never grow with run length (#370).
const HISTOGRAM_EDGES_MS: Array[float] = [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 33.0, 66.0, 100.0]

var _active := false
var _buffer: Array[Dictionary] = []
var _frame_index := 0

# Whole-run aggregates, kept beside the ring so get_data can answer "did
# anything spike in the last ten seconds" and not just the last 300 frames.
var _run_sum_ft := 0.0
var _run_max_ft := 0.0
var _run_max_index := -1
var _run_over_budget := 0
var _run_over_half_budget := 0
var _run_budget_sec := 0.0
var _run_histogram: Array[int] = []
var _run_started_usec := 0


func _toggle(enable: bool, _options: Array) -> void:
	_active = enable
	if enable:
		_buffer.clear()
		_frame_index = 0
		_run_sum_ft = 0.0
		_run_max_ft = 0.0
		_run_max_index = -1
		_run_over_budget = 0
		_run_over_half_budget = 0
		_run_histogram.clear()
		_run_histogram.resize(HISTOGRAM_EDGES_MS.size() + 1)
		_run_histogram.fill(0)
		_run_started_usec = Time.get_ticks_usec()
		var target_fps := Engine.max_fps if Engine.max_fps > 0 else Engine.physics_ticks_per_second
		_run_budget_sec = 1.0 / float(target_fps) if target_fps > 0 else 1.0 / 60.0


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

	_run_sum_ft += frame_time
	if frame_time > _run_max_ft:
		_run_max_ft = frame_time
		_run_max_index = _frame_index
	if frame_time > _run_budget_sec:
		_run_over_budget += 1
	if frame_time > _run_budget_sec * 0.5:
		_run_over_half_budget += 1
	var ms := frame_time * 1000.0
	var bucket := HISTOGRAM_EDGES_MS.size()
	for i in HISTOGRAM_EDGES_MS.size():
		if ms <= HISTOGRAM_EDGES_MS[i]:
			bucket = i
			break
	_run_histogram[bucket] += 1

	_frame_index += 1


func get_buffer_data() -> Dictionary:
	return {
		"active": _active,
		"frame_count": _buffer.size(),
		"total_frames_collected": _frame_index,
		"max_fps": Engine.max_fps,
		"frames": _buffer.duplicate(),
		"run": get_run_stats(),
	}


func get_run_stats() -> Dictionary:
	# An ordered array, not a Dictionary: the wire JSON sorts keys, which put
	# "<=100ms" between "<=1ms" and "<=16ms".
	var histogram: Array = []
	for i in _run_histogram.size():
		if i < HISTOGRAM_EDGES_MS.size():
			histogram.append({"le_ms": HISTOGRAM_EDGES_MS[i], "count": _run_histogram[i]})
		else:
			histogram.append({"gt_ms": HISTOGRAM_EDGES_MS[-1], "count": _run_histogram[i]})
	return {
		"frames": _frame_index,
		"duration_s": (Time.get_ticks_usec() - _run_started_usec) / 1000000.0 if _run_started_usec > 0 else 0.0,
		"sum_ft": _run_sum_ft,
		"max_ft": _run_max_ft,
		"max_frame_index": _run_max_index,
		"budget_sec": _run_budget_sec,
		"over_budget": _run_over_budget,
		"over_half_budget": _run_over_half_budget,
		"histogram_ms": histogram,
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
