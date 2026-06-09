extends RefCounted
class_name MCPExecGuard

## Pure helpers behind godot_exec (#243): the static denylist scan and the
## function-body wrapper that turn agent-provided GDScript into something the
## game bridge can compile and run. No engine-state access — everything here is
## headless-testable (test/exec_guard_headless_test.gd).
##
## The scan is an ACCIDENT GUARD, not a security boundary: GDScript cannot be
## sandboxed, and a determined author can trivially evade a token scan (string-
## built calls, indirection). Its job is to stop a well-meaning agent from
## casually reaching outside the game process (spawning processes, writing
## files, persisting project damage) — the threat model of local dev tooling
## where the agent already has shell access anyway.

# Tokens that reach outside the game process or persist damage to disk.
# Granularity rationale:
#  - OS.* spawn/kill/shell methods individually (the rest of OS is harmless and
#    frequently legitimate: get_ticks, environment reads, ...).
#  - DirAccess whole-class: every directory mutation lives there; losing
#    read-only listing is acceptable collateral.
#  - FileAccess at the WRITE-constant level: any direct write-mode open must
#    name one of these constants, while read access (loading a save file to
#    inspect it) stays available — which is why FileAccess is not class-blocked.
#  - ResourceSaver whole-class: writes res:// and user:// resources.
#  - EditorInterface: belt-and-suspenders; not normally reachable from a game.
const DENYLIST: Array[String] = [
	"OS.execute",
	"OS.execute_with_pipe",
	"OS.create_process",
	"OS.create_instance",
	"OS.kill",
	"OS.shell_open",
	"OS.shell_show_in_file_manager",
	"OS.move_to_trash",
	"DirAccess",
	"FileAccess.WRITE",
	"FileAccess.READ_WRITE",
	"FileAccess.WRITE_READ",
	"ResourceSaver",
	"ProjectSettings.save",
	"ProjectSettings.save_custom",
	"EditorInterface",
]

# Wrapped user code must compile under projects that escalate warnings to
# errors, and snippets legitimately ignore parameters, shadow autoload names,
# discard return values, etc. An invalid warning name here is itself a parse
# error — pinned by the headless compile test on the Godot version in use.
const WRAPPER_WARNING_IGNORES := "@warning_ignore(\"unused_parameter\", \"shadowed_global_identifier\", \"shadowed_variable\", \"shadowed_variable_base_class\", \"standalone_expression\", \"return_value_discarded\", \"unused_variable\", \"unreachable_code\", \"integer_division\")"


## Scan agent-provided source BEFORE compiling. Comments and string contents
## are stripped first, so `print("OS.execute")` passes while `OS.execute(...)`
## is caught. Returns {ok: true} or {ok: false, token, message}.
static func scan_source(source: String) -> Dictionary:
	var lex := _lex(_normalize(source))
	var stripped: String = lex["stripped"]
	if stripped.strip_edges().is_empty():
		return {
			"ok": false,
			"token": "",
			"message": "NO_CODE: exec source contains no executable code (comments only or empty)",
		}
	# Normalize the SCAN copy (never the wrapper input) so the two formatter-
	# plausible token splits — `OS . execute` and a line continuation after the
	# dot — still match. Over-matching here only over-blocks, which is the safe
	# direction for an accident guard.
	stripped = stripped.replace("\\\n", "")
	var dot_ws := RegEx.new()
	dot_ws.compile("\\s*\\.\\s*")
	stripped = dot_ws.sub(stripped, ".", true)
	if _token_re("await").search(stripped) != null:
		return {
			"ok": false,
			"token": "await",
			"message": "SYNC_ONLY: exec source is synchronous-only; 'await' is not allowed. " +
				"For waiting on game state, compose with godot_game_time step/step_until; " +
				"for sustained behavior, attach a node under `holder`.",
		}
	for token in DENYLIST:
		if _token_re(token).search(stripped) != null:
			return {
				"ok": false,
				"token": token,
				"message": "DENIED_TOKEN: source contains '%s' — blocked by the exec denylist " % token +
					"(an accident guard against process/file-write escape, not a security boundary). " +
					"Exec is for mutating the running game's state, not the system around it.",
			}
	return {"ok": true}


