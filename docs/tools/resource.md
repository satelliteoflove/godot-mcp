# Resource Tools

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

## Tools

- [resource](#resource)

---

## resource

Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_info` | Yes | Action: get_info |
| `resource_path` | string | No | Resource path (e.g., "res://player/sprites.tres") (get_info) |
| `max_depth` | number | No | Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources (get_info) |
| `include_internal` | boolean | No | Include internal properties starting with underscore (get_info, default: false) |

---

