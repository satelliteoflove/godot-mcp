import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { tilemap, gridmap, tilemapTools } from '../../tools/tilemap.js';

describe('tilemap tool', () => {
  describe('tool definitions', () => {
    it('exports two tools', () => {
      expect(tilemapTools).toHaveLength(2);
    });

    it('has tilemap and gridmap tools', () => {
      expect(tilemap.name).toBe('tilemap');
      expect(gridmap.name).toBe('gridmap');
    });
  });

  describe('tilemap query actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('list_layers sends command and formats empty result', async () => {
      mock.mockResponse({ tilemap_layers: [] });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({ action: 'list_layers' }, ctx);

      expect(mock.calls[0].command).toBe('list_tilemap_layers');
      expect(result).toBe('No TileMapLayer nodes found in scene');
    });

    it('list_layers formats found layers', async () => {
      mock.mockResponse({
        tilemap_layers: [
          { path: '/root/Ground', name: 'Ground' },
          { path: '/root/Walls', name: 'Walls' },
        ],
      });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({ action: 'list_layers' }, ctx);

      expect(result).toContain('Found 2 TileMapLayer(s)');
      expect(result).toContain('/root/Ground');
    });

    it('get_info sends command and returns JSON', async () => {
      const info = { name: 'Ground', enabled: true, used_cells_count: 100 };
      mock.mockResponse(info);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'get_info',
        node_path: '/root/Ground',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_tilemap_layer_info');
      expect(result).toBe(JSON.stringify(info, null, 2));
    });

    it('get_tileset_info sends command and returns JSON', async () => {
      const info = { tile_size: { x: 16, y: 16 }, source_count: 1 };
      mock.mockResponse(info);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'get_tileset_info',
        node_path: '/root/Ground',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_tileset_info');
      expect(result).toBe(JSON.stringify(info, null, 2));
    });

    it('get_used_cells sends command and returns JSON', async () => {
      const cells = { cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }], count: 2 };
      mock.mockResponse(cells);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'get_used_cells',
        node_path: '/root/Ground',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_used_cells');
      expect(result).toBe(JSON.stringify(cells, null, 2));
    });

    it('get_cell sends command with coords', async () => {
      const cell = { coords: { x: 5, y: 10 }, empty: false, source_id: 0 };
      mock.mockResponse(cell);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'get_cell',
        node_path: '/root/Ground',
        coords: { x: 5, y: 10 },
      }, ctx);

      expect(mock.calls[0].command).toBe('get_cell');
      expect(mock.calls[0].params.coords).toEqual({ x: 5, y: 10 });
      expect(result).toBe(JSON.stringify(cell, null, 2));
    });

    it('get_cells_in_region sends command with bounds', async () => {
      const region = { cells: [], count: 0 };
      mock.mockResponse(region);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'get_cells_in_region',
        node_path: '/root/Ground',
        min_coords: { x: 0, y: 0 },
        max_coords: { x: 10, y: 10 },
      }, ctx);

      expect(mock.calls[0].command).toBe('get_cells_in_region');
      expect(mock.calls[0].params.min_coords).toEqual({ x: 0, y: 0 });
      expect(mock.calls[0].params.max_coords).toEqual({ x: 10, y: 10 });
      expect(result).toBe(JSON.stringify(region, null, 2));
    });

    it('convert_coords sends command with local_position', async () => {
      const converted = { direction: 'local_to_map', map_coords: { x: 2, y: 3 } };
      mock.mockResponse(converted);
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'convert_coords',
        node_path: '/root/Ground',
        local_position: { x: 32, y: 48 },
      }, ctx);

      expect(mock.calls[0].command).toBe('convert_coords');
      expect(mock.calls[0].params.local_position).toEqual({ x: 32, y: 48 });
      expect(result).toBe(JSON.stringify(converted, null, 2));
    });

    it('throws on error from Godot', async () => {
      mock.mockError(new Error('Node not found'));
      const ctx = createToolContext(mock);

      await expect(tilemap.execute({
        action: 'get_info',
        node_path: '/root/Missing',
      }, ctx)).rejects.toThrow('Node not found');
    });
  });

  describe('tilemap edit actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('set_cell sends command and returns confirmation', async () => {
      mock.mockResponse({
        coords: { x: 3, y: 4 },
        source_id: 1,
        atlas_coords: { x: 2, y: 0 },
        alternative_tile: 0,
      });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'set_cell',
        node_path: '/root/Ground',
        coords: { x: 3, y: 4 },
        source_id: 1,
        atlas_coords: { x: 2, y: 0 },
      }, ctx);

      expect(mock.calls[0].command).toBe('set_cell');
      expect(mock.calls[0].params.coords).toEqual({ x: 3, y: 4 });
      expect(mock.calls[0].params.source_id).toBe(1);
      expect(result).toContain('Set cell at (3, 4)');
    });

    it('erase_cell sends command and returns confirmation', async () => {
      mock.mockResponse({ erased: { x: 5, y: 6 } });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'erase_cell',
        node_path: '/root/Ground',
        coords: { x: 5, y: 6 },
      }, ctx);

      expect(mock.calls[0].command).toBe('erase_cell');
      expect(result).toBe('Erased cell at (5, 6)');
    });

    it('clear_layer sends command and returns cell count', async () => {
      mock.mockResponse({ cleared: true, cells_removed: 100 });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'clear_layer',
        node_path: '/root/Ground',
      }, ctx);

      expect(mock.calls[0].command).toBe('clear_layer');
      expect(result).toBe('Cleared layer: 100 cells removed');
    });

    it('set_cells_batch sends command and returns count', async () => {
      mock.mockResponse({ cells_set: 5 });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'set_cells_batch',
        node_path: '/root/Ground',
        cells: [
          { coords: { x: 0, y: 0 } },
          { coords: { x: 1, y: 0 } },
          { coords: { x: 2, y: 0 } },
          { coords: { x: 3, y: 0 } },
          { coords: { x: 4, y: 0 } },
        ],
      }, ctx);

      expect(mock.calls[0].command).toBe('set_cells_batch');
      expect(mock.calls[0].params.cells).toHaveLength(5);
      expect(result).toBe('Set 5 cells');
    });

    it('set_cells_batch requires non-empty cells array', () => {
      expect(tilemap.schema.safeParse({
        action: 'set_cells_batch',
        node_path: '/root/Ground',
        cells: [],
      }).success).toBe(false);
    });
  });
});