## Wrap user source as the body of `_mcp_run(<binding_names>)` on a RefCounted,
## so bindings are bare names (`G.wave = 5` just works) and multi-statement
## code with control flow compiles. Lines inside multiline strings are left
## untouched (prefixing them would corrupt string content); everything else is
## prefixed with one indent unit matched to the user's own indent character, so
## the wrapper can never introduce a mixed-tabs-and-spaces parse error.
static func build_wrapper(source: String, binding_names: PackedStringArray) -> String:
	var normalized := _normalize(source)
	var lex := _lex(normalized)
	var in_string_lines: Array = lex["in_string_lines"]
	var lines := normalized.split("\n")
	var indent := _detect_indent_unit(lines, in_string_lines, lex["in_bracket_lines"])
	var body: Array = []
	for i in lines.size():
		var line: String = lines[i]
		var starts_in_string: bool = in_string_lines[i] if i < in_string_lines.size() else false
		if starts_in_string or line.strip_edges().is_empty():
			body.append(line)
		else:
			body.append(indent + line)
	return "extends RefCounted\n\n%s\nfunc _mcp_run(%s):\n%s\n" % [
		WRAPPER_WARNING_IGNORES,
		", ".join(binding_names),
		"\n".join(body),
	]


static func _normalize(source: String) -> String:
	return source.replace("\r\n", "\n").replace("\r", "\n")


static func _token_re(token: String) -> RegEx:
	# Word-boundary match so `OS.execute` does not hit `MyOS.executed` — and,
	# because `_` is a word character, `OS.execute` does NOT match
	# `OS.execute_with_pipe` (which has its own entry).
	var re := RegEx.new()
	re.compile("\\b%s\\b" % token.replace(".", "\\."))
	return re


## One lexical pass tracking string/comment/bracket state. Returns:
##   stripped:         source with comments removed and string CONTENTS removed
##                     (quotes kept), line structure preserved — the scan target
##   in_string_lines:  per line, whether it STARTS inside a (triple-quoted)
##                     string — those lines must not be indent-prefixed
##   in_bracket_lines: per line, whether it STARTS inside an open ()/[]/{} —
##                     bracket interiors have free-form indentation, so these
##                     lines must not drive indent-unit detection
## Known accepted miss: raw strings (r"...") treat backslash as an escape here
## though GDScript does not — the failure mode is over-blocking or an honest
## compile error, never silent corruption.
static func _lex(source: String) -> Dictionary:
	var stripped := ""
	var in_string_lines: Array = [false]
	var in_bracket_lines: Array = [false]
	var quote := ""  # active quote: '"', "'", '"""', or "'''"
	var depth := 0  # open-bracket depth, tracked outside strings/comments
	var i := 0
	var n := source.length()
	while i < n:
		var c := source[i]
		if quote != "":
			if c == "\n":
				stripped += "\n"
				in_string_lines.append(true)
				in_bracket_lines.append(depth > 0)
				i += 1
			elif c == "\\":
				# An escaped char never ends the string — but an escaped
				# NEWLINE (a line continuation inside the string) still starts
				# a new physical line. Record it, or every following line would
				# be mis-indexed and build_wrapper would prefix indent into the
				# string's runtime value: silent corruption.
				if i + 1 < n and source[i + 1] == "\n":
					stripped += "\n"
					in_string_lines.append(true)
					in_bracket_lines.append(depth > 0)
				i += 2
			elif source.substr(i, quote.length()) == quote:
				stripped += quote
				i += quote.length()
				quote = ""
			else:
				i += 1
			continue
		if c == "#":
			while i < n and source[i] != "\n":
				i += 1
			continue
		if c == "\"" or c == "'":
			quote = c.repeat(3) if source.substr(i, 3) == c.repeat(3) else c
			stripped += quote
			i += quote.length()
			continue
		if c == "(" or c == "[" or c == "{":
			depth += 1
		elif c == ")" or c == "]" or c == "}":
			depth = maxi(0, depth - 1)
		if c == "\n":
			stripped += "\n"
			in_string_lines.append(false)
			in_bracket_lines.append(depth > 0)
			i += 1
			continue
		stripped += c
		i += 1
	return {
		"stripped": stripped,
		"in_string_lines": in_string_lines,
		"in_bracket_lines": in_bracket_lines,
	}


static func _detect_indent_unit(lines: PackedStringArray, in_string_lines: Array, in_bracket_lines: Array) -> String:
	# Match the user's indent character: GDScript rejects mixed tabs/spaces in
	# one indentation run, so the wrapper prefix must agree with the body. Four
	# spaces composes with any space width (nesting only has to increase).
	# Bracket-continuation lines are skipped: their indentation is free-form
	# (a space-aligned array literal in otherwise tab-indented code is legal),
	# so they must not decide the prefix for real block lines.
	for i in lines.size():
		if i < in_string_lines.size() and in_string_lines[i]:
			continue
		if i < in_bracket_lines.size() and in_bracket_lines[i]:
			continue
		var line := lines[i]
		if line.strip_edges().is_empty():
			continue
		if line.begins_with("\t"):
			return "\t"
		if line.begins_with(" "):
			return "    "
	return "\t"
