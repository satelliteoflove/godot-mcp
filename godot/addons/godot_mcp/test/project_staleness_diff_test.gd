extends SceneTree

## Headless test for the project.godot staleness diff (core/mcp_utils.gd, #245).
##
## Two layers:
##   1. The PURE diff_project_staleness(disk_autoloads, mem_autoloads,
##      disk_input_keys, mem_input_keys) — the false-positive-proof content compare
##      behind godot_project check_stale and the get_log_messages / get_input_map
##      advisories.
##   2. An integration pass running the REAL I/O readers (the regex scan of
##      project.godot + the ProjectSettings read) against THIS project. A freshly
##      launched headless process always reads project.godot fresh, so it is
##      in-sync by construction — which makes this the repeatable no-false-positive
##      guard for the fiddliest, most format-sensitive code. (The stale path itself
##      is covered by the pure diffs above and by live MCP validation.)
##
## Diff contract:
##   - autoloads: symmetric — added (disk∖mem), removed (mem∖disk), changed
##     (raw value differs, incl. the "*" singleton prefix).
##   - input: additive only — added (disk∖mem); a key only in memory is NOT stale
##     (built-in ui_* / editor-only actions live there). ui_* filtering itself
##     happens in the I/O readers, so the inputs handed the pure diff are filtered.
##
## Not wired into CI (CI has no Godot). Run on demand against an addon-enabled
## project (the integration pass expects the addon's MCPGameBridge autoload):
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
	_test_io_against_real_project()

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
	_check("autoload added: summary mentions it + restart", r["summary"].contains("FX") and r["summary"].contains("godot_editor_edit restart"), true)


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


func _test_io_against_real_project() -> void:
	# Run the REAL readers against this project's actual project.godot + in-memory
	# ProjectSettings. Project-agnostic invariants only, so this holds for any
	# addon-enabled project, not just run-n-gun.
	var disk := MCPUtils._read_disk_project_sections()
	_check("io: project.godot was read", disk.is_empty(), false)
	_check("io: [autoload] section found on disk", disk.get("has_autoload_section", false), true)
	# The addon registers its own bridge autoload in every project it runs in.
	_check("io: disk scan finds the bridge autoload", disk.get("autoload", {}).has("MCPGameBridge"), true)
	# The disk [input] scan must never surface built-in ui_* actions.
	var disk_ui: Array = disk.get("input_keys", []).filter(func(k): return str(k).begins_with("ui_"))
	_check("io: disk input scan excludes ui_*", disk_ui, [])

	var mem := MCPUtils._read_mem_sections()
	_check("io: memory scan finds the bridge autoload", mem["autoload"].has("MCPGameBridge"), true)
	var mem_ui: Array = mem["input_keys"].filter(func(k): return str(k).begins_with("ui_"))
	_check("io: memory input scan excludes ui_*", mem_ui, [])

	# The point: a fresh, in-sync project must report NOT stale — disk and memory
	# agree across both sections. A regression in either real reader breaks this.
	var report := MCPUtils.detect_project_staleness()
	_check("io: in-sync project is not stale", report["stale"], false)
	_check("io: in-sync autoload added empty", report["autoload"]["added"], [])
	_check("io: in-sync autoload removed empty", report["autoload"]["removed"], [])
	_check("io: in-sync input added empty", report["input"]["added"], [])

	# _unquote round-trips the on-disk autoload value format.
	_check("io: _unquote strips surrounding quotes", MCPUtils._unquote("\"*res://x.gd\""), "*res://x.gd")
	_check("io: _unquote leaves an unquoted value", MCPUtils._unquote("res://x.gd"), "res://x.gd")


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
