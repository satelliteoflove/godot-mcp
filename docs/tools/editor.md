# Editor Tools

Editor control, debugging, and screenshot tools

## Tools

- [godot_editor_read](#godot_editor_read)
- [godot_editor_edit](#godot_editor_edit)

---

## godot_editor_read

Observe the editor and running game: get editor state (open scene, play state, camera, viewport), read the current node selection, pull editor log messages (with an incremental cursor) and stack traces, and capture lossless PNG screenshots of the running game or an editor viewport. Reach for it to check what the editor sees before and after a change; screenshot_game needs a running game, while every other action works in the bare editor. It changes nothing - to select nodes, run/stop/restart, or move the 2D viewport use godot_editor_edit; errors from the running game (not the editor process) come via minimal-godot-mcp's get_console_output when that companion server is installed.

### Actions

#### `get_state`

Get editor state: current scene, play state, version, camera, viewport

*No parameters.*

#### `get_selection`

Get the currently selected nodes

*No parameters.*

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

Capture a lossless PNG of the running game. Each frame persists in context every later turn and never decays, so reserve it for genuine APPEARANCE judgments (spacing, color, art, "does it look right"). For STRUCTURE or state — which control is focused, a label's text, whether a panel is visible, a node's anchors/size — read cheap text instead: godot_node_read (scene tree, node properties) or godot_runtime_state digest (live values), both ~free versus the hundreds of visual tokens a frame costs. Do not re-shoot a view that has not changed.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_width` | integer | No | Maximum width in pixels (default: 900). Cost scales with resolution (~1 visual token per 28x28px patch; a 900px 16:9 frame ≈ 600 tokens, a native 1080p frame ≈ 2700 on Opus). 640 is the legibility floor for chip-dense UI — still crisp; 512 is the edge and 384 breaks fine print — so drop toward 640 to roughly halve per-frame cost when you do not need the finest text, and raise above 900 only when detail is genuinely unreadable. |

#### `screenshot_editor`

Capture a lossless PNG of an editor viewport. Same context cost as screenshot_game — the frame persists every later turn — so capture for appearance, not for structure/state you could read as cheap text via godot_node_read (scene tree, node properties) or godot_runtime_state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewport` | `2d`, `3d` | No | Which editor viewport to capture |
| `max_width` | integer | No | Maximum width in pixels (default: 900). Cost scales with resolution (~1 visual token per 28x28px patch; a 900px 16:9 frame ≈ 600 tokens). 640 is the legibility floor for chip-dense UI (512 is the edge, 384 breaks fine print), so drop toward 640 to roughly halve per-frame cost when you do not need the finest text; raise above 900 only when detail is unreadable. |

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
// get_log_messages
{
  "action": "get_log_messages"
}
```

*3 more actions available: `get_stack_trace`, `screenshot_game`, `screenshot_editor`*

---

## godot_editor_edit

Drive the editor: select a node, run or stop the project, restart the editor, and center/zoom the 2D viewport. Use run with frozen=true as the deterministic-playtest entry point (game time holds at frame 0 until godot_game_time steps or thaws it). To test edited gameplay scripts just stop then run — the launched game loads .gd/.tscn fresh from disk; reserve restart for EDITOR-side staleness (edited @tool/addon code, a stale project.godot, or a cached .gdshader). For observation only (state, selection, logs, screenshots) use godot_editor_read instead; restart does not start a cold editor, so one must already be running.

### Actions

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

Restart the editor, reloading project.godot (autoloads, input map), addon code, and plugins from disk. Use it for EDITOR-side staleness only: edited @tool/addon/plugin code, changed autoloads or input map, or a .gdshader the editor still renders from a cached compile. NOT needed to test edited gameplay scripts — a launched game loads .gd/.tscn fresh from disk, so godot_editor_edit stop then run already runs the new code. Fire-and-forget: the bridge drops and auto-reconnects within a few seconds. Does not start a cold editor - the editor must already be running.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `save` | boolean | No | Save the project before restarting (default: true). Set false to discard unsaved editor changes. |

#### `set_viewport_2d`

Center and/or zoom the 2D editor viewport. Pass at least one parameter; omitted parameters PRESERVE the current view (e.g. pass only zoom to zoom in on the current center). The addon reads the live viewport transform to fill in whatever you leave out.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `center_x` | number | No | X coordinate to center the 2D viewport on (omitted = keep current X) |
| `center_y` | number | No | Y coordinate to center the 2D viewport on (omitted = keep current Y) |
| `zoom` | number | No | Zoom level, e.g. 1.0 = 100%, 2.0 = 200% (omitted = keep current zoom) |

### Examples

```json
// select
{
  "action": "select",
  "node_path": "/root/Main/Player"
}
```

```json
// run
{
  "action": "run"
}
```

```json
// stop
{
  "action": "stop"
}
```

*2 more actions available: `restart`, `set_viewport_2d`*

---

