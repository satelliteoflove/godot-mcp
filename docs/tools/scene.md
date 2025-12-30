# Scene Tools

Scene management tools

## Tools

- [scene](#scene)

---

## scene

Manage scenes: open, save, or create scenes

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `open`, `save`, `create` | Yes | Action: open, save, create |
| `scene_path` | string | open, create; optional for: save | Path to scene file |
| `root_type` | string | create | Type of root node, e.g. "Node2D" |
| `root_name` | string | No | Name of root node (create only, defaults to root_type) |

### Actions

#### `open`

Parameters: `scene_path`*

#### `save`

Parameters: `scene_path`*

#### `create`

Parameters: `root_type`*

### Examples

```json
// open
{
  "action": "open",
  "scene_path": "res://scenes/enemy.tscn"
}
```

```json
// save
{
  "action": "save",
  "scene_path": "res://scenes/enemy.tscn"
}
```

```json
// create
{
  "action": "create",
  "scene_path": "res://scenes/enemy.tscn",
  "root_type": "example",
  "root_name": "example"
}
```

---

