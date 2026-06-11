# Mouse Injection Spike: In-Process Sequencing, Lifecycle Safety, Confirm-by-Delta

Status: design spike (investigation + proven probes + one shipped bug fix). The
injection *primitive* is settled; this doc covers the layers ON TOP that a real
`godot_input` mouse tool needs, what is now proven, and what remains. Companion
to the regimes work in `godot/addons/godot_mcp/test/README.md` (the mouse suite).

> **Archival note.** This spike fed the decision recorded in
> [`mouse-input-spike.md`](mouse-input-spike.md): **godot-mcp will not add
> comprehensive mouse input.** This document is preserved as the build-oriented
> evidence behind that call. It references the spike's full set of 13 probe
> scripts by their findings, but only a **keystone subset** is retained in-repo
> under `godot/addons/godot_mcp/test/` — the polled-position keystone
> (`mouse_polled_position_test.gd`), its focus-independence
> (`mouse_unfocused_poll_test.gd`), transform completeness
> (`mouse_transform_completeness_test.gd`), and the queue engine
> (`mouse_queue_engine_test.gd`). The other probes named below are recorded here
> as findings, not kept as files. The reference engine `mcp_input_queue.gd` was
> moved into `test/` (dev-only, stripped from the shipped addon) since it was
> never wired into the bridge.

## Problem statement

"Comprehensive mouse support" is not the injection call — it is a small stack on
top of it:

```
tool surface  /  gesture vocab  /  targeting  /  SEQUENCING ENGINE  /
LIFECYCLE SAFETY  /  observability  /  [injection primitive ✓]
```

The injection primitive and its input regimes are proven (pointer, look,
SubViewport, content-scale/DPI, screen_relative, the polled-position keystone —
six committed probes, see the test README). Those probes all ran as
`extends SceneTree --script`, where the probe script **is** the main loop and can
`await SceneTree.process_frame`. A real bridge is the opposite: a **Node inside a
running game** that cannot await frames. Two whole layers never appeared in the
probe harness and are the ones most likely to sink the feature:

1. **The per-frame sequencing engine** — how a node drains queued input without
   awaiting frames.
2. **Lifecycle safety** — guaranteeing a press is never left latched.

Plus a correctness rule that spans both: **confirm by state delta**, never by
"the event was sent."

This spike built and proved all three (Tier 1 of the risk register), wrote a
committed reference engine, and fixed a real stuck-held bug already shipped in
the action-sequence path.

## What is already true (verified against code)

- Editor ↔ game runs over `EngineDebugger`. The game side registers a capture
  (`MCPGameBridge._ready` → `EngineDebugger.register_message_capture("godot_mcp", _on_debugger_message)`)
  and replies with `EngineDebugger.send_message("godot_mcp:<name>", [...])`.
- **The bridge is already a per-frame queue drainer.** `MCPGameBridge` has a
  `_process` loop that drains a timestamped event queue for `execute_input_sequence`
  (`_handle_execute_input_sequence` builds `_sequence_events`; `_process` pops the
  due ones each frame). So the "in-process engine" is not hypothetical — it
  exists, and studying it surfaced the exact Tier-1 failure modes below.
- The existing engine uses `InputEventAction` only (no mouse buttons/motion at
  coordinates), drains **all** due events in one frame, has **no**
  `process_mode = ALWAYS`, and (until this spike) dropped unfired releases when a
  new sequence cleared the queue.

## Foundational harness fact (proven)

A child `Node` added to `root` in an `extends SceneTree --script` harness receives
real per-frame `_process()` callbacks even though the script is itself the main
loop, and `process_mode = ALWAYS` keeps it ticking while `SceneTree.paused` is
true (a default-mode node stalls). This is what makes the queue engine testable
off the live game loop. Verified before building anything else; it underpins
`mouse_queue_engine_test.gd` and `mouse_lifecycle_safety_test.gd`.

---

## Tier 1, resolved

### 1. The per-frame sequencing engine

