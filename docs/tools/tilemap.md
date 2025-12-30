# TileMap/GridMap Tools

TileMap and GridMap editing tools

## Tools

- [tilemap](#tilemap)
- [gridmap](#gridmap)

---

## tilemap

Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `list_layers`, `get_info`, `get_tileset_info`, `get_used_cells`, `get_cell`, `get_cells_in_region`, `convert_coords`, `set_cell`, `erase_cell`, `clear_layer`, `set_cells_batch` | Yes | Action: list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords, set_cell, erase_cell, clear_layer, set_cells_batch |
| `root_path` | string | list_layers | Starting node path |
| `node_path` | string | No | Path to TileMapLayer (required except list_layers) |
| `coords` | object {x, y} | get_cell, set_cell, erase_cell | Cell coordinates |
| `min_coords` | object {x, y} | No | Minimum corner of region (get_cells_in_region) |
| `max_coords` | object {x, y} | No | Maximum corner of region (get_cells_in_region) |
| `local_position` | object {x, y} | No | Local position to convert to map coords (convert_coords) |
| `map_coords` | object {x, y} | No | Map coordinates to convert to local position (convert_coords) |
| `source_id` | integer | No | TileSet source ID, default 0 (set_cell) |
| `atlas_coords` | object {x, y} | No | Atlas coordinates, default 0,0 (set_cell) |
| `alternative_tile` | integer | No | Alternative tile ID, default 0 (set_cell) |
| `cells` | object[] | No | Array of cells to set (set_cells_batch) |

### Actions

#### `list_layers`

Parameters: `root_path`*

#### `get_info`

#### `get_tileset_info`

#### `get_used_cells`

#### `get_cell`

Parameters: `coords`

#### `get_cells_in_region`

#### `convert_coords`

#### `set_cell`

Parameters: `coords`

#### `erase_cell`

Parameters: `coords`

#### `clear_layer`

#### `set_cells_batch`

### Examples

```json
// list_layers
{
  "action": "list_layers",
  "root_path": "/root/Main"
}
```

```json
// get_info
{
  "action": "get_info"
}
```

```json
// get_tileset_info
{
  "action": "get_tileset_info"
}
```

*8 more actions available: `get_used_cells`, `get_cell`, `get_cells_in_region`, `convert_coords`, `set_cell`, `erase_cell`, `clear_layer`, `set_cells_batch`*

---

## gridmap

Query and edit GridMap data: list gridmaps, get info, get/set cells

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `list`, `get_info`, `get_meshlib_info`, `get_used_cells`, `get_cell`, `get_cells_by_item`, `set_cell`, `clear_cell`, `clear`, `set_cells_batch` | Yes | Action: list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item, set_cell, clear_cell, clear, set_cells_batch |
| `root_path` | string | list | Starting node path |
| `node_path` | string | No | Path to GridMap (required except list) |
| `coords` | object {x, y, z} | get_cell, set_cell, clear_cell | Cell coordinates |
| `item` | integer | get_cells_by_item, set_cell | MeshLibrary item index |
| `orientation` | integer | No | Orientation 0-23, default 0 (set_cell) |
| `cells` | object[] | No | Array of cells to set (set_cells_batch) |

### Actions

#### `list`

Parameters: `root_path`*

#### `get_info`

#### `get_meshlib_info`

#### `get_used_cells`

#### `get_cell`

Parameters: `coords`

#### `get_cells_by_item`

Parameters: `item`

#### `set_cell`

Parameters: `coords`, `item`

#### `clear_cell`

Parameters: `coords`

#### `clear`

#### `set_cells_batch`

### Examples

```json
// list
{
  "action": "list",
  "root_path": "/root/Main"
}
```

```json
// get_info
{
  "action": "get_info"
}
```

```json
// get_meshlib_info
{
  "action": "get_meshlib_info"
}
```

*7 more actions available: `get_used_cells`, `get_cell`, `get_cells_by_item`, `set_cell`, `clear_cell`, `clear`, `set_cells_batch`*

---

