# Resource Tools

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

## Tools

- [get_resource_info](#get_resource_info)

---

## get_resource_info

Load and inspect any Godot Resource by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc. Falls back to generic property inspection for unknown types.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource_path` | string | Yes | Resource path (e.g., "res://player/sprites.tres") |
| `max_depth` | number | No | Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources |
| `include_internal` | boolean | No | Include internal properties starting with underscore (default: false) |

---

