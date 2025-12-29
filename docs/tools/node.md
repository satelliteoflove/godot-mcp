# Node Tools

Node manipulation and script attachment tools

## Tools

- [node](#node)

---

## node

Manage scene nodes: get properties, create, update, delete, reparent, attach/detach scripts

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum (7 values) | Yes | Action: get_properties, create, update, delete, reparent, attach_script, detach_script |
| `node_path` | string | No | Path to the node (required for: get_properties, update, delete, reparent, attach_script, detach_script) |
| `parent_path` | string | No | Path to the parent node (create only) |
| `node_type` | string | No | Type of node to create, e.g. "Sprite2D" (create only, use this OR scene_path) |
| `scene_path` | string | No | Path to scene to instantiate, e.g. "res://enemies/goblin.tscn" (create only, use this OR node_type) |
| `node_name` | string | No | Name for the new node (create only) |
| `properties` | object | No | Properties to set (create, update) |
| `new_parent_path` | string | No | Path to the new parent node (reparent only) |
| `script_path` | string | No | Path to the script file (attach_script only) |

---

