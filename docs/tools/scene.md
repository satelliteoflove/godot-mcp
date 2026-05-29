# Scene Tools

Scene management tools

## Tools

- [godot_scene](#godot_scene)

---

## godot_scene

Manage scenes: open, save, or create scenes

### Actions

#### `open`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | Yes | Path to scene file to open |

#### `save`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Path to save to (defaults to the current scene path) |

#### `create`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | Yes | Path for the new scene file |
| `root_type` | string | Yes | Type of root node, e.g. "Node2D" |
| `root_name` | string | No | Name of root node (defaults to root_type) |

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
  "action": "save"
}
```

```json
// create
{
  "action": "create",
  "scene_path": "res://scenes/enemy.tscn",
  "root_type": "example"
}
```

---

