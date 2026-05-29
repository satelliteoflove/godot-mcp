# Perception Spike: Structured Live-State over Screenshots

Status: design spike (investigation + proposal). No code in this doc.

## Problem statement

Today an AI agent understands a running Godot game almost entirely through
`editor > screenshot_game` (see `server/src/tools/editor.ts` action
`screenshot_game`, backed by `MCPGameBridge._capture_and_send_screenshot` in
`godot/addons/godot_mcp/game_bridge/mcp_game_bridge.gd`). A screenshot is the
single most expensive thing the agent can pull: it is billed as vision tokens
roughly proportional to image area, and a typical 1920-wide PNG re-encoded to
base64 is hundreds of KB of context plus a large vision-token charge. Worse, a
screenshot answers "what pixels are on screen", not "where is the player, what
is its velocity, what animation is playing, is the enemy in the camera frustum".
The agent then has to infer numeric state from rendered pixels, which is lossy
and unreliable for small or off-screen entities.

The bridge already walks the live `SceneTree` cheaply (`_handle_find_nodes`,
`_handle_get_active_processes`, `_handle_get_signal_connections`,
`_handle_get_performance_metrics`) and already has a per-frame time-series
primitive (`MCPFrameProfiler`) that is summarized server-side in
`server/src/tools/profiler.ts` (`computePercentiles`, `detectSpikes`,
`computeMonitorTrends`). The goal of this spike is to extend that same pattern
to game *state* so that:

1. A structured "state digest" replaces most screenshots, at a fraction of the
   token cost and with exact numbers.
2. "State over time" is summarized server-side into digests (start/end/min/max/
   slope + threshold-crossing events), never per-frame arrays dumped into
   context.
3. When vision genuinely is needed over a time window, K downsampled frames are
   composited into ONE contact-sheet image so the agent pays one vision cost for
   ~1s of motion instead of K separate screenshots.

## Transport and architecture constraints (verified against code)

- Editor <-> game runs over the `EngineDebugger` message channel. The game side
  registers a capture (`EngineDebugger.register_message_capture("godot_mcp", ...)`
  in `mcp_game_bridge.gd:17`) and replies with
  `EngineDebugger.send_message("godot_mcp:<name>", [...])`. The editor side is
  `MCPDebuggerPlugin` (`core/mcp_debugger_plugin.gd`): `_capture()` dispatches
  `godot_mcp:*` results, and `send_game_message(msg_type, args)` /
  `has_response` / `get_response` provide a generic request/response path used by
  `MCPProfilerCommands._send_and_wait` (`commands/profiler_commands.gd:118`).
- The generic `_send_and_wait` path is the one to reuse for new state tools:
  the game replies with `godot_mcp:game_response` carrying `[msg_type, data]`,
  which `_handle_game_response` stores by `msg_type`. No new debugger signal is
  needed; a new message name plus a `_on_debugger_message` match arm is enough
  (`mcp_game_bridge.gd:60`).
- The MCP server <-> addon transport is WebSocket JSON (`connection/websocket.ts`,
  `connection/protocol.ts`). Commands are routed by name through
  `command_router.gd` to a `MCPBaseCommand` handler. Default command timeout is
  30s server-side; the in-editor `_send_and_wait` timeout is 5s
  (`GENERIC_TIMEOUT`). Any sampling window longer than ~4s must NOT block on a
  single `_send_and_wait`; it must use a start/poll/collect shape like the frame
  profiler (`start_profiler` -> let it run -> `get_profiler_data`).
- A tool returns either a `string` or a single `ToolResult` (one text OR one
  image content item). `server/src/index.ts` wraps it as `content: [result]`.
  So a single composited contact-sheet image fits the existing return contract;
  returning N separate images would require changing the return type to an
  array (a bigger change). This is a strong reason to prefer one contact sheet
  over N screenshots.
- Image capture must happen in-engine: `viewport.get_texture().get_image()`
  only works inside the running game process (`_capture_and_send_screenshot`).
  Pixels can only leave the game as an encoded buffer over the debugger channel.

## Context-cost baseline

