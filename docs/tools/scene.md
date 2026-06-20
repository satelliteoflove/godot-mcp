# Scene Tools

Scene management tools

## Tools

- [godot_scene](#godot_scene)

---

## godot_scene

Manage scenes in the editor: open a scene, save the open scene, or reload an open scene from disk after you edit its .tscn directly (so the editor picks up the change without a full restart). To create a new scene, write the .tscn file directly — header [gd_scene format=3] without a uid (the editor assigns one when it imports the file), then one [node name="X" type="Node2D"] block per node — and open it with this tool.

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

#### `reload`

Reload an open scene from disk, discarding the editor's unsaved in-memory copy. Use after editing a .tscn file directly to refresh the editor without a full restart; the scene must already be open.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Path of the open scene to reload (defaults to the current scene) |

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
// reload
{
  "action": "reload"
}
```

---

