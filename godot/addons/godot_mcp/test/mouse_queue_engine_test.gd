extends SceneTree

## Per-frame queue-engine guard for injected input (godot-mcp #228, Tier-1).
##
## Validates MCPInputQueue — the in-process sequencing engine a real bridge needs
## because, unlike the injection probes, a bridge NODE cannot `await` frames; it
## must drain a queue ONE event per frame from `_process`. This test adds the
## queue as a child of `root` and lets the SceneTree tick it for real (a child
## Node DOES get per-frame _process even though this script is the main loop —
## that foundational fact is what makes the whole approach work).
##
## Guards:
##   Q1  exactly one step drains per frame (never two collapsed onto one frame)
##   Q2  a click's press and release land on DIFFERENT, ordered frames
##   Q3  process_mode = ALWAYS keeps the queue draining while the tree is paused
##   Q4  (windowed, REPORTED) frame-stepped vs same-frame on a plain Button —
##       it turns out BOTH fire pressed once, so a discrete Button click is NOT
##       why frame separation matters
##   Q5  the real reason: a hold/duration consumer (poll of
##       Input.is_mouse_button_pressed, i.e. hold-to-paint) only ever observes a
##       button as held if press and release are on different frames; a same-frame
##       press+release is a zero-duration hold it never sees
##
## Not wired into CI (CI has no Godot). Run on demand:
##   & "<godot.exe>" [--headless] --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/mouse_queue_engine_test.gd"
## Q1-Q3 pass headless and windowed; Q4 only reports under a real DisplayServer.
## Exit code 0 = all asserted checks passed, 1 = at least one failed.

const InputQueue := preload("res://addons/godot_mcp/test/mcp_input_queue.gd")

var _count := 0
var _failures := 0


class MouseSpy extends Node:
	var press_frame := -1
	var release_frame := -1
	var move_frames: Array = []
	func _unhandled_input(e: InputEvent) -> void:
		if e is InputEventMouseButton:
			if (e as InputEventMouseButton).pressed:
				press_frame = Engine.get_process_frames()
			else:
				release_frame = Engine.get_process_frames()
		elif e is InputEventMouseMotion:
			move_frames.append(Engine.get_process_frames())


class HoldPoller extends Node:
	# Mimics a hold-to-paint loop: counts frames the LEFT button is polled as down.
	var down_frames := 0
	func _process(_d: float) -> void:
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			down_frames += 1


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== MOUSE QUEUE-ENGINE TEST =====================\n")
	print("DisplayServer name: %s" % DisplayServer.get_name())

	var q = InputQueue.new()
	q.hold_timeout_ms = 0  # disable watchdog for these timing tests
	root.add_child(q)
	var spy := MouseSpy.new()
	root.add_child(spy)
	for i in 3:
		await process_frame

	await _q1_one_per_frame(q)
	await _q2_press_release_separate_frames(q, spy)
	await _q3_drains_while_paused(q)
	await _q4_button_state_machine(q)
	await _q5_hold_requires_frame_separation(q)

	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)


# Q1 — enqueue several events, sample pending_count() once per frame, assert the
# count never drops by more than 1 in a single frame (i.e. one step per frame)
# and reaches zero.
func _q1_one_per_frame(q) -> void:
	for p in [Vector2(10, 10), Vector2(20, 20), Vector2(30, 30), Vector2(40, 40)]:
		q.enqueue_move(p)
	var seq: Array = [q.pending_count()]
	for i in 7:
		await process_frame
		seq.append(q.pending_count())
	_data("pending_count per frame", str(seq))

	var max_drop := 0
	for i in range(1, seq.size()):
		max_drop = max(max_drop, int(seq[i - 1]) - int(seq[i]))
	_check("Q1 never drains more than ONE step per frame", max_drop <= 1, true)
	_check("Q1 queue fully drains to zero", int(seq[seq.size() - 1]) == 0, true)


# Q2 — a decomposed click (hover move, press, release) must put press and release
# on different, ordered frames. This is the property that keeps a press and its
# release from colliding on one frame.
func _q2_press_release_separate_frames(q, spy) -> void:
	spy.press_frame = -1
	spy.release_frame = -1
	spy.move_frames = []
	q.enqueue_click(Vector2(100, 100), MOUSE_BUTTON_LEFT, true)
	# Drain: hover + press + release = 3 steps; give margin.
	for i in 6:
		await process_frame
	_data("move/press/release frames", "moves=%s press=%d release=%d"
		% [str(spy.move_frames), spy.press_frame, spy.release_frame])
	_check("Q2 press was delivered", spy.press_frame >= 0, true)
	_check("Q2 release was delivered", spy.release_frame >= 0, true)
	_check("Q2 press and release on DIFFERENT frames",
		spy.press_frame != spy.release_frame, true)
	_check("Q2 release strictly after press",
		spy.release_frame > spy.press_frame, true)
	_check("Q2 left button not left held after click", q.held_count() == 0, true)


