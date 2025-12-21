# Scene Tools

Scene management tools

## Tools

- [get_scene_tree](#get_scene_tree)
- [open_scene](#open_scene)
- [save_scene](#save_scene)
- [create_scene](#create_scene)

---

## get_scene_tree

Get the full hierarchy of nodes in the currently open scene

### Parameters

*No parameters required.*

---

## open_scene

Open a scene file in the editor

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | Yes | Path to the scene file (e.g., "res://scenes/main.tscn") |

---

## save_scene

Save the currently open scene

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | No | Optional path to save as (defaults to current scene path) |

---

## create_scene

Create a new scene with a root node

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_type` | string | Yes | Type of the root node (e.g., "Node2D", "Node3D", "Control") |
| `root_name` | string | No | Name of the root node |
| `scene_path` | string | Yes | Path to save the scene (e.g., "res://scenes/new_scene.tscn") |

---

