# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [editor](#editor)

---

## editor

Control the Godot editor: get state (includes viewport/camera info), manage selection, run/stop project, get debug output, get_errors (structured errors with file:line), get_stack_trace (backtrace from last error), get performance metrics, capture screenshots, set 2D viewport position/zoom

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_state`, `get_selection`, `select`, `run`, `stop`, `get_debug_output`, `get_errors`, `get_stack_trace`, `get_performance`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d` | Yes | Action: get_state, get_selection, select, run, stop, get_debug_output, get_errors, get_stack_trace, get_performance, screenshot_game, screenshot_editor, set_viewport_2d |
| `node_path` | string | select | Path to node |
| `scene_path` | string | No | Scene to run (run only, optional) |
| `clear` | boolean | get_debug_output, get_errors | Clear buffer after reading |
| `source` | `editor`, `game` | No | Output source: "editor" for editor panel messages (script errors, loading failures), "game" for running game output. If omitted, returns game output when running, else editor output. |
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

#### `get_debug_output`

Parameters: `clear`

#### `get_errors`

Parameters: `clear`

#### `get_stack_trace`

#### `get_performance`

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

*9 more actions available: `run`, `stop`, `get_debug_output`, `get_errors`, `get_stack_trace`, `get_performance`, `screenshot_game`, `screenshot_editor`, `set_viewport_2d`*

---

