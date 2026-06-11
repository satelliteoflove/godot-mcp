extends Node
class_name MCPInputQueue

## In-process input sequencing + lifecycle-safety engine for injected mouse/action
## input (godot-mcp #228, Tier-1 spike). ARCHIVED PROTOTYPE — the reference engine
## from the mouse-injection spike, exercised by mouse_queue_engine_test.gd in this
## same directory. It was never wired into MCPGameBridge: the spike concluded
## against shipping comprehensive mouse input (see
## docs/design/mouse-input-spike.md), so this is preserved as evidence of the
## explored design, not live code. Lives under test/ (stripped from the shipped
## addon) rather than game_bridge/ for that reason.
##
## WHY THIS EXISTS — the two Tier-1 risks the injection probes never touched:
##
##   1. Per-frame sequencing. The injection probes drove input with
##      `await SceneTree.process_frame` because the probe script WAS the main
##      loop. A real bridge is a NODE inside the running game; it cannot await
##      frames. It must drain a queue ONE event per frame from `_process`.
##      Draining all due events in a single frame collapses press+release onto
##      one frame, which corrupts Control hover/press state and any game that
##      reads a press and its release across frames. So: exactly one step per
##      frame (`_process` pops one). `process_mode = ALWAYS` so injection — and,
##      crucially, RELEASES — still flow while the game tree is paused.
##
##   2. Lifecycle safety. A press injected without its paired release latches:
##      `Input.is_mouse_button_pressed()` / `is_action_pressed()` stay true and a
##      hold-to-paint game paints forever. So every press is tracked in a held
##      registry, and a release is a `finally`, not a step: `release_all()`
##      synthesizes the paired release for everything still held and is invoked on
##      completion, abort, watchdog timeout, MCP/debugger disconnect, and tree
##      exit.
##
## Pointer note (the polled-position keystone, proven separately in
## mouse_polled_position_test.gd): on a real window `Viewport.get_mouse_position()`
## reflects the PHYSICAL cursor, not injected events. Pointer gestures must be
## decomposed into discrete event-path clicks (this engine's one-step-per-frame
## button/motion events) and confirmed by game-state delta, never by cursor pos.

const DEFAULT_HOLD_TIMEOUT_MS := 10000

## Force-release any single held input still down after this many ms. The
## last-ditch backstop for a gesture that errored or was abandoned mid-flight
## without anyone calling release_all(). <= 0 disables the watchdog.
var hold_timeout_ms := DEFAULT_HOLD_TIMEOUT_MS

# FIFO of pending steps. Each step is { "event": InputEvent }.
var _queue: Array[Dictionary] = []
# Held registry: key -> record used to synthesize the paired release.
#   "mb:<button_index>" -> { kind, button_index, pos, pressed_msec }
#   "act:<action>"      -> { kind, action, pressed_msec }
var _held: Dictionary = {}

## Emitted when the queue empties after having had at least one step (the natural
## end of a gesture — the point at which confirm-by-delta should sample state).
signal queue_drained
## Emitted by release_all(): how many held inputs were force-released, and why.
signal released_all_done(count: int, reason: String)
## Emitted when the watchdog force-releases a single timed-out held input.
signal watchdog_released(key: String)
## Emitted on every injected step (introspection for tests/observability).
signal step_injected(kind: String, key: String)


func _init() -> void:
	# ALWAYS: keep draining (and releasing) even while get_tree().paused is true.
	process_mode = Node.PROCESS_MODE_ALWAYS


func _exit_tree() -> void:
	# The "finally": never leave the game with a latched button when the bridge
	# node leaves the tree (game shutdown / scene change that frees us).
	release_all("exit_tree")


# --- per-frame drain: exactly ONE step per frame ----------------------------

func _process(_delta: float) -> void:
	_tick_watchdog()
	if _queue.is_empty():
		return
	var step: Dictionary = _queue.pop_front()
	_inject(step["event"])
	if _queue.is_empty():
		queue_drained.emit()


# --- enqueue API (gestures decompose into one-event-per-frame steps) ---------

func enqueue_event(ev: InputEvent) -> void:
	_queue.push_back({"event": ev})


func enqueue_move(pos: Vector2, relative := Vector2.ZERO) -> void:
	var mm := InputEventMouseMotion.new()
	mm.position = pos
	mm.global_position = pos
	# Set both relative and screen_relative (window-space delta) — screen_relative
	# is never backfilled from relative (proven in mouse_dpi_scale_test.gd).
	mm.relative = relative
	mm.screen_relative = relative
	mm.button_mask = _current_button_mask()
	_queue.push_back({"event": mm})


func enqueue_button(pos: Vector2, button_index: int, pressed: bool) -> void:
	var mb := InputEventMouseButton.new()
	mb.button_index = button_index
	mb.pressed = pressed
	mb.position = pos
	mb.global_position = pos
	# button_mask reflects buttons down AFTER this event resolves.
	var mask := _current_button_mask()
	var bit := _mask_bit(button_index)
	mb.button_mask = (mask | bit) if pressed else (mask & ~bit)
	_queue.push_back({"event": mb})


