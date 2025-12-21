import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { tilemapQuery, tilemapEdit, gridmapQuery, gridmapEdit } from '../../tools/tilemap.js';

describe('TileMap Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('tilemap_query', () => {
    describe('list_layers action', () => {
      it('sends list_tilemap_layers command', async () => {
        mock.mockResponse({ tilemap_layers: [] });
        const ctx = createToolContext(mock);

        await tilemapQuery.execute({ action: 'list_layers' }, ctx);

        expect(mock.calls[0].command).toBe('list_tilemap_layers');
      });

      it('returns message when no layers found', async () => {
        mock.mockResponse({ tilemap_layers: [] });
        const ctx = createToolContext(mock);

        const result = await tilemapQuery.execute({ action: 'list_layers' }, ctx);

        expect(result).toBe('No TileMapLayer nodes found in scene');
      });

      it('lists found layers', async () => {
        mock.mockResponse({
          tilemap_layers: [
            { path: '/root/Ground', name: 'Ground' },
            { path: '/root/Walls', name: 'Walls' },
          ],
        });
        const ctx = createToolContext(mock);

        const result = await tilemapQuery.execute({ action: 'list_layers' }, ctx);

        expect(result).toContain('Found 2 TileMapLayer(s)');
        expect(result).toContain('/root/Ground');
      });
    });

    describe('get_cell action', () => {
      it('requires node_path and coords', () => {
        expect(tilemapQuery.schema.safeParse({
          action: 'get_cell',
          node_path: '/root/TileMap',
        }).success).toBe(false);

        expect(tilemapQuery.schema.safeParse({
          action: 'get_cell',
          node_path: '/root/TileMap',
          coords: { x: 5, y: 10 },
        }).success).toBe(true);
      });

      it('sends get_cell command with coords', async () => {
        mock.mockResponse({ coords: { x: 5, y: 10 }, empty: false, source_id: 0 });
        const ctx = createToolContext(mock);

        await tilemapQuery.execute({
          action: 'get_cell',
          node_path: '/root/TileMap',
          coords: { x: 5, y: 10 },
        }, ctx);

        expect(mock.calls[0].command).toBe('get_cell');
        expect(mock.calls[0].params.coords).toEqual({ x: 5, y: 10 });
      });
    });

    describe('get_cells_in_region action', () => {
      it('requires node_path, min_coords, and max_coords', () => {
        expect(tilemapQuery.schema.safeParse({
          action: 'get_cells_in_region',
          node_path: '/root/TileMap',
          min_coords: { x: 0, y: 0 },
        }).success).toBe(false);

        expect(tilemapQuery.schema.safeParse({
          action: 'get_cells_in_region',
          node_path: '/root/TileMap',
          min_coords: { x: 0, y: 0 },
          max_coords: { x: 10, y: 10 },
        }).success).toBe(true);
      });
    });
  });

  describe('tilemap_edit', () => {
    describe('set_cell action', () => {
      it('requires coords', () => {
        expect(tilemapEdit.schema.safeParse({
          action: 'set_cell',
          node_path: '/root/TileMap',
        }).success).toBe(false);

        expect(tilemapEdit.schema.safeParse({
          action: 'set_cell',
          node_path: '/root/TileMap',
          coords: { x: 3, y: 4 },
        }).success).toBe(true);
      });

      it('sends set_cell command with coords and source', async () => {
        mock.mockResponse({
          coords: { x: 3, y: 4 },
          source_id: 0,
          atlas_coords: { x: 0, y: 0 },
          alternative_tile: 0,
        });
        const ctx = createToolContext(mock);

        await tilemapEdit.execute({
          action: 'set_cell',
          node_path: '/root/TileMap',
          coords: { x: 3, y: 4 },
          source_id: 1,
        }, ctx);

        expect(mock.calls[0].command).toBe('set_cell');
        expect(mock.calls[0].params.coords).toEqual({ x: 3, y: 4 });
        expect(mock.calls[0].params.source_id).toBe(1);
      });
    });

    describe('set_cells_batch action', () => {
      it('requires non-empty cells array', () => {
        expect(tilemapEdit.schema.safeParse({
          action: 'set_cells_batch',
          node_path: '/root/TileMap',
        }).success).toBe(false);

        expect(tilemapEdit.schema.safeParse({
          action: 'set_cells_batch',
          node_path: '/root/TileMap',
          cells: [],
        }).success).toBe(false);

        expect(tilemapEdit.schema.safeParse({
          action: 'set_cells_batch',
          node_path: '/root/TileMap',
          cells: [{ coords: { x: 0, y: 0 } }],
        }).success).toBe(true);
      });
    });

    describe('clear_layer action', () => {
      it('only requires node_path', () => {
        expect(tilemapEdit.schema.safeParse({
          action: 'clear_layer',
          node_path: '/root/TileMap',
        }).success).toBe(true);
      });

      it('sends clear_layer command', async () => {
        mock.mockResponse({ cleared: true, cells_removed: 100 });
        const ctx = createToolContext(mock);

        const result = await tilemapEdit.execute({
          action: 'clear_layer',
          node_path: '/root/TileMap',
        }, ctx);

        expect(mock.calls[0].command).toBe('clear_layer');
        expect(result).toContain('100 cells removed');
      });
    });
  });
});

