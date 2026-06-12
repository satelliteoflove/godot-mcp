# TileMapLayer/GridMap Tools

TileMapLayer and GridMap editing tools (uses Godot 4.3+ TileMapLayer, not deprecated TileMap)

## Tools

- [godot_tilemap_read](#godot_tilemap_read)
- [godot_tilemap_edit](#godot_tilemap_edit)
- [godot_gridmap_read](#godot_gridmap_read)
- [godot_gridmap_edit](#godot_gridmap_edit)

---

## godot_tilemap_read

Inspect TileMapLayer data in the open scene: list layers, get layer and TileSet info, read used cells, a single cell, or a rectangular region, and convert between local positions and map coordinates. Use it whenever you need to know what tiles are placed where; cell data is stored base64-encoded in the .tscn, so reading the file is not an alternative. To place, erase, or clear tiles, use godot_tilemap_edit instead.

### Actions

#### `list_layers`

List TileMapLayer nodes in the scene

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Starting node path (defaults to scene root) |

#### `get_info`

Get TileMapLayer info

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_tileset_info`

Get the layer's TileSet info

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_used_cells`

Get all used cells

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `get_cell`

Get a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |

#### `get_cells_in_region`

Get cells within a rectangular region

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `min_coords` | object {x, y} | Yes | Minimum corner of region |
| `max_coords` | object {x, y} | Yes | Maximum corner of region |

#### `convert_coords`

Convert between local position and map coordinates

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `local_position` | object {x, y} | No | Local position to convert to map coords |
| `map_coords` | object {x, y} | No | Map coordinates to convert to local position |

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

*4 more actions available: `get_used_cells`, `get_cell`, `get_cells_in_region`, `convert_coords`*

---

## godot_tilemap_edit

Modify TileMapLayer cells in the open scene: set a single cell, erase a cell, clear a whole layer, or set many cells in one batch. Use it to paint or remove tiles; cell data is stored base64-encoded in the .tscn, so editing the file is not an alternative, and set_cells_batch beats repeated set_cell calls for anything beyond a few tiles. To inspect layers, TileSets, or existing cells without changing anything, use godot_tilemap_read.

### Actions

#### `set_cell`

Set a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |
| `source_id` | integer | No | TileSet source ID, default 0 |
| `atlas_coords` | object {x, y} | No | Atlas coordinates, default 0,0 |
| `alternative_tile` | integer | No | Alternative tile ID, default 0 |

#### `erase_cell`

Erase a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `coords` | object {x, y} | Yes | Cell coordinates |

#### `clear_layer`

Clear all cells in the layer

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |

#### `set_cells_batch`

Set many cells at once

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the TileMapLayer |
| `cells` | object[] | Yes | Array of cells to set |

### Examples

```json
// set_cell
{
  "action": "set_cell",
  "node_path": "/root/Main/Player",
  "coords": {
    "x": -9007199254740991,
    "y": -9007199254740991
  }
}
```

```json
// erase_cell
{
  "action": "erase_cell",
  "node_path": "/root/Main/Player",
  "coords": {
    "x": -9007199254740991,
    "y": -9007199254740991
  }
}
```

```json
// clear_layer
{
  "action": "clear_layer",
  "node_path": "/root/Main/Player"
}
```

*1 more actions available: `set_cells_batch`*

---

## godot_gridmap_read

Inspect GridMap data in the open scene: list GridMap nodes, get map and MeshLibrary info, and read used cells, a single cell, or every cell using a given item. Use it whenever you need to know which mesh items occupy which 3D grid cells; cell data is stored base64-encoded in the .tscn, so reading the file is not an alternative. To place or clear cells, use godot_gridmap_edit instead.

### Actions

#### `list`

List GridMap nodes in the scene

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Starting node path (defaults to scene root) |

#### `get_info`

Get GridMap info

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_meshlib_info`

Get the GridMap's MeshLibrary info

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_used_cells`

Get all used cells

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `get_cell`

Get a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |

#### `get_cells_by_item`

Get all cells using a given MeshLibrary item

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `item` | integer | Yes | MeshLibrary item index |

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

*3 more actions available: `get_used_cells`, `get_cell`, `get_cells_by_item`*

---

## godot_gridmap_edit

Modify GridMap cells in the open scene: set a single cell to a MeshLibrary item with an orientation, clear a cell, clear the whole map, or set many cells in one batch. Use it to build or remove 3D grid content; cell data is stored base64-encoded in the .tscn, so editing the file is not an alternative, and set_cells_batch beats repeated set_cell calls for anything beyond a few cells. To inspect the map, its MeshLibrary, or existing cells without changing anything, use godot_gridmap_read.

### Actions

#### `set_cell`

Set a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |
| `item` | integer | Yes | MeshLibrary item index |
| `orientation` | integer | No | Orientation 0-23, default 0 |

#### `clear_cell`

Clear a single cell

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `coords` | object {x, y, z} | Yes | Cell coordinates |

#### `clear`

Clear all cells

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |

#### `set_cells_batch`

Set many cells at once

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the GridMap |
| `cells` | object[] | Yes | Array of cells to set |

### Examples

```json
// set_cell
{
  "action": "set_cell",
  "node_path": "/root/Main/Player",
  "coords": {
    "x": -9007199254740991,
    "y": -9007199254740991,
    "z": -9007199254740991
  },
  "item": -9007199254740991
}
```

```json
// clear_cell
{
  "action": "clear_cell",
  "node_path": "/root/Main/Player",
  "coords": {
    "x": -9007199254740991,
    "y": -9007199254740991,
    "z": -9007199254740991
  }
}
```

```json
// clear
{
  "action": "clear",
  "node_path": "/root/Main/Player"
}
```

*1 more actions available: `set_cells_batch`*

---

