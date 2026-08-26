extends SceneTree

## Headless test for step_until / sequence `report` evaluation (godot-mcp #353,
## #354).
##
## Report expressions are parsed up front but only evaluated at stop time, so
## an expression whose target does not exist yet (the step spawns it) must not
## reject the call; it must come back as {"error": ...} beside the readings
## that did evaluate. Engine singletons ride in as named inputs so
## `Engine.get_frames_per_second()` and friends are in scope.
##
## _compile_report / _evaluate_report are pure with respect to bridge state,
## so the bridge is instantiated without being added to the tree.
##
## Not wired into CI (CI has no Godot). Run on demand:
##   godot --headless --path <project-with-addon> \
##     --script res://addons/godot_mcp/test/report_lenient_headless_test.gd

const Bridge := preload("res://addons/godot_mcp/game_bridge/mcp_game_bridge.gd")

var _count := 0
var _failures := 0


func _initialize() -> void:
	var bridge: Node = Bridge.new()
	var holder := Node.new()
	holder.name = "Holder"
	root.add_child(holder)

	var names: Array = ["root", "tree"]
	var inputs: Array = [root, self]
	for entry in bridge.EXPRESSION_SINGLETONS:
		names.append(entry[0])
		inputs.append(entry[1])
	var pnames := PackedStringArray(names)

	# A parse error still rejects up front.
	var bad: Dictionary = bridge._compile_report(["1 +"], pnames, inputs)
	_check("parse error rejects", bad.has("error"), true)

	# An expression whose target does not exist yet compiles fine (#353)...
	var rr: Dictionary = bridge._compile_report([
		"root.get_node(\"Holder/Spawned\").hp",
		"root.get_node(\"Holder\").name",
		"Engine.get_frames_per_second() >= 0",
		"Time.get_ticks_msec() > 0",
	], pnames, inputs)
	_check("missing target compiles", rr.has("report"), true)
	_check("all four compiled", rr.get("report", []).size(), 4)

	# ...and evaluates to a per-expression error without taking the others down.
	var before: Dictionary = bridge._evaluate_report(rr["report"], inputs)
	var missing: Variant = before.get("root.get_node(\"Holder/Spawned\").hp")
	_check("missing target reads as {error}", missing is Dictionary and missing.has("error"), true)
	_check("sibling reading still evaluates", before.get("root.get_node(\"Holder\").name"), "Holder")
	_check("Engine singleton in scope (#354)", before.get("Engine.get_frames_per_second() >= 0"), true)
	_check("Time singleton in scope (#354)", before.get("Time.get_ticks_msec() > 0"), true)

	# Once the "step" spawns the node, the same compiled expression reads it.
	var spawned := Node.new()
	spawned.name = "Spawned"
	holder.add_child(spawned)
	var script := GDScript.new()
	script.source_code = "extends Node\nvar hp := 7\n"
	script.reload()
	spawned.set_script(script)
	var after: Dictionary = bridge._evaluate_report(rr["report"], inputs)
	_check("spawned target now reads", after.get("root.get_node(\"Holder/Spawned\").hp"), 7)

	# is_stepping() is public and false outside a window (#355).
	_check("is_stepping() false at rest", bridge.is_stepping(), false)

	print("1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	bridge.free()
	quit(1 if _failures > 0 else 0)


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s: expected %s, got %s" % [_count, label, str(expected), str(got)])
