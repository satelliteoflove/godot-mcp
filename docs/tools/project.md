# Project Tools

Project information tools

## Tools

- [godot_project](#godot_project)

---

## godot_project

Get project information and settings

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_info`, `get_settings`, `addon_status`, `check_stale` | Yes |  |
| `category` | string | No | Settings category to filter by (use "input" for input mappings) |
| `include_builtin` | boolean | No | Include built-in ui_* actions (with category="input") |

### Actions

#### `get_info`

#### `get_settings`

#### `addon_status`

#### `check_stale`

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

