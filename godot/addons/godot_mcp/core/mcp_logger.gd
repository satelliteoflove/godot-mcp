@tool
class_name MCPLogger extends Logger

static var _output: PackedStringArray = []
static var _errors: Array[Dictionary] = []
static var _max_lines := 1000
static var _max_errors := 100
static var _mutex := Mutex.new()


static func _static_init() -> void:
	OS.add_logger(MCPLogger.new())


func _log_message(message: String, error: bool) -> void:
	_mutex.lock()
	var prefix := "[ERROR] " if error else ""
	_output.append(prefix + message)
	if _output.size() > _max_lines:
		_output.remove_at(0)
	_mutex.unlock()


func _log_error(function: String, file: String, line: int, code: String,
				rationale: String, editor_notify: bool, error_type: int,
				script_backtraces: Array[ScriptBacktrace]) -> void:
	_mutex.lock()
	var msg := "[%s:%d] %s: %s" % [file.get_file(), line, code, rationale]
	_output.append("[ERROR] " + msg)
	if _output.size() > _max_lines:
		_output.remove_at(0)

	var frames: Array[Dictionary] = []
	for backtrace in script_backtraces:
		for i in backtrace.get_frame_count():
			frames.append({
				"file": backtrace.get_frame_source(i),
				"line": backtrace.get_frame_line(i),
				"function": backtrace.get_frame_function(i),
			})

	var error_entry := {
		"timestamp": Time.get_ticks_msec(),
		"type": code,
		"message": rationale,
		"file": file,
		"line": line,
		"function": function,
		"error_type": error_type,
		"frames": frames,
	}
	if not _is_duplicate(error_entry):
		_errors.append(error_entry)
		if _errors.size() > _max_errors:
			_errors.remove_at(0)
	_mutex.unlock()


static func _is_duplicate(entry: Dictionary) -> bool:
	if _errors.is_empty():
		return false
	var last := _errors[-1]
	return (last.get("file") == entry.get("file")
		and last.get("line") == entry.get("line")
		and last.get("message") == entry.get("message")
		and last.get("type") == entry.get("type"))


static func get_output() -> PackedStringArray:
	return _output


static func get_errors() -> Array[Dictionary]:
	return _errors


static func get_last_stack_trace() -> Array[Dictionary]:
	if _errors.is_empty():
		return []
	return _errors[-1].get("frames", [])


static func clear() -> void:
	_mutex.lock()
	_output.clear()
	_mutex.unlock()


static func clear_errors() -> void:
	_mutex.lock()
	_errors.clear()
	_mutex.unlock()
