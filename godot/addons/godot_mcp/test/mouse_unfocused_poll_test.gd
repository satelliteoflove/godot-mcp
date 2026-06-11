extends SceneTree

## Tier-2 probe (godot-mcp #228): does the POLLED Viewport.get_mouse_position() —
## the exact value PlacementController.gd:77 reads to position the placement ghost
## and to pick the hold-to-paint cell — follow injected mouse motion when the game
## window is UNFOCUSED? That is the real MCP topology: the editor (or any other
## app) holds OS focus while the game runs in the background and the in-process
## bridge injects into the game's own Input singleton.
##
## WHY IT MATTERS. The proven keystone (mouse_polled_position_test) is that on a
## FOCUSED real window the poll live-reflects the physical OS cursor and injection
## does NOT move it. That bounds "robust mouse support": event-path clicks work,
## but cursor-follow / hover-preview / poll-based hold-to-paint do not. The open
## question is whether that ceiling is PERMANENT or only holds while the game
## window has focus. If an unfocused window stops receiving physical-cursor
## updates, the injected motion may be the only thing left driving the poll — and
## the ceiling collapses to a hover-only edge case.
##
## METHOD. Drop the main window's focus with a second NATIVE window (empirically
## flips window_is_focused(MAIN)->false while the main loop keeps ticking). In each
## focus state inject TWO distinct motions and ask: does the POLL DELTA track the
## EVENT-PATH DELTA? Comparing deltas (not absolute positions) is scale-invariant
## (cancels content-scale) and robust against wherever the physical cursor sits. An
## _input spy on root confirms the injected event actually REACHED root's viewport;
## if it did not (a same-process sibling stole routing — impossible cross-process),
## the unfocused result is flagged INCONCLUSIVE rather than mis-read as "undrivable".
##
## WINDOWED ONLY — focus is meaningless headless (and headless poll is trivially
## driven; that baseline is already guarded by mouse_polled_position_test).
##   & "<godot.exe>" --path "<city-builder>" \
##       --script "res://addons/godot_mcp/test/mouse_unfocused_poll_test.gd"
## Exit 0 = ran and reached a DEFINITIVE answer (either ceiling outcome);
## Exit 1 = a measurement invariant broke, or the unfocused result was inconclusive.

var _count := 0
var _failures := 0
var _evt_pos := Vector2(-1, -1)   # last motion position seen on root's event path


class EvtSpy extends Node:
	var owner_test
	func _input(event: InputEvent) -> void:
		if event is InputEventMouseMotion:
			owner_test._evt_pos = (event as InputEventMouseMotion).position


func _initialize() -> void:
	_run()


func _approx(a: Vector2, b: Vector2, eps := 3.0) -> bool:
	return a.distance_to(b) < eps


func _inject(p: Vector2) -> void:
	var mm := InputEventMouseMotion.new()
	mm.position = p
	mm.global_position = p
	Input.parse_input_event(mm)
	Input.flush_buffered_events()


