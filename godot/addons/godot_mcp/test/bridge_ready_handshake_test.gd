extends SceneTree

## Regression guard for the bridge-ready handshake (#241).
## Drives the REAL MCPGameBridge node.
##
## THE BUG: the bridge autoload's _ready() runs BEFORE the main scene is added to
## the tree. The debug session is already live, so the editor's has_active_session()
## returns true and it forwards an input sequence — but with current_scene still
## null there is nothing to consume the input. The sequence reports actions_executed
## > 0 (apparent success) yet has zero effect: a silent drop. A round-trip's delay
## lets the scene load, which is why "probe before injecting" worked around it.
##
## THE FIX: the bridge announces `godot_mcp:bridge_ready` only AFTER current_scene
## exists plus one frame; the editor gates input on that signal. This test asserts
## the FIXED invariant directly on the bridge: it must NOT announce ready while the
## tree has no current_scene, and MUST announce once a scene is present.
##
## EngineDebugger.send_message is an inert no-op without a live debug session, so
## the real send is harmless here; _ready_announced is the observable proxy (it is
## set in lockstep with the send). The bridge's own _ready() early-returns without a
## session, so the readiness coroutine is invoked directly, mirroring the
## input-sequence stuck-held test.
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/bridge_ready_handshake_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

var _count := 0
var _failures := 0


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== BRIDGE-READY HANDSHAKE TEST =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var bridge := MCPGameBridge.new()
	root.add_child(bridge)
	for i in 3:
		await process_frame

	_check("bridge has NOT announced ready on construction", bridge._ready_announced, false)

	# Start the readiness watcher with NO current_scene set: it must keep waiting.
	bridge._announce_bridge_ready_when_drivable()
	for i in 5:
		await process_frame
	_check("bridge withholds ready while current_scene is null (the bug guard)",
		bridge._ready_announced, false)

	# A scene appears (the engine adds the main scene after autoloads). The watcher
	# should observe it, give it one settle frame, then announce ready.
	var scene := Node.new()
	scene.name = "FakeMainScene"
	root.add_child(scene)
	current_scene = scene
	for i in 5:
		await process_frame
	_check("bridge announces ready once a current_scene exists", bridge._ready_announced, true)

	# Idempotent: a second emit must not re-fire (guards against double signals).
	var before := bridge._ready_announced
	bridge._emit_bridge_ready("res://other.tscn")
	_check("emit is idempotent once announced", bridge._ready_announced == before and before == true, true)

	current_scene = null
	root.remove_child(scene)
	scene.free()
	root.remove_child(bridge)
	bridge.free()

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
