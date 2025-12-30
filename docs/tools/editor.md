# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [editor](#editor)

---

## editor

Control the Godot editor: get state, manage selection, run/stop project, get debug output, capture screenshots

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_state`, `get_selection`, `select`, `run`, `stop`, `get_debug_output`, `screenshot_game`, `screenshot_editor` | Yes | Action: get_state, get_selection, select, run, stop, get_debug_output, screenshot_game, screenshot_editor |
| `node_path` | string | select | Path to node |
| `scene_path` | string | No | Scene to run (run only, optional) |
| `clear` | boolean | get_debug_output | Clear output buffer after reading |
| `viewport` | `2d`, `3d` | screenshot_editor | Which editor viewport to capture |
| `max_width` | number | screenshot_game, screenshot_editor | Maximum width in pixels for screenshot |

### Actions

#### `get_state`

#### `get_selection`

#### `select`

Parameters: `node_path`*

#### `run`

#### `stop`

#### `get_debug_output`

Parameters: `clear`*

#### `screenshot_game`

Parameters: `max_width`

#### `screenshot_editor`

Parameters: `viewport`*, `max_width`

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

*5 more actions available: `run`, `stop`, `get_debug_output`, `screenshot_game`, `screenshot_editor`*

---

