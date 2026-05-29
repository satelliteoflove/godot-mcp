# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [godot_editor](#godot_editor)

---

## godot_editor

Control the Godot editor: get state, manage selection, run/stop project, capture screenshots, read log messages and stack traces, control 2D viewport

### Actions

#### `get_state`

*No parameters.*

#### `get_selection`

*No parameters.*

#### `select`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to node to select |

#### `run`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Scene to run (optional, defaults to main scene) |

#### `stop`

*No parameters.*

#### `get_log_messages`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clear` | boolean | No | Clear buffer after reading |
| `limit` | integer | No | Maximum number of messages to return (default: 50) |

#### `get_stack_trace`

*No parameters.*

#### `screenshot_game`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_width` | number | No | Maximum width in pixels for the screenshot |

#### `screenshot_editor`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewport` | `2d`, `3d` | No | Which editor viewport to capture |
| `max_width` | number | No | Maximum width in pixels for the screenshot |

#### `set_viewport_2d`

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

*7 more actions available: `run`, `stop`, `get_log_messages`, `get_stack_trace`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d`*

---

