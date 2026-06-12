# Project Tools

Project information tools

## Tools

- [godot_project](#godot_project)

---

## godot_project

Read project-level data from the editor: name, path, Godot version, and main scene (get_info), plus project settings including input mappings (get_settings). After editing project.godot as a file, use check_stale to detect whether the editor is still running stale autoloads or input map from before the edit; restart via godot_editor_edit to reload. Use addon_status to diagnose addon/server version skew when commands misbehave or the connection drops. For scene contents or node properties, use godot_node_read instead.

### Actions

#### `get_info`

Get project name, path, version, and main scene

*No parameters.*

#### `get_settings`

Get project settings

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Settings category to filter by (use "input" for input mappings) |
| `include_builtin` | boolean | No | Include built-in ui_* actions (with category="input") |

#### `addon_status`

Check addon/server version compatibility

*No parameters.*

#### `check_stale`

Check whether project.godot was edited on disk after the editor loaded it, leaving the editor with stale autoloads / input map (and phantom "Identifier not found" errors in its log that do not exist at runtime). Returns the disk-vs-editor divergence; run godot_editor_edit restart to reload. Useful right after editing project.godot as a file.

*No parameters.*

### Examples

```json
// get_info
{
  "action": "get_info"
}
```

```json
// get_settings
{
  "action": "get_settings"
}
```

```json
// addon_status
{
  "action": "addon_status"
}
```

*1 more actions available: `check_stale`*

---