# Q3 — pause the tree; the ALWAYS-mode queue must keep draining (so a pending
# release never gets stuck behind a pause).
func _q3_drains_while_paused(q) -> void:
	paused = true
	for p in [Vector2(5, 5), Vector2(6, 6), Vector2(7, 7)]:
		q.enqueue_move(p)
	for i in 6:
		await process_frame
	var drained_while_paused: bool = q.pending_count() == 0
	paused = false
	_check("Q3 queue drains while tree is PAUSED (process_mode ALWAYS)",
		drained_while_paused, true)


# Q4 — REPORTED only (needs a real DisplayServer for GUI picking). Drives a real
# Button two ways and prints the press-count each yields, so the design doc can
# cite why frame separation matters.
func _q4_button_state_machine(q) -> void:
	if DisplayServer.get_name() == "headless":
		_data("Q4 button state-machine", "skipped (headless stubs GUI picking)")
		return

	var layer := Control.new()
	layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.add_child(layer)
	var btn := Button.new()
	btn.position = Vector2(200, 200)
	btn.size = Vector2(160, 60)
	btn.action_mode = BaseButton.ACTION_MODE_BUTTON_RELEASE
	layer.add_child(btn)
	var presses := [0]
	btn.pressed.connect(func() -> void: presses[0] += 1)
	for i in 3:
		await process_frame
	var center := btn.get_global_rect().get_center()

	# Path A: frame-stepped via the queue (hover, press, release on separate frames)
	presses[0] = 0
	q.enqueue_click(center, MOUSE_BUTTON_LEFT, true)
	for i in 6:
		await process_frame
	var stepped_presses: int = presses[0]

	# Path B: press + release injected in the SAME frame (no queue, no frame gap)
	presses[0] = 0
	var down := InputEventMouseButton.new()
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	down.position = center
	down.global_position = center
	down.button_mask = MOUSE_BUTTON_MASK_LEFT
	var up := InputEventMouseButton.new()
	up.button_index = MOUSE_BUTTON_LEFT
	up.pressed = false
	up.position = center
	up.global_position = center
	Input.parse_input_event(down)
	Input.parse_input_event(up)
	Input.flush_buffered_events()
	for i in 3:
		await process_frame
	var samef_presses: int = presses[0]

	_data("Q4 Button.pressed count", "frame-stepped(queue)=%d  same-frame=%d"
		% [stepped_presses, samef_presses])
	# Frame-stepped is the supported path and MUST work; assert that half only.
	_check("Q4 frame-stepped click fires Button.pressed exactly once",
		stepped_presses == 1, true)
	btn.queue_free()
	layer.queue_free()


# Q5 — the concrete reason frame separation matters: a hold/duration consumer.
# Frame-stepped: the button stays down across frames, so a polling hold-to-paint
# loop observes it held. Same-frame press+release: a zero-duration hold the poller
# NEVER sees. (Button state via Input.is_mouse_button_pressed is drivable on every
# platform — unlike polled cursor POSITION — so this runs headless too.)
func _q5_hold_requires_frame_separation(q) -> void:
	var poller := HoldPoller.new()
	root.add_child(poller)
	await process_frame

	# Frame-stepped hold via the queue: press, two moves while held, release.
	poller.down_frames = 0
	q.enqueue_button(Vector2(120, 120), MOUSE_BUTTON_LEFT, true)
	q.enqueue_move(Vector2(121, 121))
	q.enqueue_move(Vector2(122, 122))
	q.enqueue_button(Vector2(122, 122), MOUSE_BUTTON_LEFT, false)
	for i in 8:
		await process_frame
	var stepped_down: int = poller.down_frames

	# Same-frame press+release: both injected before any _process poll sees it.
	poller.down_frames = 0
	var d := InputEventMouseButton.new()
	d.button_index = MOUSE_BUTTON_LEFT
	d.pressed = true
	d.position = Vector2(120, 120)
	d.global_position = d.position
	d.button_mask = MOUSE_BUTTON_MASK_LEFT
	var u := InputEventMouseButton.new()
	u.button_index = MOUSE_BUTTON_LEFT
	u.pressed = false
	u.position = Vector2(120, 120)
	u.global_position = u.position
	Input.parse_input_event(d)
	Input.parse_input_event(u)
	Input.flush_buffered_events()
	for i in 4:
		await process_frame
	var samef_down: int = poller.down_frames

	_data("hold poller down-frames", "frame-stepped=%d  same-frame=%d"
		% [stepped_down, samef_down])
	_check("Q5 frame-stepped hold is observed down across >=1 frame", stepped_down >= 1, true)
	_check("Q5 same-frame press+release is NEVER observed as held", samef_down == 0, true)
	_check("Q5 nothing left held after both", q.held_count() == 0, true)
	poller.queue_free()


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])


func _data(label: String, value: Variant) -> void:
	print("   . %s = %s" % [label, str(value)])
