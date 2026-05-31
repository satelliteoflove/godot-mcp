# Runtime State Guide: mcp_watch and _mcp_state()

The `godot_runtime_state` tool lets an agent read live game state as structured JSON
(positions, velocities, animation state, and your own custom values) instead of guessing
from a screenshot. It works on any project with zero setup, but you get far better results
by adopting two small, opt-in conventions:

- the `mcp_watch` group: tag the nodes that matter, and
- the `_mcp_state()` method: expose your own domain state (health, ammo, score, ...).

This guide covers both, plus how the tool decides which nodes to report.

For the raw parameter/action reference, see
[Tools Reference -> Runtime State](tools/runtime-state.md).

---

## Selection tiers and `auto`

`godot_runtime_state` (action `digest`) picks nodes using one of three tiers, controlled by
the `select` parameter:

| Tier       | What it selects                                                        |
|------------|------------------------------------------------------------------------|
| `group`    | Nodes in the `mcp_watch` group (or a custom group via `group`)         |
| `method`   | Nodes that define `func _mcp_state() -> Dictionary`                     |
| `fallback` | Visible `CanvasItem`s (`is_visible_in_tree()`), capped at `max_nodes`  |

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
- `onscreen` for a `Node2D` when a `Camera2D` is active
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
built-ins (`pos.x`, `pos.y`, `pos.z`, `vel.x`, `vel.y`, `vel.z`, `rot`, `anim`, ...):

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

## Quick checklist

- Tag the entities that matter into the `mcp_watch` group.
- Add `_mcp_state()` to those nodes; return live values AND the context to interpret them.
- Keep each `_mcp_state()` cheap, side-effect-free, JSON-able, and under ~1 KB.
- Let agents call `digest` for a snapshot and `watch_start` / `watch_collect` for motion.
