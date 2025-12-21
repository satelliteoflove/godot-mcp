import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const Vector2iSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

const Vector3iSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  z: z.number().int(),
});

export const listTilemapLayers = defineTool({
  name: 'list_tilemap_layers',
  description: 'Find all TileMapLayer nodes in the scene',
  schema: z.object({
    root_path: z
      .string()
      .optional()
      .describe('Starting node path, defaults to scene root'),
  }),
  async execute({ root_path }, { godot }) {
    const result = await godot.sendCommand<{
      tilemap_layers: Array<{ path: string; name: string }>;
    }>('list_tilemap_layers', { root_path });

    if (result.tilemap_layers.length === 0) {
      return 'No TileMapLayer nodes found in scene';
    }
    return `Found ${result.tilemap_layers.length} TileMapLayer(s):\n${result.tilemap_layers.map((l) => `  - ${l.path}`).join('\n')}`;
  },
});

export const getTilemapLayerInfo = defineTool({
  name: 'get_tilemap_layer_info',
  description: 'Get TileMapLayer properties (tileset, enabled, etc.)',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      name: string;
      enabled: boolean;
      tileset_path: string;
      cell_quadrant_size: number;
      collision_enabled: boolean;
      used_cells_count: number;
    }>('get_tilemap_layer_info', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getTilesetInfo = defineTool({
  name: 'get_tileset_info',
  description: 'Get TileSet sources and atlas information',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      tileset_path: string;
      tile_size: { x: number; y: number };
      source_count: number;
      sources: Array<{
        source_id: number;
        source_type: string;
        texture_path?: string;
        texture_region_size?: { x: number; y: number };
        tile_count?: number;
        scene_count?: number;
      }>;
    }>('get_tileset_info', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getUsedCells = defineTool({
  name: 'get_used_cells',
  description: 'Get all non-empty cell coordinates in a TileMapLayer',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      cells: Array<{ x: number; y: number }>;
      count: number;
    }>('get_used_cells', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getCell = defineTool({
  name: 'get_cell',
  description: 'Get cell data (source_id, atlas_coords, alternative_tile)',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    coords: Vector2iSchema.describe('Cell coordinates'),
  }),
  async execute({ node_path, coords }, { godot }) {
    const result = await godot.sendCommand<{
      coords: { x: number; y: number };
      empty: boolean;
      source_id?: number;
      atlas_coords?: { x: number; y: number };
      alternative_tile?: number;
    }>('get_cell', { node_path, coords });

    return JSON.stringify(result, null, 2);
  },
});

export const setCell = defineTool({
  name: 'set_cell',
  description: 'Set a cell with tile data',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    coords: Vector2iSchema.describe('Cell coordinates'),
    source_id: z.number().int().optional().describe('TileSet source ID (default 0)'),
    atlas_coords: Vector2iSchema.optional().describe('Atlas coordinates (default 0,0)'),
    alternative_tile: z
      .number()
      .int()
      .optional()
      .describe('Alternative tile ID (default 0)'),
  }),
  async execute(
    { node_path, coords, source_id, atlas_coords, alternative_tile },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      coords: { x: number; y: number };
      source_id: number;
      atlas_coords: { x: number; y: number };
      alternative_tile: number;
    }>('set_cell', {
      node_path,
      coords,
      source_id,
      atlas_coords,
      alternative_tile,
    });

    return `Set cell at (${result.coords.x}, ${result.coords.y}) with source ${result.source_id}, atlas (${result.atlas_coords.x}, ${result.atlas_coords.y})`;
  },
});

export const eraseCell = defineTool({
  name: 'erase_cell',
  description: 'Clear a single cell',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    coords: Vector2iSchema.describe('Cell coordinates to erase'),
  }),
  async execute({ node_path, coords }, { godot }) {
    const result = await godot.sendCommand<{
      erased: { x: number; y: number };
    }>('erase_cell', { node_path, coords });

    return `Erased cell at (${result.erased.x}, ${result.erased.y})`;
  },
});

