# Scene Tools

Scene management tools

## Tools

- [godot_scene](#godot_scene)

---

## godot_scene

Manage scenes in the editor: open a scene, or save the open scene. To create a new scene, write the .tscn file directly — header [gd_scene format=3] without a uid (the editor assigns one when it imports the file), then one [node name="X" type="Node2D"] block per node — and open it with this tool.

### Actions

#### `open`

Open a scene file

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | Yes | Path to scene file to open |

#### `save`

Save the current scene

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Path to save to (defaults to the current scene path) |

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

---

