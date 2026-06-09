extends SceneTree

## Headless test for the project.godot staleness diff (core/mcp_utils.gd, #245).
##
## Exercises the PURE diff_project_staleness(disk_autoloads, mem_autoloads,
## disk_input_keys, mem_input_keys) — the false-positive-proof content compare
## behind godot_project check_stale and the get_log_messages / get_input_map
## advisories. The I/O layer (reading project.godot off disk + ProjectSettings)
## needs a live editor and is exercised by the live MCP validation, not here.
##
## Diff contract:
##   - autoloads: symmetric — added (disk∖mem), removed (mem∖disk), changed
##     (raw value differs, incl. the "*" singleton prefix).
##   - input: additive only — added (disk∖mem); a key only in memory is NOT stale
##     (built-in ui_* / editor-only actions live there). ui_* filtering itself
##     happens in the I/O readers, so the inputs handed here are already filtered.
##
## Not wired into CI (CI has no Godot). Run on demand against a project that has
## the addon copied/junctioned in:
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/project_staleness_diff_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const MCPUtils := preload("res://addons/godot_mcp/core/mcp_utils.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_test_in_sync()
	_test_autoload_added()
	_test_autoload_removed()
	_test_autoload_changed()
	_test_singleton_prefix_toggle_is_changed()
	_test_input_added()
	_test_input_additive_only()
	_test_empty_disk_autoloads_reports_removed()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _test_in_sync() -> void:
	var a := {"G": "*res://g.gd", "MCPGameBridge": "res://bridge.gd"}
	var r := MCPUtils.diff_project_staleness(a, a.duplicate(), ["fire", "dash"], ["fire", "dash"])
	_check("in-sync: not stale", r["stale"], false)
	_check("in-sync: no autoload added", r["autoload"]["added"], [])
	_check("in-sync: no autoload removed", r["autoload"]["removed"], [])
	_check("in-sync: no autoload changed", r["autoload"]["changed"], [])
	_check("in-sync: no input added", r["input"]["added"], [])
	_check("in-sync: summary is the matches message", r["summary"].contains("matches the editor"), true)


func _test_autoload_added() -> void:
	# Disk has an autoload memory hasn't loaded — the classic "Identifier not found".
	var disk := {"G": "*res://g.gd", "FX": "*res://fx.gd"}
	var mem := {"G": "*res://g.gd"}
	var r := MCPUtils.diff_project_staleness(disk, mem, [], [])
	_check("autoload added: stale", r["stale"], true)
	_check("autoload added: names the added autoload", r["autoload"]["added"], ["FX"])
	_check("autoload added: nothing removed", r["autoload"]["removed"], [])
	_check("autoload added: summary mentions it + restart", r["summary"].contains("FX") and r["summary"].contains("godot_editor restart"), true)


func _test_autoload_removed() -> void:
	var disk := {"G": "*res://g.gd"}
	var mem := {"G": "*res://g.gd", "Old": "*res://old.gd"}
	var r := MCPUtils.diff_project_staleness(disk, mem, [], [])
	_check("autoload removed: stale", r["stale"], true)
	_check("autoload removed: names the removed autoload", r["autoload"]["removed"], ["Old"])
	_check("autoload removed: nothing added", r["autoload"]["added"], [])


func _test_autoload_changed() -> void:
	var disk := {"G": "*res://g_new.gd"}
	var mem := {"G": "*res://g_old.gd"}
	var r := MCPUtils.diff_project_staleness(disk, mem, [], [])
	_check("autoload changed: stale", r["stale"], true)
	_check("autoload changed: names the repointed autoload", r["autoload"]["changed"], ["G"])
	_check("autoload changed: not counted as added/removed", [r["autoload"]["added"], r["autoload"]["removed"]], [[], []])


func _test_singleton_prefix_toggle_is_changed() -> void:
	# Toggling the singleton "*" prefix is a real divergence the raw compare catches.
	var disk := {"G": "res://g.gd"}      # singleton turned off on disk
	var mem := {"G": "*res://g.gd"}      # still a singleton in memory
	var r := MCPUtils.diff_project_staleness(disk, mem, [], [])
	_check("prefix toggle: stale", r["stale"], true)
	_check("prefix toggle: reported as changed", r["autoload"]["changed"], ["G"])


func _test_input_added() -> void:
	var r := MCPUtils.diff_project_staleness({}, {}, ["fire", "dash"], ["fire"])
	_check("input added: stale", r["stale"], true)
	_check("input added: names the new action", r["input"]["added"], ["dash"])


func _test_input_additive_only() -> void:
	# An action only in memory (e.g. an editor/built-in action) must NOT be stale.
	var r := MCPUtils.diff_project_staleness({}, {}, ["fire"], ["fire", "editor_only"])
	_check("input additive-only: not stale", r["stale"], false)
	_check("input additive-only: nothing added", r["input"]["added"], [])


func _test_empty_disk_autoloads_reports_removed() -> void:
	# Pure-function behavior with an empty disk set: every in-memory autoload reads
	# as removed. (The orchestrator guards the "[autoload] section absent" case so
	# this only fires when the section is genuinely present-but-empty.)
	var r := MCPUtils.diff_project_staleness({}, {"G": "*res://g.gd"}, [], [])
	_check("empty disk autoloads: stale", r["stale"], true)
	_check("empty disk autoloads: all reported removed", r["autoload"]["removed"], ["G"])


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
