@tool
class_name MCPLogger extends Logger

static var _output: PackedStringArray = []
static var _errors: Array[Dictionary] = []
static var _max_lines := 1000
static var _max_errors := 100
static var _mutex := Mutex.new()
# Monotonic sequence stamped on every retained error, never reset (not even by
# clear_errors). It is the cursor for incremental reads: a caller passes the
# `cursor` from a previous get_log_messages back as `since` to get only what is
# new. Independent of array index, so trimming the oldest entries is harmless.
static var _seq := 0


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
				"file": backtrace.get_frame_file(i),
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
		_seq += 1
		error_entry["seq"] = _seq
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


static func get_seq() -> int:
	return _seq


# Filtered, incremental view of the retained errors. Pure (no side effects) so it
# can be unit-tested headless.
#   since    : return only entries with seq > since (0 = from the beginning)
#   severity : "all" (default), "error" (drops warnings), or "warning" (only warnings)
#   limit    : keep at most this many of the most recent matches (<= 0 means all)
# `cursor` is always the highest seq issued so far; pass it back as `since` next
# time to read only what is new. `total_count` is the whole buffer (unfiltered),
# `match_count` is what passed the filters, `returned_count` is after the limit.
static func query(since: int, severity: String, limit: int) -> Dictionary:
	_mutex.lock()
	var cursor := _seq
	var total_count := _errors.size()
	var matched: Array[Dictionary] = []
	for entry in _errors:
		if int(entry.get("seq", 0)) <= since:
			continue
		if not _severity_matches(severity, int(entry.get("error_type", 0))):
			continue
		matched.append(entry)
	_mutex.unlock()

	var match_count := matched.size()
	var start_index := 0
	if limit > 0 and match_count > limit:
		start_index = match_count - limit
	var messages: Array[Dictionary] = matched.slice(start_index)

	return {
		"total_count": total_count,
		"match_count": match_count,
		"returned_count": messages.size(),
		"cursor": cursor,
		"messages": messages,
	}


# Logger.ErrorType (inherited): ERROR_TYPE_ERROR=0, ERROR_TYPE_WARNING=1,
# ERROR_TYPE_SCRIPT=2, ERROR_TYPE_SHADER=3. Only WARNING is not an actual problem.
static func _severity_matches(severity: String, error_type: int) -> bool:
	match severity:
		"error":
			return error_type != Logger.ERROR_TYPE_WARNING
		"warning":
			return error_type == Logger.ERROR_TYPE_WARNING
		_:
			return true


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
