# Profiler Tools

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

## Tools

- [godot_profiler](#godot_profiler)

---

## godot_profiler

Performance profiling and analysis: snapshot all engine metrics, collect per-frame time series data with spike detection, list active _process/_physics_process scripts, inspect signal connections

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `snapshot`, `start`, `stop`, `get_data`, `get_active_processes`, `get_signal_connections` | Yes | Action: snapshot (full perf snapshot), start/stop/get_data (time series profiling), get_active_processes, get_signal_connections |
| `node_path` | string | No | Node path for get_signal_connections (optional, defaults to scene root) |

### Actions

#### `snapshot`

#### `start`

#### `stop`

#### `get_data`

#### `get_active_processes`

#### `get_signal_connections`

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

