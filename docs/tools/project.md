# Project Tools

Project information tools

## Tools

- [project](#project)

---

## project

Get project information and settings

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_info`, `get_settings`, `addon_status` | Yes | Action: get_info, get_settings, addon_status (check addon/server version compatibility) |
| `category` | string | No | Settings category to filter by (get_settings only, use "input" for input mappings) |
| `include_builtin` | boolean | get_settings with category="input" | Include built-in ui_* actions |

### Actions

#### `get_info`

#### `get_settings`

Parameters: `include_builtin`*

#### `addon_status`

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
  "action": "get_settings",
  "category": "example"
}
```

```json
// addon_status
{
  "action": "addon_status"
}
```

---

