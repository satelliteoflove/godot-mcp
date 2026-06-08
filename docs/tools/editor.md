# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [godot_editor](#godot_editor)

---

## godot_editor

Control the Godot editor: get state, manage selection, run/stop project, restart the editor, capture screenshots, read log messages and stack traces, control 2D viewport

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_state`, `get_selection`, `select`, `run`, `stop`, `restart`, `get_log_messages`, `get_stack_trace`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d` | Yes |  |
| `node_path` | string | No | Path to node to select |
| `scene_path` | string | No | Scene to run (optional, defaults to main scene) |
| `frozen` | boolean | No | Launch with game time frozen from frame 0 (gameplay never starts racing your latency). Use godot_game_time step/thaw to advance. |
| `save` | boolean | No | Save the project before restarting (default: true). Set false to discard unsaved editor changes. |
| `clear` | boolean | No | Clear buffer after reading |
| `limit` | integer | No | Maximum number of messages to return (default: 50) |
| `max_width` | integer | No | Maximum width in pixels (default: 900) |
| `quality` | integer | No | JPEG quality 1-100 (default: 75) |
| `viewport` | `2d`, `3d` | No | Which editor viewport to capture |
| `center_x` | number | No | X coordinate to center the 2D viewport on |
| `center_y` | number | No | Y coordinate to center the 2D viewport on |
| `zoom` | number | No | Zoom level, e.g. 1.0 = 100%, 2.0 = 200% |

### Actions

#### `get_state`

#### `get_selection`

#### `select`

#### `run`

#### `stop`

#### `restart`

#### `get_log_messages`

#### `get_stack_trace`

#### `screenshot_game`

#### `screenshot_editor`

#### `set_viewport_2d`

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
  "action": "select"
}
```

*8 more actions available: `run`, `stop`, `restart`, `get_log_messages`, `get_stack_trace`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d`*

---