- Current screenshot: 1920x1080 PNG, base64. Order of 200KB-700KB of text in
  context for one frame, plus vision tokens scaled by area (Claude downsamples
  to a max longest edge ~1568px, then bills ~tokens proportional to pixels).
- A JSON state digest for ~20 watched entities (path, transform, velocity, a few
  script vars, anim state) is on the order of 2KB-6KB of text and ZERO vision
  tokens. That is roughly two orders of magnitude cheaper than a screenshot and
  carries exact numbers.
- Therefore: prefer structured state by default; spend vision only when layout/
  art/visual correctness is the actual question.

---

## Direction 1: Runtime state digest tool

### What it answers
"Where is everything, how fast is it moving, what is it doing." Live entity
transforms/velocities, a few key script vars, animation state, camera, on-screen
/ group membership, in one structured payload.

### Feasibility (against real code)
High. The bridge already traverses `get_tree().current_scene` recursively
(`_find_recursive`, `_collect_processes`, `_collect_signal_connections`). A
digest handler is the same walk with richer per-node extraction. All the data is
reachable from a `Node` reference in-engine:

- transform: `Node2D.global_position`/`rotation`/`scale`, or
  `Node3D.global_transform.origin`/`basis`. Detect by `is class`.
- velocity: `CharacterBody2D/3D.velocity`, `RigidBody2D/3D.linear_velocity`, or
  derived per-frame (only in the time-series variant, Direction 2).
- animation state: `AnimationPlayer.current_animation` + `current_animation_position`;
  `AnimatedSprite2D.animation`/`frame`; `AnimationTree`/`StateMachinePlayback`
  current node via `get_current_node()`.
- camera: reuse the camera extraction already present for the editor
  (`editor.ts get_state` returns `CameraInfo`); in-game use
  `get_viewport().get_camera_2d()` / `get_camera_3d()`.
- on-screen / frustum: 2D via `VisibleOnScreenNotifier2D` if present, else test
  `global_position` against the camera's visible world rect
  (`get_canvas_transform`); 3D via `Camera3D.is_position_in_frustum()`.
- group membership: `node.get_groups()` (filtered to non-internal).

### Scoping the walk (avoid dumping the whole tree)
Three opt-in tiers, cheapest selection wins:

1. Explicit group: nodes in group `mcp_watch` (or a caller-supplied group name).
   This is the recommended default for a project that wants good agent support;
   the dev tags the handful of entities that matter.
2. Optional `_mcp_state()` method: if a node defines `func _mcp_state() -> Dictionary`,
   the bridge calls it (`node.has_method("_mcp_state")`) and merges the returned
   dict verbatim under that node. This lets game code expose domain state
   (health, ammo, AI state) without the bridge guessing field names.
3. Generic fallback (no group, no method): visible `CanvasItem`s whose
   `is_visible_in_tree()` is true and that pass the frustum/visible-rect test,
   capped at N (default 40), nearest-to-camera first. This makes the tool useful
   on an untagged project without flooding context.

A `name`/`type` filter mirroring `find_nodes` should also be accepted so the
agent can ask "just the enemies".

### Proposed API surface
New tool `runtime_state` (server) backed by new command `get_runtime_state`.

```
runtime_state
  action: "digest"            # only action for v1
  select: "group" | "method" | "auto"   # default "auto": group if any tagged, else method, else fallback
  group: string (optional)    # default "mcp_watch"
  name: string (optional)     # name glob filter, like find_nodes
  type: string (optional)     # class filter, like find_nodes
  max_nodes: int (optional)   # default 40, hard cap 200
  include: string[] (optional) # subset of ["transform","velocity","anim","groups","script_vars","onscreen"]
```

Example response (text/JSON, server-formatted):

