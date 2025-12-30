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

const TilemapSchema = z
  .object({
    action: z
      .enum([
        'list_layers',
        'get_info',
        'get_tileset_info',
        'get_used_cells',
        'get_cell',
        'get_cells_in_region',
        'convert_coords',
        'set_cell',
        'erase_cell',
        'clear_layer',
        'set_cells_batch',
      ])
      .describe(
        'Action: list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords, set_cell, erase_cell, clear_layer, set_cells_batch'
      ),
    root_path: z.string().optional().describe('Starting node path (list_layers only)'),
    node_path: z.string().optional().describe('Path to TileMapLayer (required except list_layers)'),
    coords: Vector2iSchema.optional().describe('Cell coordinates (get_cell, set_cell, erase_cell)'),
    min_coords: Vector2iSchema.optional().describe('Minimum corner of region (get_cells_in_region)'),
    max_coords: Vector2iSchema.optional().describe('Maximum corner of region (get_cells_in_region)'),
    local_position: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe('Local position to convert to map coords (convert_coords)'),
    map_coords: Vector2iSchema.optional().describe('Map coordinates to convert to local position (convert_coords)'),
    source_id: z.number().int().optional().describe('TileSet source ID, default 0 (set_cell)'),
    atlas_coords: Vector2iSchema.optional().describe('Atlas coordinates, default 0,0 (set_cell)'),
    alternative_tile: z.number().int().optional().describe('Alternative tile ID, default 0 (set_cell)'),
    cells: z
      .array(
        z.object({
          coords: Vector2iSchema,
          source_id: z.number().int().optional(),
          atlas_coords: Vector2iSchema.optional(),
          alternative_tile: z.number().int().optional(),
        })
      )
      .optional()
      .describe('Array of cells to set (set_cells_batch)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'list_layers':
          return true;
        case 'get_info':
        case 'get_tileset_info':
        case 'get_used_cells':
        case 'convert_coords':
        case 'clear_layer':
          return !!data.node_path;
        case 'get_cell':
        case 'set_cell':
        case 'erase_cell':
          return !!data.node_path && !!data.coords;
        case 'get_cells_in_region':
          return !!data.node_path && !!data.min_coords && !!data.max_coords;
        case 'set_cells_batch':
          return !!data.node_path && !!data.cells && data.cells.length > 0;
        default:
          return false;
      }
    },
    { message: 'Missing required fields for action' }
  );

type TilemapArgs = z.infer<typeof TilemapSchema>;

