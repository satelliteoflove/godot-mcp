# Profiler Tools

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

## Tools

- [godot_profiler](#godot_profiler)

---

## godot_profiler

Profile a running game; every action errors if no game is playing. Use snapshot for one-shot engine metrics, or start → get_data for a per-frame time series with percentile stats, frame-budget usage, spike detection, and monitor trends. get_active_processes lists scripts with live _process/_physics_process callbacks (useful for finding per-frame cost sources); get_signal_connections maps signal wiring. For observing game state rather than performance, use godot_runtime_state.

### Actions

#### `snapshot`

Full performance snapshot (all engine metrics)

*No parameters.*

#### `start`

Start per-frame time-series profiling

*No parameters.*

#### `stop`

Stop time-series profiling

*No parameters.*

#### `get_data`

Get collected time-series data with spike detection

*No parameters.*

#### `get_active_processes`

List active _process/_physics_process scripts

*No parameters.*

#### `get_signal_connections`

Inspect signal connections

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | No | Node path (defaults to scene root) |

### Examples

```json
// snapshot
{
  "action": "snapshot"
}
```

```json
// start
{
  "action": "start"
}
```

```json
// stop
{
  "action": "stop"
}
```

*3 more actions available: `get_data`, `get_active_processes`, `get_signal_connections`*

---

