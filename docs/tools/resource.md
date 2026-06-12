# Resource Tools

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

## Tools

- [godot_resource](#godot_resource)

---

## godot_resource

Inspect a Resource file by path with type-aware structured output (SpriteFrames animations, TileSet, Material, Texture2D, etc.). Use it for imported or binary resources (.res, .scn, compressed textures) that a plain file read cannot parse, or when you want sub-resources resolved into the engine's view rather than raw .tres text. For nodes inside a scene, use godot_node_read instead.

### Actions

#### `get_info`

Inspect a Resource file by path

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