export const tilemap = defineTool({
  name: 'tilemap',
  description:
    'Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates',
  schema: TilemapSchema,
  async execute(args: TilemapArgs, { godot }) {
    switch (args.action) {
      case 'list_layers': {
        const result = await godot.sendCommand<{
          tilemap_layers: Array<{ path: string; name: string }>;
        }>('list_tilemap_layers', { root_path: args.root_path });
        if (result.tilemap_layers.length === 0) {
          return 'No TileMapLayer nodes found in scene';
        }
        return `Found ${result.tilemap_layers.length} TileMapLayer(s):\n${result.tilemap_layers.map((l) => `  - ${l.path}`).join('\n')}`;
      }
      case 'get_info': {
        const result = await godot.sendCommand('get_tilemap_layer_info', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_tileset_info': {
        const result = await godot.sendCommand('get_tileset_info', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_used_cells': {
        const result = await godot.sendCommand('get_used_cells', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_cell': {
        const result = await godot.sendCommand('get_cell', { node_path: args.node_path, coords: args.coords });
        return JSON.stringify(result, null, 2);
      }
      case 'get_cells_in_region': {
        const result = await godot.sendCommand('get_cells_in_region', {
          node_path: args.node_path,
          min_coords: args.min_coords,
          max_coords: args.max_coords,
        });
        return JSON.stringify(result, null, 2);
      }
      case 'convert_coords': {
        const result = await godot.sendCommand('convert_coords', {
          node_path: args.node_path,
          local_position: args.local_position,
          map_coords: args.map_coords,
        });
        return JSON.stringify(result, null, 2);
      }
      case 'set_cell': {
        const result = await godot.sendCommand<{
          coords: { x: number; y: number };
          source_id: number;
          atlas_coords: { x: number; y: number };
          alternative_tile: number;
        }>('set_cell', {
          node_path: args.node_path,
          coords: args.coords,
          source_id: args.source_id,
          atlas_coords: args.atlas_coords,
          alternative_tile: args.alternative_tile,
        });
        return `Set cell at (${result.coords.x}, ${result.coords.y}) with source ${result.source_id}, atlas (${result.atlas_coords.x}, ${result.atlas_coords.y})`;
      }
      case 'erase_cell': {
        const result = await godot.sendCommand<{ erased: { x: number; y: number } }>('erase_cell', {
          node_path: args.node_path,
          coords: args.coords,
        });
        return `Erased cell at (${result.erased.x}, ${result.erased.y})`;
      }
      case 'clear_layer': {
        const result = await godot.sendCommand<{ cleared: boolean; cells_removed: number }>('clear_layer', {
          node_path: args.node_path,
        });
        return `Cleared layer: ${result.cells_removed} cells removed`;
      }
      case 'set_cells_batch': {
        const result = await godot.sendCommand<{ cells_set: number }>('set_cells_batch', {
          node_path: args.node_path,
          cells: args.cells,
        });
        return `Set ${result.cells_set} cells`;
      }
    }
  },
});

const GridmapSchema = z
  .object({
    action: z
      .enum(['list', 'get_info', 'get_meshlib_info', 'get_used_cells', 'get_cell', 'get_cells_by_item', 'set_cell', 'clear_cell', 'clear', 'set_cells_batch'])
      .describe('Action: list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item, set_cell, clear_cell, clear, set_cells_batch'),
    root_path: z.string().optional().describe('Starting node path (list only)'),
    node_path: z.string().optional().describe('Path to GridMap (required except list)'),
    coords: Vector3iSchema.optional().describe('Cell coordinates (get_cell, set_cell, clear_cell)'),
    item: z.number().int().optional().describe('MeshLibrary item index (get_cells_by_item, set_cell)'),
    orientation: z.number().int().optional().describe('Orientation 0-23, default 0 (set_cell)'),
    cells: z
      .array(
        z.object({
          coords: Vector3iSchema,
          item: z.number().int(),
          orientation: z.number().int().optional(),
        })
      )
      .optional()
      .describe('Array of cells to set (set_cells_batch)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'list':
          return true;
        case 'get_info':
        case 'get_meshlib_info':
        case 'get_used_cells':
        case 'clear':
          return !!data.node_path;
        case 'get_cell':
        case 'clear_cell':
          return !!data.node_path && !!data.coords;
        case 'get_cells_by_item':
          return !!data.node_path && data.item !== undefined;
        case 'set_cell':
          return !!data.node_path && !!data.coords && data.item !== undefined;
        case 'set_cells_batch':
          return !!data.node_path && !!data.cells && data.cells.length > 0;
        default:
          return false;
      }
    },
    { message: 'Missing required fields for action' }
  );

type GridmapArgs = z.infer<typeof GridmapSchema>;

export const gridmap = defineTool({
  name: 'gridmap',
  description:
    'Query and edit GridMap data: list gridmaps, get info, get/set cells',
  schema: GridmapSchema,
  async execute(args: GridmapArgs, { godot }) {
    switch (args.action) {
      case 'list': {
        const result = await godot.sendCommand<{
          gridmaps: Array<{ path: string; name: string }>;
        }>('list_gridmaps', { root_path: args.root_path });
        if (result.gridmaps.length === 0) {
          return 'No GridMap nodes found in scene';
        }
        return `Found ${result.gridmaps.length} GridMap(s):\n${result.gridmaps.map((g) => `  - ${g.path}`).join('\n')}`;
      }
      case 'get_info': {
        const result = await godot.sendCommand('get_gridmap_info', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_meshlib_info': {
        const result = await godot.sendCommand('get_meshlib_info', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_used_cells': {
        const result = await godot.sendCommand('get_gridmap_used_cells', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_cell': {
        const result = await godot.sendCommand('get_gridmap_cell', { node_path: args.node_path, coords: args.coords });
        return JSON.stringify(result, null, 2);
      }
      case 'get_cells_by_item': {
        const result = await godot.sendCommand('get_cells_by_item', { node_path: args.node_path, item: args.item });
        return JSON.stringify(result, null, 2);
      }
      case 'set_cell': {
        const result = await godot.sendCommand<{
          coords: { x: number; y: number; z: number };
          item: number;
          orientation: number;
        }>('set_gridmap_cell', {
          node_path: args.node_path,
          coords: args.coords,
          item: args.item,
          orientation: args.orientation,
        });
        return `Set cell at (${result.coords.x}, ${result.coords.y}, ${result.coords.z}) with item ${result.item}, orientation ${result.orientation}`;
      }
      case 'clear_cell': {
        const result = await godot.sendCommand<{
          cleared: { x: number; y: number; z: number };
        }>('clear_gridmap_cell', { node_path: args.node_path, coords: args.coords });
        return `Cleared cell at (${result.cleared.x}, ${result.cleared.y}, ${result.cleared.z})`;
      }
      case 'clear': {
        const result = await godot.sendCommand<{ cleared: boolean; cells_removed: number }>('clear_gridmap', {
          node_path: args.node_path,
        });
        return `Cleared GridMap: ${result.cells_removed} cells removed`;
      }
      case 'set_cells_batch': {
        const result = await godot.sendCommand<{ cells_set: number }>('set_gridmap_cells_batch', {
          node_path: args.node_path,
          cells: args.cells,
        });
        return `Set ${result.cells_set} cells`;
      }
    }
  },
});

export const tilemapTools = [tilemap, gridmap] as AnyToolDefinition[];
