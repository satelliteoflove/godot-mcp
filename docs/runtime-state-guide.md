# Runtime State Guide: mcp_watch and _mcp_state()

The `godot_runtime_state` tool lets an agent read live game state as structured JSON
(positions, velocities, animation state, and your own custom values) instead of guessing
from a screenshot. It works on any project with zero setup, but you get far better results
by adopting two small, opt-in conventions:

- the `mcp_watch` group: tag the nodes that matter, and
- the `_mcp_state()` method: expose your own domain state (health, ammo, score, ...).

This guide covers both, plus how the tool decides which nodes to report and how to read
global state held in autoload singletons.

For the raw parameter/action reference, see
[Tools Reference -> Runtime State](tools/runtime-state.md).

---

## Selection tiers and `auto`

`godot_runtime_state` (action `digest`) picks nodes using one of these tiers, controlled by
the `select` parameter:

| Tier       | What it selects                                                        |
|------------|------------------------------------------------------------------------|
| `group`    | Nodes in the `mcp_watch` group (or a custom group via `group`)         |
| `method`   | Nodes that define `func _mcp_state() -> Dictionary`                     |
| `fallback` | Visible `CanvasItem`s (`is_visible_in_tree()`), capped at `max_nodes`  |
| `none`     | No automatic selection -- only the nodes named in `paths` (see below)  |

The default, `select: "auto"`, picks the cheapest useful tier:

```
any node in the mcp_watch group   -> group
else any node has _mcp_state()     -> method
else                               -> fallback
```

When it falls back, the response includes a `hint` telling you to opt in for richer data.
That hint is your signal that the project has not been tagged yet.

Use an explicit tier when you want to force behavior, for example
`{ "action": "digest", "select": "group", "group": "enemies" }`.

---

## The `mcp_watch` group

Tag the entities you care about into a group named `mcp_watch`. The digest then reports
just those nodes instead of walking the whole scene.

Add a node to the group either in the editor or in code:

- Editor: select the node, open the **Node** dock -> **Groups**, add `mcp_watch`.
- Code:

```gdscript
func _ready() -> void:
    add_to_group("mcp_watch")
```

For each selected node the digest returns the fields that apply to it:

