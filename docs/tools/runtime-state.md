# Runtime State Tools

Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Works out of the box for both 2D and 3D scenes (the auto fallback surfaces visible 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas — not just UI). Much cheaper than screenshots.

## Tools

- [godot_runtime_state](#godot_runtime_state)

---

## godot_runtime_state

Observe live game state as structured data. Use digest for a one-shot entity snapshot (replaces most screenshot_game calls). Use watch_start → watch_collect for state-over-time without context blowup.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `digest`, `watch_start`, `watch_collect`, `watch_stop` | Yes |  |
| `select` | `group`, `method`, `auto`, `none` | No | Selection tier: "group" = nodes in mcp_watch group, "method" = nodes with _mcp_state(), "auto" = best available (default: auto picks group → method → a visibility fallback that surfaces visible 2D nodes (CanvasItems) AND 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas), "none" = no automatic selection; return only the nodes named in paths |
| `group` | string | No | Group name to use when select="group" or "auto" (default: "mcp_watch") |
| `paths` | string[] | No | Explicit absolute node paths to include in addition to tier selection, e.g. ["/root/GameState"]. The digest walks the current scene only, so autoload singletons — where global game state often lives (cash, score, settings) — are otherwise unreachable. Each path returns _mcp_state() if present, else a snapshot of the node's script variables (scalars/arrays, ~1 KB cap). Paths that do not resolve are returned in unresolved_paths. |
| `name` | string | No | Glob filter on node name (e.g. "Player*") |
| `type` | string | No | Class filter (e.g. "CharacterBody2D") |
| `max_nodes` | integer | No | Maximum nodes in result (default: 40) |
| `include` | string[] | No | Subset of fields to include (default: all available) |
| `specs` | object[] | No | Which nodes and fields to watch. Optional when signals is provided. |
| `signals` | object[] | No | Signals to record as discrete timeline events during the window. Each emission is buffered as {t_ms, source, signal, args} (200 events/window shared FAIRLY — each signal gets an equal sub-budget so a chatty signal cannot starve a rare one; keep-first within each, with events_dropped + events_dropped_by_signal reporting any loss; args stringified to ~100 chars). watch_collect merges these with string-field transitions into a time-sorted `timeline`. Signals with more than 5 parameters are skipped and reported in unresolved_signals, as are bad paths/names. Connections stay live until duration_ms elapses or watch_stop. Signals must be emitted on the main thread (worker-thread emissions are unsupported). At least one of specs/signals is required. |
| `hz` | integer | No | Sample rate in Hz (default: 20) |
| `duration_ms` | integer | No | Auto-stop after this many milliseconds (default: 1000) |

### Actions

#### `digest`

#### `watch_start`

#### `watch_collect`

#### `watch_stop`

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
  "action": "watch_start"
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

