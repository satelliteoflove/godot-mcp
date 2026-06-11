# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [godot_editor](#godot_editor)

---

## godot_editor

Control the Godot editor: get state, manage selection, run/stop project, restart the editor, capture screenshots, read log messages and stack traces, control 2D viewport

### Actions

#### `get_state`

Get editor state: current scene, play state, version, camera, viewport

*No parameters.*

#### `get_selection`

Get the currently selected nodes

*No parameters.*

#### `select`

Select a node in the editor

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to node to select |

#### `run`

Run the project

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Scene to run (optional, defaults to main scene) |
| `frozen` | boolean | No | Launch with game time frozen from frame 0 (gameplay never starts racing your latency). Use godot_game_time step/thaw to advance. |

#### `stop`

Stop the running project

*No parameters.*

#### `restart`

Restart the editor, reloading project.godot (autoloads, input map), addon code, and plugins from disk. Use after external edits the running editor would otherwise keep stale. Fire-and-forget: the bridge drops and auto-reconnects within a few seconds. Does not start a cold editor - the editor must already be running.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `save` | boolean | No | Save the project before restarting (default: true). Set false to discard unsaved editor changes. |

#### `get_log_messages`

Get errors and warnings from the EDITOR process - @tool script runtime errors, import failures, addon errors, and failures from editor-side operations (scene/resource edits, reloads). This is the feedback channel for editor-side changes: run it after a mutation to confirm it did not break the editor. It does NOT include errors from the running game - for those, use minimal-godot-mcp's get_console_output (game console via DAP). Filter by severity (errors-only = "did my change break the editor?") and use `since`/`cursor` to read only what is new; every response returns the current `cursor`, even when empty.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clear` | boolean | No | Clear the editor error buffer after reading |
| `limit` | integer | No | Maximum number of messages to return (default: 50) |
| `severity` | `all`, `error`, `warning` | No | Filter by severity: "error" drops warnings (the "did anything actually break?" check), "warning" returns only warnings, "all" (default) returns both. |
| `since` | integer | No | Return only messages newer than this cursor. Pass back the `cursor` from a prior response to see just what is new since then - the incremental check that avoids re-reading the whole buffer (0/omitted = from the beginning). |

#### `get_stack_trace`

Get the most recent error stack trace

*No parameters.*

#### `screenshot_game`

Capture a lossless PNG screenshot of the running game

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_width` | integer | No | Maximum width in pixels (default: 900). Resolution is the vision-token cost lever (~width*height/750); lower it to spend less context. |

#### `screenshot_editor`

Capture a lossless PNG screenshot of an editor viewport

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewport` | `2d`, `3d` | No | Which editor viewport to capture |
| `max_width` | integer | No | Maximum width in pixels (default: 900). Resolution is the vision-token cost lever (~width*height/750); lower it to spend less context. |

#### `set_viewport_2d`

Center and zoom the 2D editor viewport

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `center_x` | number | No | X coordinate to center the 2D viewport on |
| `center_y` | number | No | Y coordinate to center the 2D viewport on |
| `zoom` | number | No | Zoom level, e.g. 1.0 = 100%, 2.0 = 200% |

### Examples

```json
// get_state
{
  "action": "get_state"
}
```

```json
// get_selection
{
  "action": "get_selection"
}
```

```json
// select
{
  "action": "select",
  "node_path": "/root/Main/Player"
}
```

*8 more actions available: `run`, `stop`, `restart`, `get_log_messages`, `get_stack_trace`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d`*

---

