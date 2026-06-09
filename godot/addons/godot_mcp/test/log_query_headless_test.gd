extends SceneTree

## Headless test for log filtering / incremental reads (core/mcp_logger.gd, #244).
##
## Validates MCPLogger.query() — the filter behind godot_editor get_log_messages:
##   - severity: "all" / "error" (drops warnings) / "warning" (only warnings)
##   - since: returns only entries newer than a cursor (the incremental read)
##   - limit: keeps the most recent N matches
##   - cursor / total_count / match_count / returned_count bookkeeping
## plus that _log_error stamps a monotonic, never-reset `seq` on each entry.
##
## Not wired into CI (CI has no Godot). Run on demand against any project that has
## the addon copied in:
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/log_query_headless_test.gd"
##
## Exit code 0 = all checks passed, 1 = at least one failed.

const MCPLogger := preload("res://addons/godot_mcp/core/mcp_logger.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	_test_query_filters()
	_test_seq_stamping_via_real_errors()

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


# ── query() over a deterministic, hand-seeded buffer ─────────────────────────

func _test_query_filters() -> void:
	# Seed the static buffer directly so the test is independent of whatever the
	# engine logged at startup. seq values are explicit; cursor must equal the
	# highest seq issued. (0=ERROR, 1=WARNING, 2=SCRIPT, 3=SHADER.)
	MCPLogger._errors = [
		_entry(10, 0, "boom"),      # error
		_entry(11, 1, "careful"),   # warning
		_entry(12, 2, "nil call"),  # script error
		_entry(13, 1, "deprecated"),# warning
		_entry(14, 3, "bad shader"),# shader error
	]
	MCPLogger._seq = 14

	var all := MCPLogger.query(0, "all", 0)
	_check("all: total_count is the whole buffer", all["total_count"], 5)
	_check("all: match_count counts every severity", all["match_count"], 5)
	_check("all: returned_count with no limit", all["returned_count"], 5)
	_check("all: cursor is the highest seq", all["cursor"], 14)

	var errors := MCPLogger.query(0, "error", 0)
	_check("error: drops the two warnings", errors["match_count"], 3)
	_check("error: keeps error/script/shader", _seqs(errors["messages"]), [10, 12, 14])

	var warnings := MCPLogger.query(0, "warning", 0)
	_check("warning: only the two warnings", warnings["match_count"], 2)
	_check("warning: their seqs", _seqs(warnings["messages"]), [11, 13])

	# Incremental: since a cursor, return only strictly-newer entries.
	var since := MCPLogger.query(12, "all", 0)
	_check("since: only entries with seq > 12", _seqs(since["messages"]), [13, 14])
	_check("since: cursor unchanged (highest seq)", since["cursor"], 14)

	# since composes with severity.
	var since_errors := MCPLogger.query(11, "error", 0)
	_check("since + error: seq > 11 and not a warning", _seqs(since_errors["messages"]), [12, 14])

	# At-or-past the cursor: nothing new.
	var caught_up := MCPLogger.query(14, "all", 0)
	_check("since == cursor: no new messages", caught_up["match_count"], 0)
	_check("since == cursor: cursor still reported", caught_up["cursor"], 14)

	# limit keeps the most recent N matches (match_count reflects the full match).
	var limited := MCPLogger.query(0, "all", 2)
	_check("limit: returned_count capped", limited["returned_count"], 2)
	_check("limit: match_count is pre-limit", limited["match_count"], 5)
	_check("limit: keeps the most recent", _seqs(limited["messages"]), [13, 14])


# ── seq stamping through the real _log_error path ────────────────────────────

func _test_seq_stamping_via_real_errors() -> void:
	# MCPLogger registered itself via _static_init, so push_error reaches
	# _log_error and a `seq` is stamped. Use distinct messages so the dedup
	# (file+line+message+type) does not collapse them.
	MCPLogger.clear_errors()
	var base := MCPLogger.get_seq()
	push_error("mcp_log_test_alpha_%d" % base)
	push_error("mcp_log_test_beta_%d" % base)

	# Read only what we just produced; ignore any incidental engine errors.
	var mine := MCPLogger.query(base, "all", 0)
	_check("seq: cursor advanced past baseline", MCPLogger.get_seq() > base, true)
	var seqs: Array = _seqs(mine["messages"])
	var monotonic := true
	for i in range(1, seqs.size()):
		if int(seqs[i]) <= int(seqs[i - 1]):
			monotonic = false
	_check("seq: stamped strictly increasing", monotonic, true)
	# clear_errors must NOT reset the cursor (held cursors stay valid).
	var before_clear := MCPLogger.get_seq()
	MCPLogger.clear_errors()
	_check("seq: clear_errors does not rewind the cursor", MCPLogger.get_seq() >= before_clear, true)


# ── helpers ──────────────────────────────────────────────────────────────────

func _entry(seq: int, error_type: int, message: String) -> Dictionary:
	return {
		"timestamp": 0,
		"type": "Test",
		"message": message,
		"file": "res://test.gd",
		"line": seq,
		"function": "_test",
		"error_type": error_type,
		"frames": [],
		"seq": seq,
	}


func _seqs(messages: Array) -> Array:
	var out: Array = []
	for m in messages:
		out.append(int(m.get("seq", -1)))
	return out


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
