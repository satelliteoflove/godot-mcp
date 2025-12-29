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
| `action` | enum (8 values) | Yes | Action: get_state, get_selection, select, run, stop, get_debug_output, screenshot_game, screenshot_editor |
| `node_path` | string | No | Path to node (select only) |
| `scene_path` | string | No | Scene to run (run only, optional) |
| `clear` | boolean | No | Clear output buffer after reading (get_debug_output only) |
| `viewport` | `2d`, `3d` | No | Which editor viewport to capture (screenshot_editor only) |
| `max_width` | number | No | Maximum width in pixels for screenshot (screenshot_game, screenshot_editor) |

---