describe('GridMap Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('gridmap_query', () => {
    describe('list action', () => {
      it('sends list_gridmaps command', async () => {
        mock.mockResponse({ gridmaps: [] });
        const ctx = createToolContext(mock);

        await gridmapQuery.execute({ action: 'list' }, ctx);

        expect(mock.calls[0].command).toBe('list_gridmaps');
      });

      it('returns message when no gridmaps found', async () => {
        mock.mockResponse({ gridmaps: [] });
        const ctx = createToolContext(mock);

        const result = await gridmapQuery.execute({ action: 'list' }, ctx);

        expect(result).toBe('No GridMap nodes found in scene');
      });
    });

    describe('get_cell action', () => {
      it('requires 3D coords', () => {
        expect(gridmapQuery.schema.safeParse({
          action: 'get_cell',
          node_path: '/root/GridMap',
          coords: { x: 1, y: 2 },
        }).success).toBe(false);

        expect(gridmapQuery.schema.safeParse({
          action: 'get_cell',
          node_path: '/root/GridMap',
          coords: { x: 1, y: 2, z: 3 },
        }).success).toBe(true);
      });
    });

    describe('get_cells_by_item action', () => {
      it('requires node_path and item', () => {
        expect(gridmapQuery.schema.safeParse({
          action: 'get_cells_by_item',
          node_path: '/root/GridMap',
        }).success).toBe(false);

        expect(gridmapQuery.schema.safeParse({
          action: 'get_cells_by_item',
          node_path: '/root/GridMap',
          item: 0,
        }).success).toBe(true);
      });
    });
  });

  describe('gridmap_edit', () => {
    describe('set_cell action', () => {
      it('requires coords and item', () => {
        expect(gridmapEdit.schema.safeParse({
          action: 'set_cell',
          node_path: '/root/GridMap',
          coords: { x: 1, y: 0, z: 1 },
        }).success).toBe(false);

        expect(gridmapEdit.schema.safeParse({
          action: 'set_cell',
          node_path: '/root/GridMap',
          coords: { x: 1, y: 0, z: 1 },
          item: 0,
        }).success).toBe(true);
      });

      it('sends set_gridmap_cell command', async () => {
        mock.mockResponse({ coords: { x: 1, y: 0, z: 1 }, item: 2, orientation: 0 });
        const ctx = createToolContext(mock);

        await gridmapEdit.execute({
          action: 'set_cell',
          node_path: '/root/GridMap',
          coords: { x: 1, y: 0, z: 1 },
          item: 2,
          orientation: 4,
        }, ctx);

        expect(mock.calls[0].command).toBe('set_gridmap_cell');
        expect(mock.calls[0].params.item).toBe(2);
        expect(mock.calls[0].params.orientation).toBe(4);
      });
    });

    describe('clear action', () => {
      it('only requires node_path', () => {
        expect(gridmapEdit.schema.safeParse({
          action: 'clear',
          node_path: '/root/GridMap',
        }).success).toBe(true);
      });
    });

    describe('set_cells_batch action', () => {
      it('requires non-empty cells array with item', () => {
        expect(gridmapEdit.schema.safeParse({
          action: 'set_cells_batch',
          node_path: '/root/GridMap',
          cells: [],
        }).success).toBe(false);

        expect(gridmapEdit.schema.safeParse({
          action: 'set_cells_batch',
          node_path: '/root/GridMap',
          cells: [{ coords: { x: 0, y: 0, z: 0 }, item: 1 }],
        }).success).toBe(true);
      });
    });
  });
});
