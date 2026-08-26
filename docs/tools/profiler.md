# Profiler Tools

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

## Tools

- [godot_profiler](#godot_profiler)

---

## godot_profiler

Profile a running game; every action errors if no game is playing. Use snapshot for one-shot engine metrics, or start → get_data for a per-frame time series with percentile stats, frame-budget usage, spike detection, and monitor trends. get_active_processes lists scripts with live _process/_physics_process callbacks across the whole tree, tagged scene/autoload/exec (useful for finding per-frame cost sources); get_signal_connections maps signal wiring, including an autoload's outgoing connections. get_data's per-frame detail is a ring of the last 300 frames; its run block covers the whole profile. For observing game state rather than performance, use godot_runtime_state.

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

Get collected time-series data with spike detection. Per-frame detail (percentiles, spikes, monitor trends) covers a ring buffer of the LAST 300 frames only — the `window` field says how much of the run that is; `run` carries whole-run aggregates (frames, duration, avg/max, frames over budget, a frame-time histogram) so a ten-second profile can still answer "did anything spike".

*No parameters.*

#### `get_active_processes`

List scripts with live _process/_physics_process callbacks across the whole tree — scene, autoloads, and nodes attached by godot_exec — tagged by location.

*No parameters.*

#### `get_signal_connections`

Inspect signal connections

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | No | Node to walk from (default: the whole tree — scene, autoloads and exec-attached nodes). An absolute /root/... path may name an autoload. |

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