- `path`, `type`, and `groups` (internal groups starting with `_` are hidden)
- `pos`, `rot`, `scale` for `Node2D` / `Node3D`
- `vel` (and `angvel` for rigid bodies) for `CharacterBody2D/3D` and `RigidBody2D/3D`
- `anim` / `anim_pos` / `anim_frame` / `playing` for `AnimationPlayer` / `AnimatedSprite2D`
- `onscreen` for `Node2D` (against the active `Camera2D`'s visible world rect) and
  `Node3D` (against the active `Camera3D` frustum) -- see "On-screen detection" below
- `state` -- whatever your `_mcp_state()` returns (see below)

Use a different group name with the `group` parameter; `mcp_watch` is just the default.
You can further narrow results with `name` (glob, e.g. `"Player*"`), `type`
(class name, e.g. `"CharacterBody2D"`), and `max_nodes` (default 40).

---

## The `_mcp_state()` contract

The most useful tier. Implement this method on any node to expose domain state the bridge
cannot infer from built-in properties:

```gdscript
func _mcp_state() -> Dictionary:
    return { "health": health, "coins": coins }
```

### Rules

- **Signature:** `func _mcp_state() -> Dictionary`. The bridge calls it whenever the node
  `has_method("_mcp_state")`.
- **Called on the game main loop.** It runs during the digest and on every sample of a
  `watch_start` window, so keep it cheap and side-effect-free. Return a snapshot; do not
  mutate game state or allocate heavily.
- **Values must be JSON-able.** Accepted types: `bool`, `String`, `int`, `float`
  (rounded to 0.01), `Array`, `Dictionary`. Non-serializable values (`Object`, `NodePath`,
  `RID`, etc.) are skipped silently -- do not return node references.
- **~1 KB per node.** The serialized dictionary is capped at 1024 bytes. If you exceed it,
  the remaining keys are dropped and a `"_truncated": true` flag is added. Keep payloads
  small and relevant.
- **Errors are non-fatal.** If `_mcp_state()` raises, Godot prints the error and the bridge
  ignores the result (it is guarded by an `is Dictionary` check). A broken `_mcp_state()`
  never breaks the digest.

### What to put in it

Include BOTH categories, or an agent can see changes but cannot judge whether they are correct:

1. **Live runtime values** that change during play: `health`, `ammo`, `score`,
   cursor position, fill counts.
2. **Static definition context** needed to interpret them: a puzzle's clue/solution,
   a level's objective list, a shop's item catalog, layout bounds/sizes.

```gdscript
func _mcp_state() -> Dictionary:
    return {
        # live
        "health": health,
        "coins": coins,
        "cursor_cell": _cursor_cell,
        # definition context
        "goal_coins": level.goal_coins,
        "grid_size": { "w": grid.width, "h": grid.height },
    }
```

---

## On-screen detection

The `onscreen` flag reports whether a node's position is within the current view.
The camera is resolved from the node's **own viewport**, so a node inside a
`SubViewport` is tested against that SubViewport's camera, not the main window's.

- **3D** (`Node3D`): true when the position is inside the active `Camera3D` frustum
  (`is_position_in_frustum`), honoring perspective/orthographic projection and the
  near/far planes.
- **2D** (`Node2D`): true when the position is inside the active `Camera2D`'s visible
  **world** rect -- derived from the viewport's canvas transform, so camera offset and
  zoom are accounted for. A `VisibleOnScreenNotifier2D` is queried directly when the
  node is one.
- The flag is **omitted** (not reported as `false`) when it cannot be decided -- e.g. a
  3D node with no active `Camera3D`, or a 2D node with no active `Camera2D`.
- Boundary: the 2D rect test is inclusive of the top/left edge and exclusive of the
  bottom/right edge (Godot `Rect2.has_point` semantics).

---

## Reading global state in autoloads

The tiers above all walk the **current scene**. Autoload singletons live at `/root` as
siblings of the scene, so global state held in an autoload (cash, score, settings) is **not
reachable** by `group` / `method` / `fallback` -- and tagging an autoload into `mcp_watch`
or giving it `_mcp_state()` will not help on its own, because tier discovery never visits it.

Read singletons (or any node outside the current scene) by naming them explicitly with
`paths`:

```json
{ "action": "digest", "select": "none", "paths": ["/root/GameState"] }
```

- `select: "none"` skips the tier walk entirely and returns only the nodes you name -- a
  clean singleton read with no scene-walk noise. You can also pass `paths` alongside a normal
  tier; the named nodes are appended to the result.
- Each path returns `_mcp_state()` if the node defines it, otherwise a snapshot of the node's
  **script variables** (the `var`s declared in its script), so it works with no
  instrumentation at all. The snapshot follows the `_mcp_state()` rules: JSON-able
  scalars/arrays only, private (`_`-prefixed) vars skipped, ~1 KB cap.
- Paths that do not resolve come back in `unresolved_paths`.

You do not need to know the paths in advance: every `digest` response includes
`available_autoloads`, listing the singletons you can read.

`digest` with `select: "none"` and `paths: ["/root/GameState"]` returns:

```json
{
  "path": "/root/GameState",
  "type": "Node",
  "state": { "cash": 25000, "tick_count": 20, "total_population": 3 }
}
```

For a curated view instead of every script var, give the autoload its own `_mcp_state()` --
it takes precedence over the raw snapshot.

---

## Worked example: a Player node

```gdscript
extends CharacterBody2D

var health := 100
var coins := 0

func _ready() -> void:
    add_to_group("mcp_watch")

func _mcp_state() -> Dictionary:
    return {
        "health": health,
        "coins": coins,
    }
```

An agent then reads a one-shot snapshot:

```json
{ "action": "digest" }
```

and gets back an entity like:

```json
{
  "path": "/root/Level/Player",
  "type": "CharacterBody2D",
  "groups": ["mcp_watch"],
  "pos": { "x": 320.0, "y": 192.0 },
  "vel": { "x": 150.0, "y": 0.0 },
  "onscreen": true,
  "state": { "health": 100, "coins": 3 }
}
```

---

## Watching state over time

Keys you expose from `_mcp_state()` are also valid `watch_start` field keys, alongside the
built-ins (`pos.x`, `pos.y`, `pos.z`, `vel.x`, `vel.y`, `vel.z`, `rot`, `anim`, ...).
Absolute paths work here too, so you can watch an autoload's fields the same way you read
them in a digest (e.g. `/root/GameState`):

```json
{
  "action": "watch_start",
  "specs": [
    { "path": "/root/Level/Player", "fields": ["pos.x", "vel.x", "health"] }
  ],
  "hz": 20,
  "duration_ms": 1000
}
```

then `{ "action": "watch_collect" }` returns a per-field summary
(start/end/min/max/mean/slope plus events for numbers; transitions for strings). The raw
per-frame samples never reach the agent, so the cost is bounded by field count, not window
length. See [Tools Reference -> Runtime State](tools/runtime-state.md) for the full surface.

---

## Event timeline

Sampling answers "how did values move"; the timeline answers "what discrete things happened,
and in what order". `watch_start` optionally takes `signals` — an explicit allowlist of
signals to record during the window:

```json
{
  "action": "watch_start",
  "specs": [{ "path": "/root/Level/Player", "fields": ["anim", "vel.x"] }],
  "signals": [
    { "path": "/root/GameState", "signal": "wave_started" },
    { "path": "/root/Level/Player", "signal": "died" }
  ],
  "duration_ms": 2000
}
```

`watch_collect` / `watch_stop` then return a merged, time-sorted `timeline` alongside the
per-field summaries:

```json
"timeline": [
  { "t_ms": 120, "kind": "signal", "source": "/root/GameState", "name": "wave_started", "args": "[2]" },
  { "t_ms": 400, "kind": "anim_transition", "source": "/root/Level/Player", "from": "idle", "to": "run" },
  { "t_ms": 880, "kind": "signal", "source": "/root/Level/Player", "name": "died" }
]
```

- `signal` entries carry emission-time stamps (millisecond resolution); built-in signals
  (`body_entered`, ...) work the same as script signals. Signal connections live for the whole
  window — until `duration_ms` elapses or `watch_stop` — regardless of mid-window
  `watch_collect` calls. Same-millisecond signal entries keep emission order; the order of
  same-millisecond entries of *different* kinds is a fixed presentation order (signal,
  anim_transition, field_change), not chronology.
- `anim_transition` and `field_change` entries come from the sampled string fields, so their
  timestamps are detection times at the sample rate — the change happened up to one sample
  interval earlier. Do not infer cross-kind ordering from nearby timestamps. Watching the
  `anim` field on an `AnimationPlayer`, `AnimatedSprite2D`, or `AnimationTree` (state-machine
  root; other roots such as BlendTree yield nothing) gets you state transitions on the
  timeline for free — as does any string key you expose via `_mcp_state()`.
- Caps: 16 signal connections per watch, 200 events per window (`timeline_truncated: true`
  when exceeded — beware high-frequency signals like `body_shape_entered`), signal args
  stringified to ~100 chars. Bad paths/names, duplicates, and signals with more than 5
  parameters are skipped and reported by name in `unresolved_signals`.
- Limitations: signals must be emitted on the main thread (worker-thread or
  threaded-physics emissions are unsupported). Sampled-field history is capped at 200
  samples per field, so at `hz` above 40 a 5-second window saturates before it ends and
  late `anim_transition`/`field_change` entries silently stop — `timeline_truncated` covers
  only the signal-event budget.

---

## Quick checklist

- Tag the entities that matter into the `mcp_watch` group.
- Add `_mcp_state()` to those nodes; return live values AND the context to interpret them.
- Keep each `_mcp_state()` cheap, side-effect-free, JSON-able, and under ~1 KB.
- Let agents call `digest` for a snapshot and `watch_start` / `watch_collect` for motion.
- Watch `signals` (and the `anim` field) when ORDER of events matters, not just trajectories.
- For global state in autoload singletons, read them with `select="none"` and `paths`
  (every response lists them in `available_autoloads`).
