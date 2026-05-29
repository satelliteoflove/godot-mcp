# Runtime State Tools

Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Much cheaper than screenshots.

## Tools

- [godot_runtime_state](#godot_runtime_state)

---

## godot_runtime_state

Observe live game state as structured data. Use digest for a one-shot entity snapshot (replaces most screenshot_game calls). Use watch_start → watch_collect for state-over-time without context blowup.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `digest`, `watch_start`, `watch_collect`, `watch_stop` | Yes |  |
| `select` | `group`, `method`, `auto` | No | Selection tier: "group" = nodes in mcp_watch group, "method" = nodes with _mcp_state(), "auto" = best available (default: auto picks group → method → visible CanvasItems) |
| `group` | string | No | Group name to use when select="group" or "auto" (default: "mcp_watch") |
| `name` | string | No | Glob filter on node name (e.g. "Player*") |
| `type` | string | No | Class filter (e.g. "CharacterBody2D") |
| `max_nodes` | integer | No | Maximum nodes in result (default: 40) |
| `include` | string[] | No | Subset of fields to include (default: all available) |
| `specs` | object[] | No | Which nodes and fields to watch |
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