# Inject two distinct motions; return poll + event-path readings for each so the
# caller can compare DELTAS (scale-invariant, physical-cursor-independent).
func _two_point(a: Vector2, b: Vector2) -> Dictionary:
	_inject(a)
	await process_frame
	var poll_a := root.get_mouse_position()
	var evt_a := _evt_pos
	_inject(b)
	await process_frame
	var poll_b := root.get_mouse_position()
	var evt_b := _evt_pos
	# settle read: did the OS reassert the cursor a few frames later?
	for i in 5:
		await process_frame
	var poll_settle := root.get_mouse_position()
	return {
		"poll_delta": poll_b - poll_a,
		"evt_delta": evt_b - evt_a,
		"poll_a": poll_a, "poll_b": poll_b,
		"evt_a": evt_a, "evt_b": evt_b,
		"poll_settle": poll_settle,
	}


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n================= UNFOCUSED POLLED-POSITION PROBE =================\n")
	var ds := DisplayServer.get_name()
	print("DisplayServer: %s" % ds)
	if ds == "headless":
		print("Headless has no OS focus and drives the poll trivially — run WINDOWED.")
		print("(baseline guarded by mouse_polled_position_test). Skipping.")
		quit(0)
		return
	print("NOTE: assumes the physical mouse is NOT moved during the run.")

	var main := DisplayServer.MAIN_WINDOW_ID
	root.gui_embed_subwindows = false  # so the focus-stealer is a real OS window

	var spy := EvtSpy.new()
	spy.owner_test = self
	root.add_child(spy)

	DisplayServer.window_move_to_foreground(main)
	for i in 10:
		await process_frame
	_check("precondition: main window starts FOCUSED", DisplayServer.window_is_focused(main), true)

	# ---------- Phase 1: FOCUSED ----------
	print("\n[FOCUSED] inject two motions, compare poll-delta vs event-delta")
	var f = await _two_point(Vector2(160, 140), Vector2(520, 420))
	_dump("focused", f)
	var f_events_arrived: bool = (f["evt_delta"] as Vector2).length() > 50.0
	_check("FOCUSED: injected events reached root's event path", f_events_arrived, true)
	var f_poll_driven: bool = f_events_arrived and _approx(f["poll_delta"], f["evt_delta"])
	_check("FOCUSED: poll does NOT track injection (proven keystone)", f_poll_driven, false)

	# ---------- Phase 2: UNFOCUSED ----------
	print("\n[UNFOCUSED] spawn a second native window to steal focus, then re-measure")
	var stealer := Window.new()
	stealer.title = "focus-stealer"
	stealer.size = Vector2i(240, 160)
	stealer.position = Vector2i(40, 40)
	root.add_child(stealer)
	stealer.show()
	for i in 5:
		await process_frame
	stealer.grab_focus()
	for i in 10:
		await process_frame

	var dropped := not DisplayServer.window_is_focused(main)
	_check("precondition: main window is now UNFOCUSED", dropped, true)

	if not dropped:
		print("Could not drop focus — cannot answer. INCONCLUSIVE.")
		_failures += 1
	else:
		var u = await _two_point(Vector2(180, 160), Vector2(560, 460))
		_dump("unfocused", u)
		var u_events_arrived: bool = (u["evt_delta"] as Vector2).length() > 50.0
		var u_poll_driven: bool = u_events_arrived and _approx(u["poll_delta"], u["evt_delta"])

		print("\n---------------------------- VERDICT ----------------------------")
		if not u_events_arrived:
			# Injected event never reached root while unfocused: in THIS single
			# process a focused sibling window may have stolen routing. That cannot
			# happen across processes, so this is inconclusive, not a "no".
			print("INCONCLUSIVE — injected motion did not reach root's event path while")
			print("unfocused (a same-process sibling window likely stole routing).")
			print("Needs a TWO-PROCESS test (editor focused, game backgrounded).")
			_failures += 1
		elif u_poll_driven:
			print("*** CEILING COLLAPSES ***")
			print("Unfocused, injection DRIVES the polled get_mouse_position(): the")
			print("placement ghost and poll-based hold-to-paint ARE drivable in the")
			print("real MCP topology. The keystone limit is a focused-window-only,")
			print("human-actively-hovering edge case.")
		else:
			print("*** CEILING STANDS ***")
			print("Even unfocused, the event reached root but the poll IGNORED it:")
			print("get_mouse_position() does not follow injection on a real window.")
			print("Cursor-follow / hover-preview / poll-based hold-to-paint remain")
			print("undrivable; drive only event-path interactions and confirm by")
			print("game-state delta, never by the polled cursor.")
		print("-----------------------------------------------------------------")

	if is_instance_valid(stealer):
		stealer.queue_free()
	for i in 5:
		await process_frame

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks, definitive answer reached" % _count)
	else:
		printerr("FAILED/INCONCLUSIVE — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


func _dump(tag: String, r: Dictionary) -> void:
	print("   . %s poll:  a=%s b=%s  delta=%s  settle=%s" % [
		tag, str(r["poll_a"]), str(r["poll_b"]), str(r["poll_delta"]), str(r["poll_settle"])])
	print("   . %s event: a=%s b=%s  delta=%s" % [
		tag, str(r["evt_a"]), str(r["evt_b"]), str(r["evt_delta"])])


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])