```json
{
  "scene": "/root/Level1",
  "camera": { "kind": "2d", "center": [512.0, 300.0], "zoom": 1.0,
              "visible_rect": [256, 150, 1024, 600] },
  "node_count_scanned": 312,
  "returned": 3,
  "selection": "group:mcp_watch",
  "entities": [
    { "path": "/root/Level1/Player", "type": "CharacterBody2D",
      "pos": [520.0, 410.0], "rot_deg": 0.0, "vel": [120.0, 0.0],
      "anim": { "player": "run", "pos": 0.34 }, "onscreen": true,
      "groups": ["mcp_watch", "player"],
      "state": { "health": 80, "coins": 3 } },
    { "path": "/root/Level1/Enemy2", "type": "CharacterBody2D",
      "pos": [980.0, 410.0], "vel": [-60.0, 0.0], "onscreen": false,
      "groups": ["mcp_watch", "enemy"] }
  ]
}
```

### Addon vs server split
- Addon (thin): walk tree, select per tier, extract typed fields, call
  `_mcp_state()` where present, build the entity array, send via
  `godot_mcp:game_response`. Must round floats to ~2 decimals in-engine to keep
  bytes down (do not ship full f64 precision).
- Server (thin): pass-through with light shaping/formatting and the `include`
  projection if we want to drop fields client-side. No heavy compute.

### Context cost
~150-300 bytes per entity. Default cap 40 entities -> ~6KB-12KB, zero vision
tokens. For a typical 3-10 tagged entities -> 1KB-3KB. Roughly 50x-200x cheaper
than a screenshot, with exact numbers the agent can reason about and assert on.

### Risks
- `_mcp_state()` returning huge/cyclic dicts: cap serialized size per node
  (e.g. 1KB) and reject non-JSON-able values.
- Calling user code (`_mcp_state`) during a debugger callback: it runs on the
  game main loop deferred, same as input injection already does; keep it inside
  the existing deferred/await pattern, never reentrant.

---

## Direction 2: State over time, de-fanged

### What it answers
"How did these values change over ~1s." Sample selected scalars in-engine at M Hz,
summarize server-side into start/end/min/max/slope plus threshold-crossing
events. Never return per-frame arrays.

### Feasibility (against real code)
High, and it should mirror `MCPFrameProfiler` almost exactly. That class is an
`EngineProfiler` registered via `EngineDebugger.register_profiler(...)`, ticked
per frame, ring-buffered to `MAX_FRAMES` (300), and drained on demand by
`get_profiler_data` -> summarized in `profiler.ts get_data`. We reuse that exact
shape but for state scalars instead of frame timings.

Two viable in-engine sampling mechanisms:

1. A dedicated `Node` in the bridge that sets `set_process(true)` and samples on
   `_process` at a decimated rate (e.g. every Nth frame to hit ~20Hz), pushing
   into a ring buffer. This matches the existing input-sequence `_process` loop
   already in `mcp_game_bridge.gd` (the `_sequence_*` machinery), so the pattern
   is proven in this file.
2. A second `EngineProfiler` subclass. Cleaner conceptually but `_tick` gives
   frame timings, not arbitrary node values; you would still read nodes inside
   `_tick`. Option 1 is simpler and avoids profiler-slot semantics.

Recommend option 1.

The "what to sample" is a list of watch specs: `node_path` + field key (a typed
field like `pos.x`, `vel.y`, or a `_mcp_state()` key like `health`). The handler
resolves each path once at start, then samples cheaply.

### Start/poll/collect shape (required by timeouts)
Because a 1s window exceeds neither timeout but a 5s window can, and to avoid
holding a `_send_and_wait` open, use three commands like the profiler:

```
runtime_state action: "watch_start"
  specs: [{ "path": "/root/Level1/Player", "fields": ["pos.x","vel.x","state.health"] }, ...]
  hz: int (optional, default 20, cap 60)
  duration_ms: int (optional, default 1000, cap 5000)  # auto-stops, ring-buffered
runtime_state action: "watch_collect"   # drains buffer, returns summary
runtime_state action: "watch_stop"       # optional early stop
```

### Server-side summarization (reuse profiler.ts patterns)
For each watched field, compute over the samples:
- start, end, min, max, mean
- slope: `(end - start) / window_seconds` (units/sec); for vectors, per-component
- threshold-crossing events: when a field crosses zero, changes sign, or crosses
  a caller threshold; emit `{ field, t_ms, from, to }`. This is the direct analog
  of `detectSpikes` (event extraction instead of array).
- discrete-change events for non-numeric/enum fields (e.g. anim name changed
  from "idle" to "run" at t=420ms).