## A click decomposed into press + release on SEPARATE frames (one-per-frame
## drain guarantees the gap). Optionally precede with a hover-move so a Control
## registers mouse_entered before the press.
func enqueue_click(pos: Vector2, button_index := MOUSE_BUTTON_LEFT, with_hover := true) -> void:
	if with_hover:
		enqueue_move(pos)
	enqueue_button(pos, button_index, true)
	enqueue_button(pos, button_index, false)


## A drag: press at the first point, a move per subsequent point, release at the
## last. Each is its own frame. `path` must have >= 2 points.
func enqueue_drag(path: Array, button_index := MOUSE_BUTTON_LEFT) -> void:
	if path.size() < 2:
		return
	enqueue_move(path[0])
	enqueue_button(path[0], button_index, true)
	var prev: Vector2 = path[0]
	for i in range(1, path.size()):
		var p: Vector2 = path[i]
		enqueue_move(p, p - prev)
		prev = p
	enqueue_button(path[path.size() - 1], button_index, false)


func enqueue_action(action: StringName, pressed: bool) -> void:
	var a := InputEventAction.new()
	a.action = action
	a.pressed = pressed
	a.strength = 1.0 if pressed else 0.0
	_queue.push_back({"event": a})


# --- lifecycle safety -------------------------------------------------------

## Synthesize and inject a release for every input still held, and drop any
## pending queue. Returns how many inputs were released. Idempotent (0 if none
## held). This is the panic button and the completion `finally`.
func release_all(reason := "manual") -> int:
	_queue.clear()
	var released := 0
	for key in _held.keys():
		var rel := _make_release(_held[key])
		if rel != null:
			Input.parse_input_event(rel)
			released += 1
	if released > 0:
		Input.flush_buffered_events()
	_held.clear()
	if released > 0:
		released_all_done.emit(released, reason)
	return released


## Call when the MCP/debugger session ends. Lifecycle `finally` for disconnect.
func on_disconnect() -> void:
	release_all("disconnect")


func held_count() -> int:
	return _held.size()


func held_keys() -> Array:
	return _held.keys()


func pending_count() -> int:
	return _queue.size()


func is_idle() -> bool:
	return _queue.is_empty() and _held.is_empty()


# --- internals --------------------------------------------------------------

func _inject(ev: InputEvent) -> void:
	Input.parse_input_event(ev)
	Input.flush_buffered_events()
	if ev is InputEventMouseButton:
		var mb := ev as InputEventMouseButton
		var key := "mb:%d" % mb.button_index
		if mb.pressed:
			_held[key] = {
				"kind": "mouse_button",
				"button_index": mb.button_index,
				"pos": mb.position,
				"pressed_msec": Time.get_ticks_msec(),
			}
		else:
			_held.erase(key)
		step_injected.emit("mouse_button", key)
	elif ev is InputEventAction:
		var a := ev as InputEventAction
		var key := "act:%s" % a.action
		if a.pressed:
			_held[key] = {
				"kind": "action",
				"action": a.action,
				"pressed_msec": Time.get_ticks_msec(),
			}
		else:
			_held.erase(key)
		step_injected.emit("action", key)
	else:
		step_injected.emit("other", "")


func _tick_watchdog() -> void:
	if hold_timeout_ms <= 0 or _held.is_empty():
		return
	var now := Time.get_ticks_msec()
	var expired: Array = []
	for key in _held.keys():
		if now - int(_held[key]["pressed_msec"]) >= hold_timeout_ms:
			expired.append(key)
	for key in expired:
		var rel := _make_release(_held[key])
		if rel != null:
			Input.parse_input_event(rel)
			Input.flush_buffered_events()
		_held.erase(key)
		watchdog_released.emit(key)


func _make_release(h: Dictionary) -> InputEvent:
	match h["kind"]:
		"mouse_button":
			var mb := InputEventMouseButton.new()
			mb.button_index = h["button_index"]
			mb.pressed = false
			mb.button_mask = 0
			mb.position = h.get("pos", Vector2.ZERO)
			mb.global_position = mb.position
			return mb
		"action":
			var a := InputEventAction.new()
			a.action = h["action"]
			a.pressed = false
			a.strength = 0.0
			return a
	return null


func _current_button_mask() -> int:
	var mask := 0
	for key in _held:
		if _held[key]["kind"] == "mouse_button":
			mask |= _mask_bit(_held[key]["button_index"])
	return mask


func _mask_bit(button_index: int) -> int:
	match button_index:
		MOUSE_BUTTON_LEFT:
			return MOUSE_BUTTON_MASK_LEFT
		MOUSE_BUTTON_RIGHT:
			return MOUSE_BUTTON_MASK_RIGHT
		MOUSE_BUTTON_MIDDLE:
			return MOUSE_BUTTON_MASK_MIDDLE
	return 0
