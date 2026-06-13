# Runtime State Tools

Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Works out of the box for both 2D and 3D scenes (the auto fallback surfaces visible 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas — not just UI). Much cheaper than screenshots.

## Tools

- [godot_runtime_state](#godot_runtime_state)

---

## godot_runtime_state

Observe live game state as structured data. Use digest for a one-shot entity snapshot (replaces most godot_editor_read screenshot_game calls). Use watch_start → watch_collect for state-over-time without context blowup.

### Actions

#### `digest`

Snapshot current game entity state as structured JSON — exact positions, velocities, animation state, and custom game data. Much cheaper than screenshot_game (no vision tokens). Works on any game with no setup; add nodes to the "mcp_watch" group or implement `func _mcp_state() -> Dictionary` on key nodes for richer, targeted data. WHAT TO PUT IN _mcp_state(): include BOTH (1) live runtime values that change during play (cursor position, health, score, fill counts) AND (2) static definition context an agent needs to interpret them — e.g. a puzzle node should expose its clue data, a level node its objective list, a shop its item catalog. Without definition context, an agent can observe state changes but cannot verify correctness. Also include layout geometry for renderable nodes (bounds, sizes, offsets) to enable programmatic layout checks without a screenshot.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `select` | `group`, `method`, `auto`, `none` | No | Selection tier: "group" = nodes in mcp_watch group, "method" = nodes with _mcp_state(), "auto" = best available (default: auto picks group → method → a visibility fallback that surfaces visible 2D nodes (CanvasItems) AND 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas), "none" = no automatic selection; return only the nodes named in paths |
| `group` | string | No | Group name to use when select="group" or "auto" (default: "mcp_watch") |
| `paths` | string[] | No | Explicit absolute node paths to include in addition to tier selection, e.g. ["/root/GameState"]. The digest walks the current scene only, so autoload singletons — where global game state often lives (cash, score, settings) — are otherwise unreachable. Each path returns _mcp_state() if present, else a snapshot of the node's script variables (scalars/arrays, ~1 KB cap). Paths that do not resolve are returned in unresolved_paths. |
| `name` | string | No | Glob filter on node name (e.g. "Player*") |
| `type` | string | No | Class filter (e.g. "CharacterBody2D") |
| `max_nodes` | integer | No | Maximum nodes in result (default: 40) |
| `include` | string[] | No | Subset of fields to include (default: all available) |

#### `watch_start`

Start an in-engine sampler that records specified node fields over a time window. Returns immediately; call watch_collect after duration_ms to get the summarized digest. Field keys: "pos.x", "pos.y", "vel.x", "vel.y" for built-in properties; any key from _mcp_state() for custom game state (e.g. "health", "ammo"). TIMING: watch_start and the action that drives state change (godot_input sequence, player input, etc.) must overlap within the watch window. Send both in the same parallel tool call batch, or use a duration_ms large enough (3000–4000ms) to cover the round-trip latency before the driving action is approved and sent. NODE PATHS: if a path in specs cannot be resolved, that spec is silently skipped; check resolved_fields in the response — 0 means all paths were invalid.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `specs` | object[] | No | Which nodes and fields to watch. Optional when signals is provided. |
| `signals` | object[] | No | Signals to record as discrete timeline events during the window. Each emission is buffered as {t_ms, source, signal, args} (200 events/window shared FAIRLY — each signal gets an equal sub-budget so a chatty signal cannot starve a rare one; keep-first within each, with events_dropped + events_dropped_by_signal reporting any loss; args stringified to ~100 chars). watch_collect merges these with string-field transitions into a time-sorted `timeline`. Signals with more than 5 parameters are skipped and reported in unresolved_signals, as are bad paths/names. Connections stay live until duration_ms elapses or watch_stop. Signals must be emitted on the main thread (worker-thread emissions are unsupported). At least one of specs/signals is required. |
| `hz` | integer | No | Sample rate in Hz (default: 20) |
| `duration_ms` | integer | No | Auto-stop after this many milliseconds (default: 1000) |

#### `watch_collect`

Collect the current sampler buffer and return a per-field summary (start/end/min/max/mean/slope for numeric fields; transition events for string fields) plus a time-sorted `timeline` merging watched signal emissions with string-field transitions (kinds: signal, anim_transition, field_change). TIMESTAMPS: signal t_ms is emission time (ms resolution); anim/field t_ms is DETECTION time at the sample rate — the change happened up to one sample interval earlier, so do not infer cross-kind ordering from nearby timestamps. Safe to call before auto-stop — returns whatever has been recorded so far; signal connections stay live until the window ends.

*No parameters.*

#### `watch_stop`

Stop the sampler early (disconnecting watched signals) and return the final per-field summary and merged `timeline`. Equivalent to watch_collect + stopping the sampler.

*No parameters.*

### Examples

```json
// digest
{
  "action": "digest"
}
```

```json
// watch_start
{
  "action": "watch_start",
  "specs": [
    {
      "path": "/root/Main/Player",
      "fields": [
        "example"
      ]
    }
  ]
}
```

```json
// watch_collect
{
  "action": "watch_collect"
}
```

*1 more actions available: `watch_stop`*

---