Example response:

```json
{
  "window_ms": 1000, "hz": 20, "samples": 20,
  "fields": {
    "/root/Level1/Player.pos.x": { "start": 520.0, "end": 640.0, "min": 520.0,
      "max": 640.0, "mean": 580.0, "slope_per_s": 120.0 },
    "/root/Level1/Player.vel.x": { "start": 0.0, "end": 120.0, "slope_per_s": 120.0,
      "events": [{ "t_ms": 50, "type": "cross", "from": 0.0, "to": 60.0 }] }
  },
  "discrete": [
    { "field": "/root/Level1/Player.anim.player", "t_ms": 420, "from": "idle", "to": "run" }
  ]
}
```

### Addon vs server split
- Addon (thin): sample resolved fields into a ring buffer at the decimated rate;
  return the raw sample arrays (rounded) on `watch_collect`. Cap total samples
  (hz * duration capped, plus a hard ring-buffer cap like `MAX_FRAMES`).
- Server (does the math): all percentile/slope/event extraction lives in TS,
  reusing the structure of `computePercentiles`/`detectSpikes`/`computeMonitorTrends`.

### Context cost
Raw arrays never reach the agent; only the digest does. A digest of ~6 fields is
~1KB-2KB regardless of window length or Hz. This is the whole point: cost is
bounded by field count, not by time or sample rate.

### Risks
- Sampling cost on the game: 20Hz reading a handful of fields is negligible;
  guard against pathological spec counts (cap fields, e.g. 32).
- Path going invalid mid-window (node freed): record a `freed` event and stop
  sampling that field rather than erroring the whole window.

---

## Direction 3: Visual over time (contact sheet)

### What it answers
"Show me the motion across ~1s" when numbers are not enough (visual glitches,
layout, animation feel). Composite K downsampled thumbnails into ONE image.

### Feasibility (against real code)
Feasible. Capture reuses `_capture_and_send_screenshot`'s
`viewport.get_texture().get_image()` path. The open question is WHERE tiling
happens:

- In-engine (GDScript): capture K frames at intervals, `image.resize()` each to
  a thumb (e.g. 256px wide), then `Image.blit_rect()` each thumb into a single
  grid `Image`, `save_png_to_buffer()` once, base64 once. Godot's `Image` has
  `blit_rect`, `resize`, `save_png_to_buffer`; all available in-engine. One
  base64 payload leaves the game.
- Server-side (Node): the game would have to send K separate PNG buffers over
  the debugger channel, then Node composites (e.g. sharp/jimp). This puts K full
  base64 buffers on the wire between game and editor and adds a Node image dep.

Recommendation: tile IN-ENGINE. It keeps the wire payload to one composited
image (cheapest transport, matches the existing single-image return contract in
`index.ts content: [result]`), and avoids adding an image library to the server.
This is the one place where in-engine processing is preferred over the
"summarize server-side" default, precisely because the alternative multiplies
the most expensive payload type.

Frame timing: capture must await `RenderingServer.frame_post_draw` per frame
(as the existing screenshot does). For K frames over a window, use a small
in-engine loop with `await get_tree().create_timer(interval).timeout` between
captures, accumulating thumbs, then compose. This exceeds the 5s
`_send_and_wait` window for long captures, so it must use the
start/poll/collect shape OR a longer dedicated timeout. Given K=9 over ~1s is
well under 5s, a single command with a bumped timeout (like
`SCREENSHOT_TIMEOUT`) is acceptable for the default; document the cap.

### Proposed API surface
New tool `motion_capture` (or fold into `runtime_state action: "contact_sheet"`).

```
motion_capture
  frames: int (optional, default 9, cap 16)
  interval_ms: int (optional, default 110)   # ~1s for 9 frames
  thumb_width: int (optional, default 256, cap 384)
  cols: int (optional, default 3)            # grid columns; rows derived
```

Returns one `ImageContent` (the contact sheet) plus, ideally, a short text
caption with the per-tile timestamps. Note: current return type is a single
`ToolResult`, so caption-as-separate-text-content needs the array return change
(see Open Questions); for v1 return just the image and put timestamps in a
follow-up text tool call if needed, OR overlay tiny frame indices in-engine.