export const clearLayer = defineTool({
  name: 'clear_layer',
  description: 'Clear all cells in a TileMapLayer',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      cleared: boolean;
      cells_removed: number;
    }>('clear_layer', { node_path });

    return `Cleared layer: ${result.cells_removed} cells removed`;
  },
});

export const getCellsInRegion = defineTool({
  name: 'get_cells_in_region',
  description: 'Get cells within a rectangular region',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    min_coords: Vector2iSchema.describe('Minimum corner of region'),
    max_coords: Vector2iSchema.describe('Maximum corner of region'),
  }),
  async execute({ node_path, min_coords, max_coords }, { godot }) {
    const result = await godot.sendCommand<{
      cells: Array<{
        coords: { x: number; y: number };
        source_id: number;
        atlas_coords: { x: number; y: number };
        alternative_tile: number;
      }>;
      count: number;
    }>('get_cells_in_region', { node_path, min_coords, max_coords });

    return JSON.stringify(result, null, 2);
  },
});

export const setCellsBatch = defineTool({
  name: 'set_cells_batch',
  description: 'Set multiple cells at once',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    cells: z
      .array(
        z.object({
          coords: Vector2iSchema,
          source_id: z.number().int().optional(),
          atlas_coords: Vector2iSchema.optional(),
          alternative_tile: z.number().int().optional(),
        })
      )
      .describe('Array of cells to set'),
  }),
  async execute({ node_path, cells }, { godot }) {
    const result = await godot.sendCommand<{ cells_set: number }>(
      'set_cells_batch',
      { node_path, cells }
    );

    return `Set ${result.cells_set} cells`;
  },
});

export const convertCoords = defineTool({
  name: 'convert_coords',
  description: 'Convert between local and map coordinates',
  schema: z.object({
    node_path: z.string().describe('Path to TileMapLayer node'),
    local_position: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe('Local position to convert to map coords'),
    map_coords: Vector2iSchema.optional().describe(
      'Map coordinates to convert to local position'
    ),
  }),
  async execute({ node_path, local_position, map_coords }, { godot }) {
    const result = await godot.sendCommand<{
      direction: string;
      local_position?: { x: number; y: number };
      map_coords?: { x: number; y: number };
    }>('convert_coords', { node_path, local_position, map_coords });

    return JSON.stringify(result, null, 2);
  },
});

export const listGridmaps = defineTool({
  name: 'list_gridmaps',
  description: 'Find all GridMap nodes in the scene',
  schema: z.object({
    root_path: z
      .string()
      .optional()
      .describe('Starting node path, defaults to scene root'),
  }),
  async execute({ root_path }, { godot }) {
    const result = await godot.sendCommand<{
      gridmaps: Array<{ path: string; name: string }>;
    }>('list_gridmaps', { root_path });

    if (result.gridmaps.length === 0) {
      return 'No GridMap nodes found in scene';
    }
    return `Found ${result.gridmaps.length} GridMap(s):\n${result.gridmaps.map((g) => `  - ${g.path}`).join('\n')}`;
  },
});

