# Mouse Input Support — Research Spike & Decision

**Status: DECIDED — godot-mcp will _not_ add comprehensive mouse/coordinate input.**
**Date: 2026-06-01.  Supersedes the goal of issue #228.**

> **Decision in one line:** in-process injection cannot drive the *polled* mouse
> cursor on a real window without `warp_mouse` (which hijacks the developer's
> physical pointer and is off-limits), so any "mouse support" would be **partial
> and fail silently** across whole ranges of games — below the reliability bar the
> rest of the godot-mcp tools hold to. We are keeping the keyboard/action input
> path (which has none of these problems) and shipping a real bug fix the
> investigation uncovered.

This document records the research, the findings, and the rationale so the
question is settled and need not be re-litigated. The build-oriented design doc
and a keystone subset of the probe scripts are kept in-repo (see
[Evidence trail](#evidence-trail)).

---

## Context — why we investigated

Issue #228 asked `godot_input` to add mouse move/click/drag so an agent could
drive **pointer-based games** (city-builders, RTS, tile placement, point-and-click)
and close the loop: *read with `runtime_state`, act with input, verify with
`runtime_state`*. The motivating example was a city-builder whose zone placement is
mouse-driven, so named-action input alone can't supply the click coordinate.

The issue itself flagged the crux as an open question: it speculated that
`Input.warp_mouse()` "may be needed to keep `get_global_mouse_position()`
consistent for raycasts." That speculation turned out to be the whole story.

## What we proved

We built a suite of `SceneTree` probes that drive a running game through
`Input.parse_input_event()` and measured exactly what does and does not respond,
across input regimes, content-scale transforms, window focus, and a moving camera.
Everything below is empirically demonstrated, on **Godot 4.6.3, Windows**.

### The deciding mechanism: three input styles, only two are drivable

| How a game reads the mouse | Drivable by injection? | Why |
|---|---|---|
| **Event path** — `event.position` in `_input`/`_unhandled_input`, Control `_gui_input`/`mouse_entered` | ✅ **Yes** | `parse_input_event` (with both `position` and `global_position` set, then `flush_buffered_events`) delivers faithful `event.position` and updates the Input button/action singletons on every platform; GUI hover (`gui_get_hovered_control`) updates too. |
| **Camera-relative** — centre-screen raycast (FPS place/break), `.relative` mouselook, keyboard/actions | ✅ **Yes** | Uses no cursor position at all; injected `.relative` drives look integrators. |
| **Polled absolute** — `get_viewport().get_mouse_position()` / `get_global_mouse_position()` polled in `_process`/`_physics_process` | ❌ **No** | On a real window this reflects the **physical OS cursor**. Injected motion does **not** move it. |

**The polled-position ceiling is the entire limitation, and it is hard:**

- It is **focus-independent.** We confirmed that even with the game window
  *unfocused* (the real MCP topology — the editor holds focus, the game runs in the
  background), an injected motion event that provably reaches the game's own root
  viewport still does **not** move `get_mouse_position()`. The poll stays pinned to
  the physical cursor in every focus state.
- The only thing that moves the polled cursor is **`warp_mouse`**, which yanks the
  developer's *real* physical pointer to wherever the tool aims — hostile in a
  shared editor session, and explicitly off-limits.
- It is **idiomatic and common.** Polling `get_global_mouse_position()` is the
  convenient, standard way to do cursor-follow in Godot. The same conceptual
  interaction ("drag to paint") is drivable if the game happens to read events and
  undrivable if it polls — an implementation detail invisible from outside.

### Secondary findings (all consistent with the decision)

- **Targeting transform is solved.** To hit a canvas pixel `C`, inject
  `get_final_transform() * C`. This round-trips under every stretch config — scale,
  `content_scale_factor`, `mode=VIEWPORT`, and `aspect=KEEP` (where the transform's
  origin carries the letterbox offset). Injected `position` is window-client space,
  so OS display scaling never enters the calculation. *(So targeting was never the
  blocker; the polled cursor is.)*
- **Routing is main-window only.** `Input.parse_input_event()` always drives the
  main window viewport regardless of OS focus; a secondary `Window` is reachable
  only via its own `push_input` (which leaves the global Input singletons stale).
- **Moving targets need care.** With a lerping camera, a pixel resolved when a
  gesture is queued is stale by the time the click fires a few frames later — on the
  real city-builder camera, ~6 cells off. Mitigable (resolve `unproject_position`
  at fire time; optional wait-for-stable with a timeout so a perpetually orbiting
  camera doesn't hang) but it adds complexity.
- **Sequencing/lifecycle have real hazards.** A press without its paired release
  *latches* the Input singleton; a robust engine must drain one step per frame with
  a held-state registry and guarantee releases on completion/abort/disconnect/exit.
  *(This is where the shipped bug below was found.)*
- **All proofs are Windows.** macOS and Wayland (stricter input security) are
  unverified.

## What *does* work (so the scope is clear)

Injection is genuinely capable for a real slice of interactions:

| Interaction | Support |
|---|---|
| Click a GUI button / menu / toolbar (Control) | ✅ |
| Click a discrete world cell / tile / hotspot (`event.position`) | ✅ |
| Hover highlight via `mouse_entered` / `_gui_input` | ✅ |
| FPS / orbit look (`.relative`, captured mode) | ✅ |
| Hold-to-paint / hold-duration where button state is read | ✅ |
| Keyboard / named-action input | ✅ (already shipped) |
| Cursor-following ghost / preview | ❌ polled |
| Drag-select box, freehand paint, polled-path drags | ❌ polled |
| Cursor-aimed abilities (skillshot follows cursor) | ❌ polled |

## Genre support matrix

Extrapolated from the proven primitive layer (not per-genre tested). Verdict:
🟢 signature interactions work · 🟡 core works but a signature interaction is
typically polled · 🔴 the defining interaction is polled/continuous.

| Genre | Verdict | Breaks because… |
|---|---|---|
| FPS / first-person shooter | 🟢 | (look = relative, shoot = button, move = keys) |
| First-person sandbox / voxel | 🟢 | place/break via centre raycast |
| Point-and-click / VN / narrative | 🟢 | discrete hotspot + UI clicks |
| Turn-based strategy / 4X / tactics | 🟢🟡 | path/range **hover preview** usually polled (cosmetic) |
| Puzzle / match-3 / board | 🟢🟡 | swap-**drag** if polled |
| Tower defense | 🟡 | placement **ghost** + range preview polled |
| Card / deckbuilder | 🟡 | card **visually following the cursor** is polled |
| City builder / management sim | 🟡 | **drag-paint zones/roads + cursor ghost** polled |
| MOBA / top-down ARPG | 🟡🔴 | **ability aiming** follows polled cursor |
| RTS | 🟡🔴 | **box-select drag** — the signature verb — is polled |
| Drawing / painting / sculpt / level-edit | 🔴 | **freehand** = continuous polled sampling |
| Platformer / fighting / racing / sports | 🟢 (n/a) | gameplay is keyboard/gamepad |

Every 🟢 also assumes a real window, Windows, and that the game exposes enough
state to confirm an effect by state-delta.

## The decision and its rationale

**We will not add comprehensive mouse/coordinate input.** The reasons:

1. **The failure is silent.** Clicking a button works, so a user reasonably expects
   dragging to paint a row of zones to work — and instead it no-ops with no error.
   A tool that silently does nothing is worse than an absent tool: it erodes trust
   in the whole suite.
2. **It can't be made honest.** Because drivability depends on whether each game
   reads events or polls the cursor, we could never publish a truthful "supported
   games" list. "Mouse support" as a headline oversells what is really
   "event-path-and-relative input support."
3. **The hole is unfixable within our constraints.** Closing it requires
   `warp_mouse`, which is hostile to a developer sharing the editor session. There
   is no non-hostile mechanism to drive the polled cursor for an unmodified game.
4. **The blast radius is wide.** The polled interactions are the *signature verbs*
   of city-builders, RTS, MOBA, and art tools — not edge cases.

## What this decision does **not** affect

- **Keyboard / named-action input stays.** `godot_input`'s `sequence` and
  `type_text` are complete, genre-agnostic, and have none of the polled-cursor
  problem (actions are state, not coordinates). For "drive my game to test it,"
  this already covers a large fraction of the need — and is the right place to
  invest the energy this decision frees up.
- **Controller/analog injection shipped after this decision (#233).** Joypad
  buttons, analog axes, and stick vectors inject through the same `sequence`
  timing model — and unlike the mouse cursor, injected joypad events DO drive
  the polled Input singletons (`get_joy_axis` / `is_joy_button_pressed`), so
  the gamepad-native genres in the matrix below (platformer, fighting, racing,
  sports, twin-stick) are fully drivable, analog included. One bounded
  exception, same in spirit to the polled-cursor ceiling but far narrower:
  `Input.joy_connection_changed` is not script-bindable, so
  `get_connected_joypads()` never reports a virtual pad — a game that gates
  controller mode on pad *detection* cannot be switched into it (games keying
  off received joypad events or InputMap actions, the common patterns, work).
- **Raw keyboard / modifier injection shipped after this decision (#290).** A
  `key` entry (e.g. `{key: "ctrl+s"}`) injects raw `InputEventKey` through the
  same `sequence` timing model, driving `_input`/`_unhandled_input`, InputMap key
  bindings (modifier combos included), and the polled `Input.is_key_pressed` /
  `is_physical_key_pressed` singletons — so a game reading keys directly, without
  defining actions, is now drivable. With this and the controller pillar (#233),
  the keyboard/gamepad input surface is complete.
- **Relative mouse-look injection shipped after this decision (#294).** A `look`
  entry (`{look: [dx, dy]}`) injects `InputEventMouseMotion.relative` through the
  same `sequence`/`step` timing model, delivered faithfully to
  `_input`/`_unhandled_input` for FPS-camera code that integrates `event.relative`
  (a snap-turn at `duration_ms: 0`, or a smooth multi-event sweep that distributes
  the delta over a longer window). This is exactly the **Camera-relative** input
  style the matrix above rated drivable (look = relative) and the "FPS / orbit look
  (`.relative`, captured mode)" line under *What does work* — now reachable through
  the tool. It does NOT reopen the coordinate-cursor decision: this is RELATIVE
  motion, never a cursor position, and the game owns `Input.mouse_mode`.
  **Absolute/polled cursor positioning remains the only input gap this document
  records as out of scope** (the polled-position ceiling above is unchanged).
- **A real bug fix ships.** The investigation found that
  `MCPGameBridge.execute_input_sequence` dropped unfired action *releases* when it
  cleared its queue mid-flight, latching the action "pressed" forever. Fixed and
  guarded by a regression test — see PR #231. This benefits current keyboard/action
  users regardless of the mouse decision.

## What would reopen this

This is a "no" given today's constraints, not a permanent law. It would be worth
revisiting if **any** of these appears:

- A non-hostile way to drive the polled cursor (e.g. a per-window virtual cursor
  the OS/engine exposes that does not move the physical pointer).
- A **cooperative** path for first-party games: the game reads an injectable
  virtual cursor the bridge feeds, opting in to full drivability. Clean and fully
  capable, but requires modifying the game — out of scope for an unmodified-game
  tool, viable only where you control the game.
- Upstream Godot changes to how injected events interact with `get_mouse_position`.

## Evidence trail

The build-oriented design doc is at
[`docs/design/mouse-injection-spike.md`](mouse-injection-spike.md). The spike
produced 13 Godot `SceneTree` probe scripts (TAP-style); a **keystone subset is
retained in-repo** under `godot/addons/godot_mcp/test/`, and the rest are recorded
as findings in this doc and the design writeup rather than kept as files.

Retained as runnable probes:

- `mouse_polled_position_test.gd` — the polled-position keystone, the fact the
  decision rests on.
- `mouse_unfocused_poll_test.gd` — that keystone is focus-independent.
- `mouse_transform_completeness_test.gd` — the targeting transform round-trips
  under every stretch config.
- `mouse_queue_engine_test.gd` (with the archived `mcp_input_queue.gd` prototype)
  — the in-process per-frame sequencing/lifecycle engine.
- `input_sequence_stuck_held_test.gd` — guard for the stuck-held bug fix
  (PR [#231](https://github.com/satelliteoflove/godot-mcp/pull/231)), kept
  regardless of the mouse decision.

Recorded as findings only (scripts not retained): `mouse_pointer_recipe_test`,
`mouse_dpi_scale_test`, `mouse_multiwindow_routing_test`, `mouse_gui_dispatch_test`,
`mouse_subviewport_test`, `mouse_look_test`, `mouse_lifecycle_safety_test`,
`mouse_confirm_delta_test`, `mouse_moving_target_test`.
