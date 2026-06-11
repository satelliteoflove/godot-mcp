# Documentation Tools

Fetch Godot Engine documentation with smart extraction

## Tools

- [godot_docs](#godot_docs)

---

## godot_docs

Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.

### Actions

#### `fetch_class`

Get a class reference by name

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `class_name` | string | Yes | Class name to fetch, e.g. "CharacterBody2D" |
| `version` | `stable`, `latest`, `4.5`, `4.4`, `4.3`, `4.2` | No | Godot docs version. If omitted, auto-detects from connected Godot editor or defaults to "stable" |
| `section` | `full`, `description`, `properties`, `methods`, `signals` | Yes | Which section to return (default: full). Use specific sections to reduce token usage. |

#### `fetch_page`

Get any docs page by path

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | Yes | Documentation path, e.g. "/tutorials/2d/2d_movement.html" |
| `version` | `stable`, `latest`, `4.5`, `4.4`, `4.3`, `4.2` | No | Godot docs version. If omitted, auto-detects from connected Godot editor or defaults to "stable" |
| `section` | `full`, `description`, `properties`, `methods`, `signals` | Yes | Which section to return (default: full). Use specific sections to reduce token usage. |

### Examples

```json
// fetch_class
{
  "action": "fetch_class",
  "class_name": "example",
  "section": "full"
}
```

```json
// fetch_page
{
  "action": "fetch_page",
  "path": "/root/Main/Player",
  "section": "full"
}
```

---