export const getGridmapInfo = defineTool({
  name: 'get_gridmap_info',
  description: 'Get GridMap properties (mesh_library, cell_size, etc.)',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      name: string;
      mesh_library_path: string;
      cell_size: { x: number; y: number; z: number };
      cell_center_x: boolean;
      cell_center_y: boolean;
      cell_center_z: boolean;
      used_cells_count: number;
    }>('get_gridmap_info', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getMeshlibInfo = defineTool({
  name: 'get_meshlib_info',
  description: 'Get MeshLibrary item names and indices',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      mesh_library_path: string;
      item_count: number;
      items: Array<{
        index: number;
        name: string;
        mesh_path: string;
      }>;
    }>('get_meshlib_info', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getGridmapUsedCells = defineTool({
  name: 'get_gridmap_used_cells',
  description: 'Get all non-empty cell coordinates in a GridMap',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      cells: Array<{ x: number; y: number; z: number }>;
      count: number;
    }>('get_gridmap_used_cells', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getGridmapCell = defineTool({
  name: 'get_gridmap_cell',
  description: 'Get cell data (item index, orientation)',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
    coords: Vector3iSchema.describe('Cell coordinates'),
  }),
  async execute({ node_path, coords }, { godot }) {
    const result = await godot.sendCommand<{
      coords: { x: number; y: number; z: number };
      empty: boolean;
      item?: number;
      item_name?: string;
      orientation?: number;
    }>('get_gridmap_cell', { node_path, coords });

    return JSON.stringify(result, null, 2);
  },
});

export const setGridmapCell = defineTool({
  name: 'set_gridmap_cell',
  description: 'Set a cell with an item',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
    coords: Vector3iSchema.describe('Cell coordinates'),
    item: z.number().int().describe('MeshLibrary item index'),
    orientation: z
      .number()
      .int()
      .optional()
      .describe('Orientation (0-23, default 0)'),
  }),
  async execute({ node_path, coords, item, orientation }, { godot }) {
    const result = await godot.sendCommand<{
      coords: { x: number; y: number; z: number };
      item: number;
      orientation: number;
    }>('set_gridmap_cell', { node_path, coords, item, orientation });

    return `Set cell at (${result.coords.x}, ${result.coords.y}, ${result.coords.z}) with item ${result.item}, orientation ${result.orientation}`;
  },
});

export const clearGridmapCell = defineTool({
  name: 'clear_gridmap_cell',
  description: 'Clear a single cell',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
    coords: Vector3iSchema.describe('Cell coordinates to clear'),
  }),
  async execute({ node_path, coords }, { godot }) {
    const result = await godot.sendCommand<{
      cleared: { x: number; y: number; z: number };
    }>('clear_gridmap_cell', { node_path, coords });

    return `Cleared cell at (${result.cleared.x}, ${result.cleared.y}, ${result.cleared.z})`;
  },
});

export const clearGridmap = defineTool({
  name: 'clear_gridmap',
  description: 'Clear all cells in a GridMap',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      cleared: boolean;
      cells_removed: number;
    }>('clear_gridmap', { node_path });

    return `Cleared GridMap: ${result.cells_removed} cells removed`;
  },
});

export const getCellsByItem = defineTool({
  name: 'get_cells_by_item',
  description: 'Get all cells containing a specific item',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
    item: z.number().int().describe('MeshLibrary item index to search for'),
  }),
  async execute({ node_path, item }, { godot }) {
    const result = await godot.sendCommand<{
      item: number;
      cells: Array<{ x: number; y: number; z: number }>;
      count: number;
    }>('get_cells_by_item', { node_path, item });

    return JSON.stringify(result, null, 2);
  },
});

export const setGridmapCellsBatch = defineTool({
  name: 'set_gridmap_cells_batch',
  description: 'Set multiple cells at once',
  schema: z.object({
    node_path: z.string().describe('Path to GridMap node'),
    cells: z
      .array(
        z.object({
          coords: Vector3iSchema,
          item: z.number().int(),
          orientation: z.number().int().optional(),
        })
      )
      .describe('Array of cells to set'),
  }),
  async execute({ node_path, cells }, { godot }) {
    const result = await godot.sendCommand<{ cells_set: number }>(
      'set_gridmap_cells_batch',
      { node_path, cells }
    );

    return `Set ${result.cells_set} cells`;
  },
});

export const tilemapTools = [
  listTilemapLayers,
  getTilemapLayerInfo,
  getTilesetInfo,
  getUsedCells,
  getCell,
  setCell,
  eraseCell,
  clearLayer,
  getCellsInRegion,
  setCellsBatch,
  convertCoords,
  listGridmaps,
  getGridmapInfo,
  getMeshlibInfo,
  getGridmapUsedCells,
  getGridmapCell,
  setGridmapCell,
  clearGridmapCell,
  clearGridmap,
  getCellsByItem,
  setGridmapCellsBatch,
] as AnyToolDefinition[];
