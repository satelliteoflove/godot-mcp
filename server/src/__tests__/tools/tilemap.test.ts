import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { tilemap, gridmap } from '../../tools/tilemap.js';

describe('tilemap tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('query actions', () => {
    it('list_layers returns formatted list or empty message', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ tilemap_layers: [] });
      expect(await tilemap.execute({ action: 'list_layers' }, ctx))
        .toBe('No TileMapLayer nodes found in scene');

      mock.mockResponse({
        tilemap_layers: [
          { path: '/root/Ground', name: 'Ground' },
          { path: '/root/Walls', name: 'Walls' },
        ],
      });
      const result = await tilemap.execute({ action: 'list_layers' }, ctx);
      expect(result).toContain('Found 2 TileMapLayer(s)');
    });

    it('info/tileset/cells queries return JSON', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ name: 'Ground', enabled: true });
      expect(JSON.parse(await tilemap.execute({
        action: 'get_info',
        node_path: '/root/Ground',
      }, ctx) as string)).toHaveProperty('name', 'Ground');

      mock.mockResponse({ tile_size: { x: 16, y: 16 } });
      expect(JSON.parse(await tilemap.execute({
        action: 'get_tileset_info',
        node_path: '/root/Ground',
      }, ctx) as string)).toHaveProperty('tile_size');

      mock.mockResponse({ cells: [{ x: 0, y: 0 }], count: 1 });
      expect(JSON.parse(await tilemap.execute({
        action: 'get_used_cells',
        node_path: '/root/Ground',
      }, ctx) as string)).toHaveProperty('count', 1);
    });

    it('get_cell and get_cells_in_region pass coords correctly', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ coords: { x: 5, y: 10 }, empty: false });
      await tilemap.execute({
        action: 'get_cell',
        node_path: '/root/Ground',
        coords: { x: 5, y: 10 },
      }, ctx);
      expect(mock.calls[0].params.coords).toEqual({ x: 5, y: 10 });

      mock.mockResponse({ cells: [], count: 0 });
      await tilemap.execute({
        action: 'get_cells_in_region',
        node_path: '/root/Ground',
        min_coords: { x: 0, y: 0 },
        max_coords: { x: 10, y: 10 },
      }, ctx);
      expect(mock.calls[1].params.min_coords).toEqual({ x: 0, y: 0 });
      expect(mock.calls[1].params.max_coords).toEqual({ x: 10, y: 10 });
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Node not found'));
      const ctx = createToolContext(mock);

      await expect(tilemap.execute({
        action: 'get_info',
        node_path: '/root/Missing',
      }, ctx)).rejects.toThrow('Node not found');
    });
  });

  describe('edit actions', () => {
    it('set_cell returns confirmation with coordinates', async () => {
      mock.mockResponse({ coords: { x: 3, y: 4 }, source_id: 1, atlas_coords: { x: 2, y: 0 }, alternative_tile: 0 });
      const ctx = createToolContext(mock);

      const result = await tilemap.execute({
        action: 'set_cell',
        node_path: '/root/Ground',
        coords: { x: 3, y: 4 },
        source_id: 1,
        atlas_coords: { x: 2, y: 0 },
      }, ctx);
      expect(result).toContain('Set cell at (3, 4)');
    });

    it('erase_cell/clear_layer return confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ erased: { x: 5, y: 6 } });
      expect(await tilemap.execute({
        action: 'erase_cell',
        node_path: '/root/Ground',
        coords: { x: 5, y: 6 },
      }, ctx)).toBe('Erased cell at (5, 6)');

      mock.mockResponse({ cleared: true, cells_removed: 100 });
      expect(await tilemap.execute({
        action: 'clear_layer',
        node_path: '/root/Ground',
      }, ctx)).toBe('Cleared layer: 100 cells removed');
    });

    it('set_cells_batch returns count from response and requires non-empty array', async () => {
      mock.mockResponse({ cells_set: 2 });
      const ctx = createToolContext(mock);

      expect(await tilemap.execute({
        action: 'set_cells_batch',
        node_path: '/root/Ground',
        cells: [{ coords: { x: 0, y: 0 } }, { coords: { x: 1, y: 0 } }],
      }, ctx)).toBe('Set 2 cells');

      expect(tilemap.schema.safeParse({
        action: 'set_cells_batch',
        node_path: '/root/Ground',
        cells: [],
      }).success).toBe(false);
    });
  });
});

describe('gridmap tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('query actions', () => {
    it('list returns formatted list or empty message', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ gridmaps: [] });
      expect(await gridmap.execute({ action: 'list' }, ctx))
        .toBe('No GridMap nodes found in scene');

      mock.mockResponse({
        gridmaps: [{ path: '/root/Floor', name: 'Floor' }],
      });
      expect(await gridmap.execute({ action: 'list' }, ctx))
        .toContain('Found 1 GridMap(s)');
    });

    it('info/meshlib/cells queries return JSON', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ name: 'Floor', cell_size: { x: 2, y: 2, z: 2 } });
      expect(JSON.parse(await gridmap.execute({
        action: 'get_info',
        node_path: '/root/Floor',
      }, ctx) as string)).toHaveProperty('cell_size');

      mock.mockResponse({ item_count: 3 });
      expect(JSON.parse(await gridmap.execute({
        action: 'get_meshlib_info',
        node_path: '/root/Floor',
      }, ctx) as string)).toHaveProperty('item_count', 3);
    });

    it('get_cell passes 3D coords correctly', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ coords: { x: 1, y: 2, z: 3 }, empty: false });
      await gridmap.execute({
        action: 'get_cell',
        node_path: '/root/Floor',
        coords: { x: 1, y: 2, z: 3 },
      }, ctx);
      expect(mock.calls[0].params.coords).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe('edit actions', () => {
    it('set_cell/clear_cell/clear return confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ coords: { x: 1, y: 0, z: 1 }, item: 2, orientation: 4 });
      const result = await gridmap.execute({
        action: 'set_cell',
        node_path: '/root/Floor',
        coords: { x: 1, y: 0, z: 1 },
        item: 2,
        orientation: 4,
      }, ctx);
      expect(result).toContain('Set cell at (1, 0, 1)');
      expect(result).toContain('item 2');

      mock.mockResponse({ cleared: { x: 2, y: 1, z: 3 } });
      expect(await gridmap.execute({
        action: 'clear_cell',
        node_path: '/root/Floor',
        coords: { x: 2, y: 1, z: 3 },
      }, ctx)).toBe('Cleared cell at (2, 1, 3)');

      mock.mockResponse({ cleared: true, cells_removed: 50 });
      expect(await gridmap.execute({
        action: 'clear',
        node_path: '/root/Floor',
      }, ctx)).toBe('Cleared GridMap: 50 cells removed');
    });

    it('set_cells_batch requires non-empty array', () => {
      expect(gridmap.schema.safeParse({
        action: 'set_cells_batch',
        node_path: '/root/Floor',
        cells: [],
      }).success).toBe(false);
    });
  });
});
