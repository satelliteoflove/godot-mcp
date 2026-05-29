# TileMapLayer/GridMap Tools

TileMapLayer and GridMap editing tools (uses Godot 4.3+ TileMapLayer, not deprecated TileMap)

## Tools

- [godot_tilemap](#godot_tilemap)
- [godot_gridmap](#godot_gridmap)

---

## godot_tilemap

Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates

### Actions

#### `list_layers`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Starting node path (defaults to scene root) |

#### `get_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_tileset_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_used_cells`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |

#### `get_cells_in_region`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `min_coords` | object {x, y} | Yes | Minimum corner of region |
| `max_coords` | object {x, y} | Yes | Maximum corner of region |

#### `convert_coords`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `local_position` | object {x, y} | No | Local position to convert to map coords |
| `map_coords` | object {x, y} | No | Map coordinates to convert to local position |

#### `set_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |
| `source_id` | integer | No | TileSet source ID, default 0 |
| `atlas_coords` | object {x, y} | No | Atlas coordinates, default 0,0 |
| `alternative_tile` | integer | No | Alternative tile ID, default 0 |

#### `erase_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |

#### `clear_layer`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `set_cells_batch`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `cells` | object[] | Yes | Array of cells to set |

### Examples

```json
// list_layers
{
  "action": "list_layers"
}
```

```json
// get_info
{
  "action": "get_info",
  "node_path": "/root/Main/Player"
}
```

```json
// get_tileset_info
{
  "action": "get_tileset_info",
  "node_path": "/root/Main/Player"
}
```

*8 more actions available: `get_used_cells`, `get_cell`, `get_cells_in_region`, `convert_coords`, `set_cell`, `erase_cell`, `clear_layer`, `set_cells_batch`*

---

## godot_gridmap

Query and edit GridMap data: list gridmaps, get info, get/set cells

### Actions

#### `list`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Starting node path (defaults to scene root) |

#### `get_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_meshlib_info`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_used_cells`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |

#### `get_cells_by_item`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `item` | integer | Yes | MeshLibrary item index |

#### `set_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |
| `item` | integer | Yes | MeshLibrary item index |
| `orientation` | integer | No | Orientation 0-23, default 0 |

#### `clear_cell`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |

#### `clear`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `set_cells_batch`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `cells` | object[] | Yes | Array of cells to set |

### Examples

```json
// list
{
  "action": "list"
}
```

```json
// get_info
{
  "action": "get_info",
  "node_path": "/root/Main/Player"
}
```

```json
// get_meshlib_info
{
  "action": "get_meshlib_info",
  "node_path": "/root/Main/Player"
}
```

*7 more actions available: `get_used_cells`, `get_cell`, `get_cells_by_item`, `set_cell`, `clear_cell`, `clear`, `set_cells_batch`*

---