### Context cost
One 3x3 grid of 256px tiles is a ~768x432 image. That is far smaller than a
single 1920-wide screenshot in BOTH bytes and vision tokens (area ~0.16x of
1920x1080), yet conveys 9 moments. Net: roughly one cheap screenshot's cost for
~1s of motion, versus 9 full screenshots today. Order of 10x-50x savings vs
nine separate captures.

### Risks
- 3D capture cost: K renders are heavier than K tree walks; keep K small and
  document that this is the expensive tool, to be used deliberately.
- Color/format: `get_image()` may be in a non-RGBA8 format; convert before
  `blit_rect` (`image.convert(Image.FORMAT_RGBA8)`).

---

## Direction 4: Event timeline

### What it answers
"What discrete things happened in this window" - signals fired, state-machine
transitions, collisions - as a compact text timeline.

### Feasibility (against real code)
Mixed. There is no existing event-capture buffer; this is the most new
machinery. Mechanisms available in-engine:

- Signals: the bridge can `connect` to specific signals on watched nodes (it
  already enumerates them in `_collect_signal_connections`). On fire, append
  `{t_ms, source, signal, args_summary}` to a ring buffer. Connecting to ALL
  signals on ALL nodes is too much; scope to watched nodes (group `mcp_watch`)
  and an opt-in signal-name allowlist.
- State-machine transitions: `AnimationTree` `StateMachinePlayback` exposes
  `get_current_node()`; sampled in Direction 2's loop, a change is a transition
  event. So SM transitions can ride on the Direction-2 sampler for free.
- Collisions: only reliably observable via signals
  (`body_entered`/`area_entered`) on `Area2D/3D`, or by polling
  `get_slide_collision_count()` on `CharacterBody`. Both are opt-in per node.

Recommend: implement the timeline as a thin layer on top of Direction 2's
start/collect lifecycle. `watch_start` optionally takes `signals` (list of
`{path, signal}` to connect) and the collector returns a merged, time-sorted
event list alongside the field digest. This avoids a second independent
buffering subsystem.

### Proposed API surface
Fold into `runtime_state watch_start`:

```
runtime_state action: "watch_start"
  ... (fields as Direction 2) ...
  signals: [{ "path": "/root/Level1/Player", "signal": "died" }, ...] (optional)
```

`watch_collect` response gains:

```json
"timeline": [
  { "t_ms": 120, "kind": "signal", "source": "/root/Level1/Player", "name": "jumped" },
  { "t_ms": 420, "kind": "anim_transition", "source": ".../Player", "from": "idle", "to": "run" },
  { "t_ms": 880, "kind": "signal", "source": ".../Enemy2", "name": "died", "args": "[42]" }
]
```

### Addon vs server split
- Addon: connect/disconnect signals over the window, ring-buffer events with
  timestamps and a short stringified args summary (cap arg length).
- Server: merge-sort timeline with the sampled discrete changes, format.

### Context cost
A window of discrete events is tiny: ~60-100 bytes/event, typically <2KB.

### Risks
- Connecting to arbitrary signals risks reentrancy/perf if a signal fires at
  high frequency (e.g. `body_shape_entered`); cap events per window
  (like `MAX_SIGNAL_CONNECTIONS = 200`) and drop with a "truncated" marker.
- Must reliably disconnect on `watch_stop`, window end, and session end (mirror
  the `_session_stopped` cleanup in `mcp_debugger_plugin.gd`).

---

## Direction 5: Pre-processing split (principle)

Verified default: keep the addon thin (walk tree / grab frames / sample / buffer)
and do summarization in Node, exactly as `profiler.ts` already does over
`MCPFrameProfiler`'s raw frames. This keeps the version-coupled GDScript surface
small and puts iterable logic (percentiles, slopes, event extraction, formatting)
where it is easy to unit-test with vitest.

The ONE justified exception is Direction 3 (contact sheet) tiling: compositing
in-engine avoids shipping K separate image buffers over the debugger channel and
keeps the wire/return payload to a single image. Image bytes are the most
expensive payload, so minimizing how many cross the channel wins even though it
violates the "summarize server-side" default.

