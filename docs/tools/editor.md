# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [editor](#editor)

---

## editor

Control the Godot editor: get state, manage selection, run/stop project, capture screenshots, read log messages and stack traces, control 2D viewport

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_state`, `get_selection`, `select`, `run`, `stop`, `get_log_messages`, `get_stack_trace`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d` | Yes | Action: get_state, get_selection, select, run, stop, get_log_messages, get_stack_trace, screenshot_game, screenshot_editor, set_viewport_2d |
| `node_path` | string | select | Path to node |
| `scene_path` | string | No | Scene to run (run only, optional) |
| `clear` | boolean | get_log_messages | Clear buffer after reading |
| `limit` | integer | No | Maximum number of messages to return (get_log_messages only, default: 50) |
| `viewport` | `2d`, `3d` | screenshot_editor | Which editor viewport to capture |
| `max_width` | number | screenshot_game, screenshot_editor | Maximum width in pixels for screenshot |
| `center_x` | number | set_viewport_2d | X coordinate to center the 2D viewport on |
| `center_y` | number | set_viewport_2d | Y coordinate to center the 2D viewport on |
| `zoom` | number | set_viewport_2d | Zoom level for 2D viewport, e.g. 1.0 = 100%, 2.0 = 200% |

### Actions

#### `get_state`

#### `get_selection`

#### `select`

Parameters: `node_path`*

#### `run`

#### `stop`

#### `get_log_messages`

Parameters: `clear`*

#### `get_stack_trace`

#### `screenshot_game`

Parameters: `max_width`

#### `screenshot_editor`

Parameters: `viewport`*, `max_width`

#### `set_viewport_2d`

Parameters: `center_x`*, `center_y`*, `zoom`*

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

