# Documentation Tools

Fetch Godot Engine documentation with smart extraction

## Tools

- [godot_docs](#godot_docs)

---

## godot_docs

Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `fetch_class`, `fetch_page` | Yes | Action: fetch_class (get class reference by name), fetch_page (get any docs page by path) |
| `class_name` | string | fetch_class | Class name to fetch, e.g. "CharacterBody2D" |
| `path` | string | fetch_page | Documentation path, e.g. "/tutorials/2d/2d_movement.html" |
| `version` | `stable`, `latest`, `4.5`, `4.4`, `4.3`, `4.2` | No | Godot docs version. If omitted, auto-detects from connected Godot editor or defaults to "stable" |
| `section` | `full`, `description`, `properties`, `methods`, `signals` | No | Which section to return (default: full). Use specific sections to reduce token usage. |

### Actions

#### `fetch_class`

Parameters: `class_name`*

#### `fetch_page`

Parameters: `path`*

### Examples

```json
// fetch_class
{
  "action": "fetch_class",
  "class_name": "example"
}
```

```json
// fetch_page
{
  "action": "fetch_page",
  "path": "example"
}
```

---

