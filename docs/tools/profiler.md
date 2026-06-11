# Profiler Tools

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

## Tools

- [godot_profiler](#godot_profiler)

---

## godot_profiler

Performance profiling and analysis: snapshot all engine metrics, collect per-frame time series data with spike detection, list active _process/_physics_process scripts, inspect signal connections

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

