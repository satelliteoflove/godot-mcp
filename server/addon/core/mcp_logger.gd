@tool
class_name MCPLogger extends Logger

static var _output: PackedStringArray = []
static var _max_lines := 1000
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
	_mutex.unlock()


static func get_output() -> PackedStringArray:
	return _output


static func clear() -> void:
	_mutex.lock()
	_output.clear()
	_mutex.unlock()
