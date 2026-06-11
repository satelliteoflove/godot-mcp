extends SceneTree

## Cross-language wire-contract check for the watch lifecycle (#286).
##
## The watch contract (request/response/event/sample key names) lives as literals
## on BOTH sides of the bridge: the GDScript sampler PRODUCES the response keys,
## the TypeScript server CONSUMES them. Before this test, each side asserted only
## its own literals, so a rename on either side passed both suites green. This
## suite pins the PRODUCER side against a shared artifact
## (res://addons/godot_mcp/test/watch_contract.json); the server vitest
## (watch-contract.test.ts) pins the CONSUMER side against the SAME file. A rename
## now breaks its own suite.
##
## KNOWN BOUNDARY: the editor command layer's request-key consume
## (runtime_state_commands.gd) and the editor->game positional decode are
## GDScript<->GDScript and not on this suite's runtime path — the request-key
## NAMES are pinned on the TS send side instead. This suite pins the high-value
## cross-language surface: the watch_collect response keys, the per-event/sample
## dict keys, and the watch_start response keys the sampler owns.
##
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/watch_contract_headless_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

var _count := 0
var _failures := 0

const CONTRACT_PATH := "res://addons/godot_mcp/test/watch_contract.json"


class _Emitter extends Node:
	signal fired
	signal hit(amount)
	var score := 7


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== WATCH CONTRACT TEST =====================\n")

	var contract := _load_contract()
	if contract.is_empty():
		_check("contract artifact loads and parses to a Dictionary", false, true)
		_finish()
		return
	_check("contract artifact loads and parses to a Dictionary", true, true)

	# Within-artifact consistency: the editor->game positional order must list the
	# same names as the named request (the editor re-encodes one as the other).
	_check("positional arg order matches the named request keys",
		contract["watch_start_request_positional"],
		(contract["watch_start_request"] as Dictionary)["required"])

	var sampler := MCPRuntimeStateSampler.new()
	root.add_child(sampler)
	var emitter := _Emitter.new()
	emitter.name = "FakeAutoload"
	root.add_child(emitter)
	await process_frame

	# One field + two resolvable signals (0-arg `fired`, 1-arg `hit`) + one
	# unresolvable spec, so every contract shape gets exercised in one window.
	var start_res: Dictionary = sampler.start(
		[{"path": "/root/FakeAutoload", "fields": ["score"]}],
		60, 5000,
		[
			{"path": "/root/FakeAutoload", "signal": "fired"},
			{"path": "/root/FakeAutoload", "signal": "hit"},
			{"path": "/root/NoSuchNode", "signal": "fired"},
		])

	# watch_start response: the sampler owns every key EXCEPT `started`, which the
	# bridge adds when it wraps this dict (mcp_game_bridge.gd). So assert the
	# sampler returns the contract keys minus that one, and that `started` is
	# genuinely a contract key.
	var wsr: Array = (contract["watch_start_response"] as Dictionary)["required"]
	_check("'started' is a watch_start_response contract key (added by the bridge)", wsr.has("started"), true)
	var sampler_start_keys: Array = wsr.duplicate()
	sampler_start_keys.erase("started")
	_check_exact_keys("watch_start: sampler returns the response keys minus 'started'",
		start_res.keys(), sampler_start_keys)

	# unresolved_signal entry shape (the one bogus spec).
	var unresolved: Array = start_res.get("unresolved_signals", [])
	_check("watch_start: exactly one unresolved signal", unresolved.size(), 1)
	if unresolved.size() == 1:
		_check_exact_keys("unresolved_signal: entry keys",
			(unresolved[0] as Dictionary).keys(),
			(contract["unresolved_signal"] as Dictionary)["required"])

	# Records one arg-less event (fired) and one event with args (hit) — exercises
	# both the required-only and the optional-`args` event shapes.
	emitter.fired.emit()
	emitter.hit.emit(3)

	# Drive a few field samples deterministically (interval forced to 1, as in the
	# timeline test) so `fields` is non-empty and field_sample keys can be checked.
	sampler._sample_interval = 1
	for i in 3:
		sampler._process(0.0)

	var result: Dictionary = sampler.collect()

	# watch_collect response: EXACT key set (catches a renamed/added/dropped key on
	# the producer side — the headline of #286).
	_check_exact_keys("watch_collect: response key set",
		result.keys(),
		(contract["watch_collect_response"] as Dictionary)["required"])

	# field_sample shape: every sample of every field.
	var field_contract: Array = (contract["field_sample"] as Dictionary)["required"]
	var fields: Dictionary = result.get("fields", {})
	_check("watch_collect: the score field was sampled", fields.has("/root/FakeAutoload:score"), true)
	var sample_violations := 0
	for full_key in fields:
		for sample in (fields[full_key] as Array):
			if not _keys_match_exact((sample as Dictionary).keys(), field_contract):
				sample_violations += 1
	_check("field_sample: every sample dict matches the contract keys", sample_violations, 0)

	# event shape: required keys present, only `args` allowed beyond them.
	var ev_required: Array = (contract["event"] as Dictionary)["required"]
	var ev_optional: Array = (contract["event"] as Dictionary)["optional"]
	var events: Array = result.get("events", [])
	_check("watch_collect: both signal emissions recorded", events.size(), 2)
	for ev in events:
		_check_event_keys("event: keys for %s" % str((ev as Dictionary).get("signal")),
			(ev as Dictionary).keys(), ev_required, ev_optional)
	# And confirm the optional `args` key is actually exercised (the hit event).
	var with_args := events.filter(func(e): return (e as Dictionary).has("args"))
	_check("event: the optional 'args' key is exercised (hit emission)", with_args.size(), 1)

	sampler.stop()
	_finish()


func _load_contract() -> Dictionary:
	var f := FileAccess.open(CONTRACT_PATH, FileAccess.READ)
	if f == null:
		printerr("could not open contract artifact: %s" % CONTRACT_PATH)
		return {}
	var txt := f.get_as_text()
	f.close()
	var parsed = JSON.parse_string(txt)
	if typeof(parsed) != TYPE_DICTIONARY:
		printerr("contract artifact did not parse to a Dictionary")
		return {}
	return parsed


func _keys_match_exact(actual: Array, required: Array) -> bool:
	if actual.size() != required.size():
		return false
	for k in required:
		if not actual.has(k):
			return false
	return true


func _check_exact_keys(label: String, actual: Array, required: Array) -> void:
	_check_event_keys(label, actual, required, [])


func _check_event_keys(label: String, actual: Array, required: Array, optional: Array) -> void:
	var missing := []
	for k in required:
		if not actual.has(k):
			missing.append(k)
	var allowed: Array = required + optional
	var extra := []
	for k in actual:
		if not allowed.has(k):
			extra.append(k)
	_check(label + " — required keys present", missing, [])
	_check(label + " — no keys outside the contract", extra, [])


func _finish() -> void:
	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS - %d checks" % _count)
	else:
		printerr("FAILED - %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
