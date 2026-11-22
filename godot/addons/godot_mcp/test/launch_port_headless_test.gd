extends SceneTree

## Headless test for the launch-time port override (core/mcp_utils.gd).
##
## parse_launch_port(user_args, env_value) is pure, so every precedence and
## validation rule is checked here without starting an editor:
##   - nothing set -> port 0 (the plugin falls back to Port override / 6550)
##   - GODOT_MCP_PORT alone, with surrounding whitespace trimmed
##   - a non-empty --mcp-port=N wins over the environment; the last one counts
##   - an empty --mcp-port= or env value counts as unset
##   - non-integer and out-of-range values give port 0 plus an error naming
##     the source, and an invalid argument does not fall back to the env value
##
## Not wired into CI (CI has no Godot). Run on demand against any project with
## the addon:
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/launch_port_headless_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const MCPUtils := preload("res://addons/godot_mcp/core/mcp_utils.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_test_unset()
	_test_env()
	_test_arg()
	_test_invalid()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _test_unset() -> void:
	var r := _parse([], "")
	_check("unset: port 0", r.port, 0)
	_check("unset: no source", r.source, "")
	_check("unset: no error", r.error, "")
	_check("unrelated args ignored", _parse(["--foo=1", "--mcp-portx=2"], "").port, 0)
	_check("whitespace-only env counts as unset", _parse([], "  ").port, 0)


func _test_env() -> void:
	var r := _parse([], "6551")
	_check("env: port", r.port, 6551)
	_check("env: source", r.source, MCPUtils.LAUNCH_PORT_ENV)
	_check("env: no error", r.error, "")
	_check("env: whitespace trimmed", _parse([], " 6552\n").port, 6552)


func _test_arg() -> void:
	var r := _parse(["--mcp-port=6553"], "")
	_check("arg: port", r.port, 6553)
	_check("arg: source", r.source, "--mcp-port")
	_check("arg beats env", _parse(["--mcp-port=6554"], "6551").port, 6554)
	_check("last arg counts", _parse(["--mcp-port=6555", "--mcp-port=6556"], "").port, 6556)
	_check("empty arg falls back to env", _parse(["--mcp-port="], "6551").port, 6551)
	_check("port bounds: min", _parse(["--mcp-port=%d" % MCPConstants.PORT_MIN], "").port, MCPConstants.PORT_MIN)
	_check("port bounds: max", _parse(["--mcp-port=%d" % MCPConstants.PORT_MAX], "").port, MCPConstants.PORT_MAX)


func _test_invalid() -> void:
	for raw in ["abc", "65536", "0", "-1", "6550.5"]:
		var r := _parse([], raw)
		_check("invalid env '%s': port 0" % raw, r.port, 0)
		_check("invalid env '%s': error names the source" % raw,
			r.error.contains(MCPUtils.LAUNCH_PORT_ENV), true)
	var arg_result := _parse(["--mcp-port=99999"], "6551")
	_check("invalid arg: port 0, no fallback to env", arg_result.port, 0)
	_check("invalid arg: error names the argument", arg_result.error.contains("--mcp-port"), true)


func _parse(args: Array, env_value: String) -> Dictionary:
	return MCPUtils.parse_launch_port(PackedStringArray(args), env_value)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