A bridge node must drain a queue **one event per frame** from `_process`. Draining
all due events in a frame collapses press+release onto one frame; blocking the
loop with a synchronous wait is the other failure mode. The engine must also keep
running while the game is paused so a pending **release** never gets stuck behind
a pause.

Proven by `mouse_queue_engine_test.gd` against the reference module
`test/mcp_input_queue.gd`:

- Q1 — never drains more than one step per frame; fully drains (`pending_count`
  sequence `4→3→2→1→0`).
- Q2 — a decomposed click puts move/press/release on different, ordered frames.
- Q3 — `process_mode = ALWAYS` keeps draining while `paused = true`.
- Q4/Q5 — the empirical surprise: a plain `Button` fires `pressed` once for BOTH
  same-frame and frame-stepped press+release (so a discrete click is *not* why
  one-per-frame matters). The real reason is **duration**: a hold/duration
  consumer that polls `Input.is_mouse_button_pressed` (hold-to-paint) observes the
  button as held for ≥1 frame only when press and release are on different frames;
  a same-frame pair is a zero-duration hold it never sees (`frame-stepped=3
  down-frames` vs `same-frame=0`). Frame separation is therefore mandatory for
  hold-to-paint, drags, and hover-before-press.

### 2. Lifecycle safety

A press injected without its paired release **latches**:
`Input.is_mouse_button_pressed()` / `is_action_pressed()` stay true and a
hold-to-paint game paints with no end. The remedy is a held-state registry plus a
release that is a `finally`, not a step.

Proven by `mouse_lifecycle_safety_test.gd` against the reference module:

- The registry tracks press↔release exactly; a press with no release latches (the
  bug reproduced).
- `release_all()` synthesizes the paired release for everything held AND drops the
  pending queue (the panic button) — three latched inputs (LEFT, RIGHT, an action)
  all cleared.
- A watchdog force-releases any input held longer than `hold_timeout_ms`.
- `on_disconnect()` (MCP/debugger session end) and `_exit_tree` (game shutdown /
  scene change) both flush paired releases.

### 3. Silent no-op reported as success

An injected click that lands on empty space, off-screen, or on an occluder changes
nothing, yet "the event was sent" reads as success. Confirm by an observable
**state delta**: sample state before and after, and only call it success if
something changed; an empty delta is "no observable effect."

Proven by `mouse_confirm_delta_test.gd`:

- D1/D2 (headless-safe, event-path world target): a hit produces a delta
  (success); a miss produces none (no observable effect).
- C1–C3 (windowed, GUI occlusion): hitting a `Button` yields a delta with a
  positive `gui_get_hovered_control` preflight; empty space hovers null with no
  delta; an opaque overlay (`mouse_filter = STOP`) over the button is caught by
  the preflight (`gui_get_hovered_control` returns the overlay) and the occluded
  click produces no button delta.

---

## Shipped bug fixed in this spike

`MCPGameBridge._handle_execute_input_sequence` began every call with
`_sequence_events.clear()`. If a prior sequence was still mid-flight (the editor
side hit its 30s `INPUT_TIMEOUT` and the agent retried, or two calls overlapped),
any already-fired press whose paired release was still queued had that release
**dropped** by the clear — latching the action "pressed" in the Input singleton
with nothing left to release it. The same latent defect gets worse once mouse
buttons ride this engine (a latched mouse button paints forever).

Fix (small, self-contained): track actions whose press has fired in
`_held_actions`, and release them — flushed immediately — before clearing the
queue and on `_exit_tree`. A release is now a guaranteed cleanup, never a queued
step a clear can drop. Guarded by `input_sequence_stuck_held_test.gd`, which
drives the real bridge node: it fails on the pre-fix code (action stays latched
after an overlapping start, and after the node leaves the tree) and passes after.

---

## The reference module

