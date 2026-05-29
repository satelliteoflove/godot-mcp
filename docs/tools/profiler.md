# Profiler Tools

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

## Tools

- [godot_profiler](#godot_profiler)

---

## godot_profiler

Performance profiling and analysis: snapshot all engine metrics, collect per-frame time series data with spike detection, list active _process/_physics_process scripts, inspect signal connections

### Actions

#### `snapshot`

*No parameters.*

#### `start`

*No parameters.*

#### `stop`

*No parameters.*

#### `get_data`

*No parameters.*

#### `get_active_processes`

*No parameters.*

#### `get_signal_connections`

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

