# Scene3D Tools

3D spatial information and bounding box tools

## Tools

- [scene3d](#scene3d)

---

## scene3d

Get spatial information for 3D nodes: global transforms, bounding boxes, visibility. Use get_spatial_info for node details, get_bounds for combined AABB of a subtree.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_spatial_info`, `get_bounds` | Yes | Action: get_spatial_info (node spatial data), get_bounds (combined AABB) |
| `node_path` | string | No | Path to the Node3D (required for get_spatial_info) |
| `root_path` | string | No | Path to search root (get_bounds only, defaults to scene root) |
| `include_children` | boolean | get_spatial_info | Include child nodes |
| `type_filter` | string | get_spatial_info | Filter by node type, e.g. "MeshInstance3D" |
| `max_results` | integer | get_spatial_info | Limit number of results. Defaults to 50 when include_children=true. Set higher (e.g., 500) if needed. |
| `within_aabb` | object {position, size} | get_spatial_info | Only include nodes whose global position is within this AABB |

### Actions

#### `get_spatial_info`

Parameters: `include_children`*, `type_filter`*, `max_results`*, `within_aabb`*

#### `get_bounds`

### Examples

```json
// get_spatial_info
{
  "action": "get_spatial_info",
  "include_children": false,
  "type_filter": "example",
  "max_results": null,
  "within_aabb": {}
}
```

```json
// get_bounds
{
  "action": "get_bounds",
  "root_path": "/root/Main"
}
```

---

