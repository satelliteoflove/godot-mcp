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
| `action` | enum (11 values) | Yes | Action: list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords, set_cell, erase_cell, clear_layer, set_cells_batch |
| `root_path` | string | No | Starting node path (list_layers only) |
| `node_path` | string | No | Path to TileMapLayer (required except list_layers) |
| `coords` | object | No | Cell coordinates (get_cell, set_cell, erase_cell) |
| `min_coords` | object | No | Minimum corner of region (get_cells_in_region) |
| `max_coords` | object | No | Maximum corner of region (get_cells_in_region) |
| `local_position` | object | No | Local position to convert to map coords (convert_coords) |
| `map_coords` | object | No | Map coordinates to convert to local position (convert_coords) |
| `source_id` | integer | No | TileSet source ID, default 0 (set_cell) |
| `atlas_coords` | object | No | Atlas coordinates, default 0,0 (set_cell) |
| `alternative_tile` | integer | No | Alternative tile ID, default 0 (set_cell) |
| `cells` | object[] | No | Array of cells to set (set_cells_batch) |

---

## gridmap

Query and edit GridMap data: list gridmaps, get info, get/set cells

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum (10 values) | Yes | Action: list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item, set_cell, clear_cell, clear, set_cells_batch |
| `root_path` | string | No | Starting node path (list only) |
| `node_path` | string | No | Path to GridMap (required except list) |
| `coords` | object | No | Cell coordinates (get_cell, set_cell, clear_cell) |
| `item` | integer | No | MeshLibrary item index (get_cells_by_item, set_cell) |
| `orientation` | integer | No | Orientation 0-23, default 0 (set_cell) |
| `cells` | object[] | No | Array of cells to set (set_cells_batch) |

---

