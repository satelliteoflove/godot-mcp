# Scene Tools

Scene management tools

## Tools

- [scene](#scene)

---

## scene

Manage scenes: get tree hierarchy, open, save, or create scenes

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_tree`, `open`, `save`, `create` | Yes | Action: get_tree, open, save, create |
| `scene_path` | string | No | Path to scene file (required for: open, create; optional for: save) |
| `root_type` | string | No | Type of root node, e.g. "Node2D" (create only) |
| `root_name` | string | No | Name of root node (create only, defaults to root_type) |

---