`godot/addons/godot_mcp/test/mcp_input_queue.gd` (`class_name MCPInputQueue`) — a
standalone `Node`, never wired into the command router and preserved as an
archived prototype (the mouse feature was decided no-go). It implements the three
Tier-1 layers in one place:

- One-step-per-frame drain from `_process`, `process_mode = ALWAYS`.
- Gesture decomposition: `enqueue_move/button/click/drag/action`, each step its
  own frame; clicks optionally lead with a hover move so a Control registers
  `mouse_entered` before the press.
- Held-state registry; `release_all(reason)`; per-input watchdog
  (`hold_timeout_ms`); `on_disconnect()`; `_exit_tree` release.
- Signals for observability: `queue_drained`, `released_all_done`,
  `watchdog_released`, `step_injected`.
- Bakes in the proven regime rules: both `position` and `global_position` on every
  event; both `relative` and `screen_relative` on motion; never `warp_mouse`.

When wired in, the bridge would `add_child` one queue, route `godot_input` mouse
commands to its enqueue API, sample state on `queue_drained` for confirm-by-delta,
and call `on_disconnect()`/`release_all()` from the debugger session-stopped path
(mirror `MCPDebuggerPlugin`'s existing cleanup).

---

## Tier 2 — correctness boundary (in progress)

### Resolved: the polled-cursor ceiling is permanent, not a focus artifact

The proven keystone is that on a focused real window injection cannot drive
`Viewport.get_mouse_position()` (it reflects the physical OS cursor). The open
hope was that this only held *while the game had focus* — that in the real MCP
topology (editor focused, game backgrounded) an unfocused game would stop
receiving physical-cursor updates and let injected motion drive the poll. That
would have shrunk the ceiling to a hover-only edge case.

`mouse_unfocused_poll_test.gd` settles it: **no.** Dropping the main window's
focus with a second native window (which flips `window_is_focused(MAIN)` to
`false` while the main loop keeps ticking), the poll *still* does not follow
injection — even though an `_input` spy confirms the injected event reached
root's viewport (ruling out a same-process routing-steal). Deterministic across
runs; the poll stays pinned to the physical cursor in both focus states. The only
thing that moves it is `warp_mouse` (banned). So the boundary is firm and
taxonomic:

- **VISIBLE mode, event path** (`event.position`) → drivable: clicks, world
  placement, GUI buttons.
- **VISIBLE mode, polled absolute position** (`get_mouse_position()` in
  `_process`) → NOT drivable: cursor-follow ghosts, hover previews, poll-based
  hold-to-paint. `PlacementController.gd:77` is exactly this case — so in our own
  dogfood game, click-to-place works but the ghost won't follow and drag-paint
  picks the physical cursor's cell, not ours.
- **CAPTURED mode, relative** (`.relative`) → drivable (FPS look,
  `mouse_look_test`); polled absolute position is moot there.

Product consequence: `godot_input` must drive only the event-path/relative
regimes, confirm by game-state delta (never the cursor), and document the limit.
A poll-based interaction is reachable only if the game cooperates by reading an
injectable virtual position — not a general solution, and out of scope for an
unmodified-game tool.

### Resolved: transform completeness — one rule covers every stretch config

`mouse_transform_completeness_test.gd` proves the recipe generalises beyond the
`aspect=IGNORE` pure-scale case `mouse_dpi_scale_test` covered. The round-trip
invariant — to hit canvas pixel `C`, inject `get_final_transform() * C` and the
event lands on `C` — holds (two points per config, deterministic) under: identity,
`CANVAS_ITEMS` 2×, `aspect=KEEP` (where `get_final_transform()` carries the
**letterbox translation offset** — origin `(0,40)` — so the recipe absorbs it for
free), `content_scale_factor=1.5` (composes into the transform), and
`mode=VIEWPORT`. So the bridge needs no per-config branching, only
`get_final_transform()`. Injected `position` is WINDOW-CLIENT space, so OS display
scaling (window px → physical px) never enters the position calculation; physical
DPI bites only if a target is read off a raw screenshot (a targeting-input
concern). The cold-start settle wrinkle `mouse_dpi_scale_test` showed is handled
by polling `get_final_transform()` until it stabilises before resolving a target —
the same wait-for-stable pattern the moving-target work needs.

`mouse_multiwindow_routing_test.gd` settles routing: `Input.parse_input_event()`
drives the MAIN window viewport regardless of OS focus; a secondary `Window` is
reachable only via *its own* `push_input` (which leaves the global Input
button/action singletons stale, per `mouse_subviewport_test`). The tool targets
the main window by default; a secondary window is a distinct, lower-fidelity path.

### Resolved: moving/unstable targets — resolve at fire time, wait-for-stable with a timeout

`mouse_moving_target_test.gd` reproduces CityCamera's rig and lerp speeds
(`PAN_LERP_SPEED=12`, zoom 8, orbit 10) and uses ray/plane ground-picking as
ground truth (no physics, runs headless). The decision-relevant numbers:

- A world target's pre-resolved pixel goes stale fast. A 10-unit pan with the click
  firing 4 frames later lands the resolve-once click **~6 cells** (5.90 world
  units) off — not a sub-pixel nicety, a wrong-cell bug. Recomputing
  `unproject_position` at fire time is exact (0.000 off) at every frame of a
  combined pan+zoom+orbit.
- `wait-for-stable` (poll the target's projected position until it stops moving by
  < eps for N consecutive frames) settles promptly when motion stops (~0.3s) AND
  must carry a timeout: a continuously orbiting camera never settles, so the poll
  must return "unstable" at a bounded frame count and the tool falls back to
  resolve-at-fire-time rather than hanging.

So targeting rules for the bridge: resolve `unproject_position` in the frame the
press fires (never at enqueue); optionally `wait-for-stable` first, always with a
timeout + unstable fallback. The transform-settle poll from the transform probe is
the same mechanism.

### Still open

The polled-position keystone must be baked into targeting (decompose drags into
event-path clicks; never confirm by cursor pos) — now reinforced by the
focus-independence finding above. This is an implementation discipline for the v1
feature, not an open research question. **Tier 2 research is complete.**

**Tier 3 — breadth.** Modifiers + `button_mask` on drag-motion events; full button
set (right/middle/extra/wheel/double-click); cross-platform (all proofs are
Windows — macOS + Wayland unverified; in-process injection should be the most
portable path but is unproven off Windows).

**Tier 4 — shipping.** Godot-in-CI for the headless-capable subset; flattened
(discriminated-union) MCP `inputSchema`; end-to-end dogfood on the real game;
server+addon stay version-coupled (release-please) so the TS tool never ships
ahead of the GDScript bridge.

## Sequencing

1. (done) Tier-1 prerequisites: per-frame queue + lifecycle safety + confirm-by-
   delta, proven with probes; reference module + shipped-bug fix committed.
2. v1 feature: wire `MCPInputQueue` into the bridge, add the `godot_input` mouse
   command + thin TS tool, targeting (reuse `onscreen.gd`), confirm-by-delta, a
   frozen gesture set with click-decomposition baked in.
3. v2: observe/clickable query, wait-for-stable, remaining transforms,
   modifiers/wheel/double-click.
4. v3: cross-platform proofs, CI, determinism (time_scale pin, record/replay).

## Proposed follow-up issues

- feat: wire MCPInputQueue into MCPGameBridge + `godot_input` mouse command (v1).
- feat: confirm-by-delta on the bridge — sample runtime_state around a gesture,
  report "no observable effect" on empty delta.
- feat: pointer targeting via onscreen.gd — world/screen target → event-path
  clicks, never polled cursor position.
- test: Tier-2 transform matrix (content_scale_factor, aspect=keep letterbox,
  stretch=viewport, multi-window).
- test: cross-platform injection (macOS, Wayland) for the in-process path.
- ci: Godot-in-CI job running the headless-capable mouse + Tier-1 subset.