Everything else (state digest shaping, time-series stats, timeline merge) stays
server-side.

---

## Recommended phased approach

Phase 1 (highest leverage, build first): runtime_state action "digest"
(Direction 1). It is the direct screenshot replacement, reuses the existing tree
walk and the `_send_and_wait` request/response path with no new lifecycle, and
delivers the biggest context savings immediately. Ship with the three selection
tiers (group / `_mcp_state()` / frustum fallback) and the `find_nodes`-style
filters.

Phase 2: state-over-time (Direction 2) using the start/poll/collect lifecycle
that mirrors the frame profiler, with server-side stats reusing the
`profiler.ts` helpers. This is the "state over time without context blowup" core
deliverable.

Phase 3: event timeline (Direction 4) folded into the Phase-2 `watch_start`/
`watch_collect` lifecycle (signals + anim-SM transitions). Low marginal cost
once Phase 2 exists.

Phase 4: contact sheet (Direction 3). Most engine work and the only vision-cost
tool; build last, and only after digests have proven they cover most needs. May
require the multi-content return change if we want a caption.

## Single highest-leverage first build

`runtime_state action: "digest"` (Direction 1, Phase 1). One new GDScript
command handler that reuses the existing recursive tree walk and the existing
generic `_send_and_wait` channel, one new thin TS tool. It replaces the majority
of screenshot calls with a ~2KB-12KB structured payload carrying exact transforms,
velocities, animation state, camera, and on-screen flags, at zero vision-token
cost. Everything else builds on the selection model and lifecycle it establishes.

## Open questions / risks

- Multi-content returns: `index.ts` wraps a single `ToolResult` as
  `content: [result]`. A contact sheet with a text caption, or any "image plus
  digest" combo, needs the return type widened to `ToolResult[]`. Decide whether
  to make that change in Phase 1 or defer to Phase 4.
- Float precision/rounding policy: must round in-engine (2 decimals) to control
  bytes; confirm 2 decimals is enough for the agent's reasoning (sub-pixel
  positions usually are not load-bearing).
- Selection default ("auto"): is "group if any tagged, else `_mcp_state`, else
  frustum fallback" the least-surprising default, or should fallback require an
  explicit opt-in to avoid scanning untagged scenes?
- `_mcp_state()` is an API contract we are asking game devs to adopt; needs
  documentation and a size cap. Name bikeshed (`_mcp_state` vs `_mcp_watch`).
- 5s in-editor `_send_and_wait` timeout vs longer windows: Phase 2/3/4 must use
  start/collect, not a single blocking call. Confirm a dedicated longer timeout
  for the contact-sheet single-call path is acceptable.
- Frustum/visible-rect math correctness across 2D vs 3D vs `SubViewport`-based
  cameras; needs test scenes.

## Proposed follow-up implementation issues

- feat: runtime_state digest tool (Direction 1) - tree-walk handler + thin TS
  tool returning transforms/velocity/anim/camera/onscreen as JSON.
- feat: runtime_state selection tiers - support group "mcp_watch", optional
  `_mcp_state()` method, and frustum/visible-rect fallback with caps.
- feat: state-over-time sampler (watch_start/collect/stop) - in-engine ring-
  buffered sampler at M Hz with auto-stop, mirroring MCPFrameProfiler.
- feat: server-side state digest stats - reuse profiler.ts patterns for start/
  end/min/max/slope and threshold-crossing event extraction.
- feat: event timeline on watch lifecycle - opt-in signal connect + anim state-
  machine transition capture, merged time-sorted timeline.
- feat: motion contact-sheet tool - in-engine capture of K frames, downsample +
  blit_rect into one grid image, single base64 return.
- refactor: widen tool return to ToolResult[] - allow image-plus-text content so
  contact sheet can carry per-tile timestamps.
- docs: document _mcp_state() contract and mcp_watch group - dev-facing guide
  for opting entities into the digest.
- test: frustum and visible-rect on-screen detection - 2D/3D/SubViewport scenes
  validating the onscreen flag.
