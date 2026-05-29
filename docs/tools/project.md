# Project Tools

Project information tools

## Tools

- [godot_project](#godot_project)

---

## godot_project

Get project information and settings

### Actions

#### `get_info`

*No parameters.*

#### `get_settings`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `category` | string | No | Settings category to filter by (use "input" for input mappings) |
| `include_builtin` | boolean | No | Include built-in ui_* actions (with category="input") |

#### `addon_status`

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

---

