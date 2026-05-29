# Resource Tools

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

## Tools

- [godot_resource](#godot_resource)

---

## godot_resource

Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.

### Actions

#### `get_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `resource_path` | string | Yes | Resource path (e.g., "res://player/sprites.tres") |
| `max_depth` | number | No | Detail level: 0 = summary only, 1 = full detail (default), 2+ = expand sub-resources |
| `include_internal` | boolean | No | Include internal properties starting with underscore (default: false) |

### Examples

```json
// get_info
{
  "action": "get_info",
  "resource_path": "res://resources/spriteframes.tres"
}
```

---

