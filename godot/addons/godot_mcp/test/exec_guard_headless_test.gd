extends SceneTree

## Headless test for the godot_exec guard helpers (game_bridge/mcp_exec_guard.gd, #243).
##
## Three layers:
##   1. scan_source — every denylist token rejected by name; strings/comments
##      never trigger; read-mode FileAccess allowed; await -> SYNC_ONLY;
##      comment-only -> NO_CODE.
##   2. build_wrapper — each indentation style (tab / 4-space / 2-space), blank
##      lines, lambdas, and multiline strings produce a wrapper that ACTUALLY
##      compiles (GDScript.new + reload), instantiates, and returns the right
##      value when called — this is what retires the wrapper-corruption risk on
##      the exact Godot version in use.
##   3. mechanics pins the bridge handler relies on: parse-broken source fails
##      reload(); a runtime error mid-script returns null AND reaches a
##      registered Logger; an await-containing wrapper (scan bypassed) returns a
##      GDScriptFunctionState — the synchronous-only runtime backstop.
##
## Not wired into CI (CI has no Godot). Run against any project with the addon:
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/exec_guard_headless_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const MCPExecGuardScript := preload("res://addons/godot_mcp/game_bridge/mcp_exec_guard.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_test_scan_denylist()
	_test_scan_strings_and_comments()
	_test_scan_sync_only_and_no_code()
	_test_wrapper_compiles_and_runs()
	_test_mechanics_pins()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


# ── 1. denylist scan ──────────────────────────────────────────────────────────

func _test_scan_denylist() -> void:
	for token in MCPExecGuardScript.DENYLIST:
		var result: Dictionary = MCPExecGuardScript.scan_source("var x = %s" % token)
		_check("scan rejects %s" % token, result.get("ok"), false)
		_check("scan names the token %s" % token, result.get("token"), token)
	# Word boundaries: blocked OS.execute must not bleed into other identifiers,
	# and the longer sibling has its own entry.
	_check("scan: MyOS.executed is not OS.execute",
		MCPExecGuardScript.scan_source("MyOS.executed()").get("ok"), true)
	_check("scan: OS.execute_with_pipe caught via its own entry",
		MCPExecGuardScript.scan_source("OS.execute_with_pipe(\"x\", [])").get("token"),
		"OS.execute_with_pipe")
	# Read-mode FileAccess is legitimate; write modes are not.
	_check("scan: FileAccess.READ allowed",
		MCPExecGuardScript.scan_source("var f = FileAccess.open(\"user://s.dat\", FileAccess.READ)").get("ok"),
		true)
	_check("scan: FileAccess.WRITE rejected",
		MCPExecGuardScript.scan_source("var f = FileAccess.open(\"user://s.dat\", FileAccess.WRITE)").get("token"),
		"FileAccess.WRITE")
	_check("scan: FileAccess.READ_WRITE rejected",
		MCPExecGuardScript.scan_source("FileAccess.open(p, FileAccess.READ_WRITE)").get("token"),
		"FileAccess.READ_WRITE")


func _test_scan_strings_and_comments() -> void:
	_check("scan: token inside a string is allowed",
		MCPExecGuardScript.scan_source("print(\"OS.execute\")").get("ok"), true)
	_check("scan: token inside a single-quoted string is allowed",
		MCPExecGuardScript.scan_source("print('DirAccess')").get("ok"), true)
	_check("scan: token inside a comment is allowed",
		MCPExecGuardScript.scan_source("pass # OS.execute would be bad").get("ok"), true)
	_check("scan: token inside a multiline string is allowed",
		MCPExecGuardScript.scan_source("var s = \"\"\"\nOS.execute\n\"\"\"\nreturn s").get("ok"), true)
	_check("scan: escaped quote does not end the string early",
		MCPExecGuardScript.scan_source("print(\"say \\\"OS.execute\\\" aloud\")").get("ok"), true)
	_check("scan: token after a string on the same line is still caught",
		MCPExecGuardScript.scan_source("print(\"ok\"); OS.kill(123)").get("token"), "OS.kill")
	_check("scan: hash inside a string is not a comment",
		MCPExecGuardScript.scan_source("var s = \"a#b\"; DirAccess.open(\"res://\")").get("token"),
		"DirAccess")


func _test_scan_sync_only_and_no_code() -> void:
	var awaited: Dictionary = MCPExecGuardScript.scan_source("await tree.process_frame\nreturn 1")
	_check("scan: await rejected", awaited.get("ok"), false)
	_check("scan: await message is SYNC_ONLY", str(awaited.get("message", "")).begins_with("SYNC_ONLY"), true)
	_check("scan: 'await' inside a string is allowed",
		MCPExecGuardScript.scan_source("return \"await\"").get("ok"), true)
	_check("scan: awaiting_count identifier is not the await keyword",
		MCPExecGuardScript.scan_source("var awaiting_count = 1\nreturn awaiting_count").get("ok"), true)

	var empty: Dictionary = MCPExecGuardScript.scan_source("")
	_check("scan: empty source -> NO_CODE", str(empty.get("message", "")).begins_with("NO_CODE"), true)
	var comments: Dictionary = MCPExecGuardScript.scan_source("# just a comment\n   \n# another")
	_check("scan: comment-only source -> NO_CODE", str(comments.get("message", "")).begins_with("NO_CODE"), true)


# ── 2. wrapper: builds, compiles, runs ────────────────────────────────────────

const BINDINGS := ["G", "tree", "root", "holder"]


# Compile a wrapper for `source`, call _mcp_run with stub bindings, and return
# {compiled: bool, result: Variant}.
func _run_wrapped(source: String) -> Dictionary:
	var wrapper: String = MCPExecGuardScript.build_wrapper(source, PackedStringArray(BINDINGS))
	var script := GDScript.new()
	script.source_code = wrapper
	if script.reload() != OK or not script.can_instantiate():
		return {"compiled": false, "result": null}
	var inst: Object = script.new()
	var inputs: Array = [RefCounted.new(), self, get_root(), Node.new()]
	var result: Variant = inst.callv("_mcp_run", inputs)
	(inputs[3] as Node).free()
	return {"compiled": true, "result": result}


func _test_wrapper_compiles_and_runs() -> void:
	var flat := _run_wrapped("return 1 + 2")
	_check("wrapper: flat one-liner compiles", flat["compiled"], true)
	_check("wrapper: flat one-liner returns", flat["result"], 3)

	var tabbed := _run_wrapped("var total = 0\nfor i in range(4):\n\ttotal += i\nreturn total")
	_check("wrapper: tab-indented compiles", tabbed["compiled"], true)
	_check("wrapper: tab-indented returns", tabbed["result"], 6)

	var four := _run_wrapped("var total = 0\nfor i in range(4):\n    total += i\nreturn total")
	_check("wrapper: 4-space-indented compiles", four["compiled"], true)
	_check("wrapper: 4-space-indented returns", four["result"], 6)

	var two := _run_wrapped("var total = 0\nfor i in range(4):\n  total += i\nreturn total")
	_check("wrapper: 2-space-indented compiles", two["compiled"], true)
	_check("wrapper: 2-space-indented returns", two["result"], 6)

	var blanks := _run_wrapped("var a = 1\n\n\nvar b = 2\n\nreturn a + b")
	_check("wrapper: blank lines survive", blanks["compiled"], true)
	_check("wrapper: blank lines return", blanks["result"], 3)

	var lam := _run_wrapped("var double = func(a):\n\treturn a * 2\nreturn double.call(21)")
	_check("wrapper: lambda compiles", lam["compiled"], true)
	_check("wrapper: lambda returns", lam["result"], 42)

	# Multiline string content must NOT be indent-prefixed.
	var multi := _run_wrapped("var s = \"\"\"line1\nline2\"\"\"\nreturn s")
	_check("wrapper: multiline string compiles", multi["compiled"], true)
	_check("wrapper: multiline string content untouched", multi["result"], "line1\nline2")

	# Bindings arrive as bare names, in order.
	var bound := _run_wrapped("if tree == null or root == null or holder == null:\n\treturn \"missing\"\nreturn \"bound\"")
	_check("wrapper: bindings are usable bare names", bound["result"], "bound")

	# No implicit return: a script without `return` yields null.
	var no_ret := _run_wrapped("var x = 5")
	_check("wrapper: no explicit return -> null", no_ret["compiled"], true)
	_check("wrapper: no explicit return value", no_ret["result"], null)

	# CRLF input must compile identically.
	var crlf := _run_wrapped("var a = 1\r\nvar b = 2\r\nreturn a + b")
	_check("wrapper: CRLF source compiles", crlf["compiled"], true)
	_check("wrapper: CRLF source returns", crlf["result"], 3)

	# Statements after a string containing '#'.
	var hashy := _run_wrapped("var s = \"a#b\"\nreturn s.length()")
	_check("wrapper: '#' inside string is not a comment", hashy["result"], 3)


# ── 3. mechanics the bridge handler relies on ─────────────────────────────────

class _TestLogger extends Logger:
	var errors: PackedStringArray = []

	func _log_message(_message: String, error: bool) -> void:
		if error:
			errors.append(_message)

	func _log_error(_function: String, file: String, line: int, code: String,
			rationale: String, _editor_notify: bool, _error_type: int,
			_script_backtraces: Array[ScriptBacktrace]) -> void:
		errors.append("[%s:%d] %s: %s" % [file.get_file(), line, code, rationale])


func _test_mechanics_pins() -> void:
	# Parse-broken source fails reload() — the bridge's compile-error path.
	var broken: String = MCPExecGuardScript.build_wrapper("return (((", PackedStringArray(BINDINGS))
	var bad := GDScript.new()
	bad.source_code = broken
	_check("mechanics: parse-broken source fails reload()", bad.reload() != OK, true)

	# A runtime error aborts the call, returns null, and reaches a registered
	# Logger — the bridge's runtime_errors capture window.
	var logger := _TestLogger.new()
	OS.add_logger(logger)
	var boom := _run_wrapped("var x = null\nreturn x.foo")
	OS.remove_logger(logger)
	_check("mechanics: runtime error still compiles", boom["compiled"], true)
	_check("mechanics: runtime error returns null", boom["result"], null)
	_check("mechanics: runtime error reached the Logger", logger.errors.size() > 0, true)

	# An await-containing wrapper (scan bypassed on purpose) suspends and the
	# call returns a GDScriptFunctionState — the runtime backstop's contract.
	# If a future Godot renames this class, this check fails loudly; the static
	# scan remains the primary guard either way.
	var awaiting: String = MCPExecGuardScript.build_wrapper(
		"await tree.process_frame\nreturn 1", PackedStringArray(BINDINGS))
	var s := GDScript.new()
	s.source_code = awaiting
	_check("mechanics: await wrapper compiles", s.reload() == OK, true)
	var inst: Object = s.new()
	var holder := Node.new()
	var result: Variant = inst.callv("_mcp_run", [RefCounted.new(), self, get_root(), holder])
	_check("mechanics: await call returns an Object", typeof(result) == TYPE_OBJECT and result != null, true)
	if typeof(result) == TYPE_OBJECT and result != null:
		_check("mechanics: suspended call is a GDScriptFunctionState",
			result.get_class(), "GDScriptFunctionState")
	holder.free()


# ── helpers ───────────────────────────────────────────────────────────────────

func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s" % [_count, label])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
