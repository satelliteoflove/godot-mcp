# Scene3D Tools

3D spatial information and bounding box tools

## Tools

- [godot_scene3d](#godot_scene3d)

---

## godot_scene3d

Read engine-computed 3D spatial data that cannot be derived from .tscn text: global transforms resolved through the parent chain, mesh AABBs, combined subtree bounds, and visibility. Use get_spatial_info for one Node3D or a filtered set of its children (by type or world-space region); use get_bounds for the combined AABB of a subtree. Read-only: to change transforms or other properties, use godot_node_edit.

### Actions

#### `get_spatial_info`

Get spatial data for a Node3D and optionally its children

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the Node3D |
| `include_children` | boolean | No | Include child nodes |
| `type_filter` | string | No | Filter by node type, e.g. "MeshInstance3D" |
| `max_results` | integer | No | Limit number of results. Defaults to 50 when include_children=true. Set higher (e.g., 500) if needed. |
| `within_aabb` | object {position, size} | No | Only include nodes whose global position is within this AABB |

#### `get_bounds`

Get the combined AABB of a subtree

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Path to search root (defaults to scene root) |

### Examples

```json
// get_spatial_info
{
  "action": "get_spatial_info",
  "node_path": "/root/Main/Player"
}
```

```json
// get_bounds
{
  "action": "get_bounds"
}
```

---

