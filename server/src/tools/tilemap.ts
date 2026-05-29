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

const tilemapNodePath = z.string().describe('Path to the TileMapLayer');

const TilemapSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_layers').describe('List TileMapLayer nodes in the scene'),
    root_path: z.string().optional().describe('Starting node path (defaults to scene root)'),
  }),
  z.object({ action: z.literal('get_info').describe('Get TileMapLayer info'), node_path: tilemapNodePath }),
  z.object({ action: z.literal('get_tileset_info').describe("Get the layer's TileSet info"), node_path: tilemapNodePath }),
  z.object({ action: z.literal('get_used_cells').describe('Get all used cells'), node_path: tilemapNodePath }),
  z.object({
    action: z.literal('get_cell').describe('Get a single cell'),
    node_path: tilemapNodePath,
    coords: Vector2iSchema.describe('Cell coordinates'),
  }),
  z.object({
    action: z.literal('get_cells_in_region').describe('Get cells within a rectangular region'),
    node_path: tilemapNodePath,
    min_coords: Vector2iSchema.describe('Minimum corner of region'),
    max_coords: Vector2iSchema.describe('Maximum corner of region'),
  }),
  z.object({
    action: z.literal('convert_coords').describe('Convert between local position and map coordinates'),
    node_path: tilemapNodePath,
    local_position: z
      .object({ x: z.number(), y: z.number() })
      .optional()
      .describe('Local position to convert to map coords'),
    map_coords: Vector2iSchema.optional().describe('Map coordinates to convert to local position'),
  }),
  z.object({
    action: z.literal('set_cell').describe('Set a single cell'),
    node_path: tilemapNodePath,
    coords: Vector2iSchema.describe('Cell coordinates'),
    source_id: z.number().int().optional().describe('TileSet source ID, default 0'),
    atlas_coords: Vector2iSchema.optional().describe('Atlas coordinates, default 0,0'),
    alternative_tile: z.number().int().optional().describe('Alternative tile ID, default 0'),
  }),
  z.object({
    action: z.literal('erase_cell').describe('Erase a single cell'),
    node_path: tilemapNodePath,
    coords: Vector2iSchema.describe('Cell coordinates'),
  }),
  z.object({ action: z.literal('clear_layer').describe('Clear all cells in the layer'), node_path: tilemapNodePath }),
  z.object({
    action: z.literal('set_cells_batch').describe('Set many cells at once'),
    node_path: tilemapNodePath,
    cells: z
      .array(
        z.object({
          coords: Vector2iSchema,
          source_id: z.number().int().optional(),
          atlas_coords: Vector2iSchema.optional(),
          alternative_tile: z.number().int().optional(),
        })
      )
      .min(1)
      .describe('Array of cells to set'),
  }),
]);

type TilemapArgs = z.infer<typeof TilemapSchema>;

export const tilemap = defineTool({
  name: 'godot_tilemap',
  annotations: { title: 'TileMapLayer', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
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
        return JSON.stringify(result);
      }
      case 'get_tileset_info': {
        const result = await godot.sendCommand('get_tileset_info', { node_path: args.node_path });
        return JSON.stringify(result);
      }
      case 'get_used_cells': {
        const result = await godot.sendCommand('get_used_cells', { node_path: args.node_path });
        return JSON.stringify(result);
      }
      case 'get_cell': {
        const result = await godot.sendCommand('get_cell', { node_path: args.node_path, coords: args.coords });
        return JSON.stringify(result);
      }
      case 'get_cells_in_region': {
        const result = await godot.sendCommand('get_cells_in_region', {
          node_path: args.node_path,
          min_coords: args.min_coords,
          max_coords: args.max_coords,
        });
        return JSON.stringify(result);
      }
      case 'convert_coords': {
        const result = await godot.sendCommand('convert_coords', {
          node_path: args.node_path,
          local_position: args.local_position,
          map_coords: args.map_coords,
        });
        return JSON.stringify(result);
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

const gridmapNodePath = z.string().describe('Path to the GridMap');

const GridmapSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list').describe('List GridMap nodes in the scene'),
    root_path: z.string().optional().describe('Starting node path (defaults to scene root)'),
  }),
  z.object({ action: z.literal('get_info').describe('Get GridMap info'), node_path: gridmapNodePath }),
  z.object({ action: z.literal('get_meshlib_info').describe("Get the GridMap's MeshLibrary info"), node_path: gridmapNodePath }),
  z.object({ action: z.literal('get_used_cells').describe('Get all used cells'), node_path: gridmapNodePath }),
  z.object({
    action: z.literal('get_cell').describe('Get a single cell'),
    node_path: gridmapNodePath,
    coords: Vector3iSchema.describe('Cell coordinates'),
  }),
  z.object({
    action: z.literal('get_cells_by_item').describe('Get all cells using a given MeshLibrary item'),
    node_path: gridmapNodePath,
    item: z.number().int().describe('MeshLibrary item index'),
  }),
  z.object({
    action: z.literal('set_cell').describe('Set a single cell'),
    node_path: gridmapNodePath,
    coords: Vector3iSchema.describe('Cell coordinates'),
    item: z.number().int().describe('MeshLibrary item index'),
    orientation: z.number().int().optional().describe('Orientation 0-23, default 0'),
  }),
  z.object({
    action: z.literal('clear_cell').describe('Clear a single cell'),
    node_path: gridmapNodePath,
    coords: Vector3iSchema.describe('Cell coordinates'),
  }),
  z.object({ action: z.literal('clear').describe('Clear all cells'), node_path: gridmapNodePath }),
  z.object({
    action: z.literal('set_cells_batch').describe('Set many cells at once'),
    node_path: gridmapNodePath,
    cells: z
      .array(
        z.object({
          coords: Vector3iSchema,
          item: z.number().int(),
          orientation: z.number().int().optional(),
        })
      )
      .min(1)
      .describe('Array of cells to set'),
  }),
]);

type GridmapArgs = z.infer<typeof GridmapSchema>;

export const gridmap = defineTool({
  name: 'godot_gridmap',
  annotations: { title: 'GridMap', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
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
        return JSON.stringify(result);
      }
      case 'get_meshlib_info': {
        const result = await godot.sendCommand('get_meshlib_info', { node_path: args.node_path });
        return JSON.stringify(result);
      }
      case 'get_used_cells': {
        const result = await godot.sendCommand('get_gridmap_used_cells', { node_path: args.node_path });
        return JSON.stringify(result);
      }
      case 'get_cell': {
        const result = await godot.sendCommand('get_gridmap_cell', { node_path: args.node_path, coords: args.coords });
        return JSON.stringify(result);
      }
      case 'get_cells_by_item': {
        const result = await godot.sendCommand('get_cells_by_item', { node_path: args.node_path, item: args.item });
        return JSON.stringify(result);
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