describe('gridmap tool', () => {
  describe('gridmap query actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('list sends command and formats empty result', async () => {
      mock.mockResponse({ gridmaps: [] });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({ action: 'list' }, ctx);

      expect(mock.calls[0].command).toBe('list_gridmaps');
      expect(result).toBe('No GridMap nodes found in scene');
    });

    it('list formats found gridmaps', async () => {
      mock.mockResponse({
        gridmaps: [
          { path: '/root/Floor', name: 'Floor' },
          { path: '/root/Walls', name: 'Walls' },
        ],
      });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({ action: 'list' }, ctx);

      expect(result).toContain('Found 2 GridMap(s)');
      expect(result).toContain('/root/Floor');
    });

    it('get_info sends command and returns JSON', async () => {
      const info = { name: 'Floor', cell_size: { x: 2, y: 2, z: 2 }, used_cells_count: 50 };
      mock.mockResponse(info);
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'get_info',
        node_path: '/root/Floor',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_gridmap_info');
      expect(result).toBe(JSON.stringify(info, null, 2));
    });

    it('get_meshlib_info sends command and returns JSON', async () => {
      const info = { item_count: 3, items: [{ index: 0, name: 'Cube' }] };
      mock.mockResponse(info);
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'get_meshlib_info',
        node_path: '/root/Floor',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_meshlib_info');
      expect(result).toBe(JSON.stringify(info, null, 2));
    });

    it('get_used_cells sends command and returns JSON', async () => {
      const cells = { cells: [{ x: 0, y: 0, z: 0 }], count: 1 };
      mock.mockResponse(cells);
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'get_used_cells',
        node_path: '/root/Floor',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_gridmap_used_cells');
      expect(result).toBe(JSON.stringify(cells, null, 2));
    });

    it('get_cell sends command with 3D coords', async () => {
      const cell = { coords: { x: 1, y: 2, z: 3 }, empty: false, item: 0 };
      mock.mockResponse(cell);
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'get_cell',
        node_path: '/root/Floor',
        coords: { x: 1, y: 2, z: 3 },
      }, ctx);

      expect(mock.calls[0].command).toBe('get_gridmap_cell');
      expect(mock.calls[0].params.coords).toEqual({ x: 1, y: 2, z: 3 });
      expect(result).toBe(JSON.stringify(cell, null, 2));
    });

    it('get_cells_by_item sends command with item index', async () => {
      const cells = { item: 0, cells: [{ x: 0, y: 0, z: 0 }], count: 1 };
      mock.mockResponse(cells);
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'get_cells_by_item',
        node_path: '/root/Floor',
        item: 0,
      }, ctx);

      expect(mock.calls[0].command).toBe('get_cells_by_item');
      expect(mock.calls[0].params.item).toBe(0);
      expect(result).toBe(JSON.stringify(cells, null, 2));
    });
  });

  describe('gridmap edit actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('set_cell sends command and returns confirmation', async () => {
      mock.mockResponse({ coords: { x: 1, y: 0, z: 1 }, item: 2, orientation: 4 });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'set_cell',
        node_path: '/root/Floor',
        coords: { x: 1, y: 0, z: 1 },
        item: 2,
        orientation: 4,
      }, ctx);

      expect(mock.calls[0].command).toBe('set_gridmap_cell');
      expect(mock.calls[0].params.item).toBe(2);
      expect(mock.calls[0].params.orientation).toBe(4);
      expect(result).toContain('Set cell at (1, 0, 1)');
      expect(result).toContain('item 2');
    });

    it('clear_cell sends command and returns confirmation', async () => {
      mock.mockResponse({ cleared: { x: 2, y: 1, z: 3 } });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'clear_cell',
        node_path: '/root/Floor',
        coords: { x: 2, y: 1, z: 3 },
      }, ctx);

      expect(mock.calls[0].command).toBe('clear_gridmap_cell');
      expect(result).toBe('Cleared cell at (2, 1, 3)');
    });

    it('clear sends command and returns cell count', async () => {
      mock.mockResponse({ cleared: true, cells_removed: 50 });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'clear',
        node_path: '/root/Floor',
      }, ctx);

      expect(mock.calls[0].command).toBe('clear_gridmap');
      expect(result).toBe('Cleared GridMap: 50 cells removed');
    });

    it('set_cells_batch sends command and returns count', async () => {
      mock.mockResponse({ cells_set: 3 });
      const ctx = createToolContext(mock);

      const result = await gridmap.execute({
        action: 'set_cells_batch',
        node_path: '/root/Floor',
        cells: [
          { coords: { x: 0, y: 0, z: 0 }, item: 1 },
          { coords: { x: 1, y: 0, z: 0 }, item: 1 },
          { coords: { x: 2, y: 0, z: 0 }, item: 1 },
        ],
      }, ctx);

      expect(mock.calls[0].command).toBe('set_gridmap_cells_batch');
      expect(mock.calls[0].params.cells).toHaveLength(3);
      expect(result).toBe('Set 3 cells');
    });

    it('set_cells_batch requires non-empty cells array', () => {
      expect(gridmap.schema.safeParse({
        action: 'set_cells_batch',
        node_path: '/root/Floor',
        cells: [],
      }).success).toBe(false);
    });
  });
});
