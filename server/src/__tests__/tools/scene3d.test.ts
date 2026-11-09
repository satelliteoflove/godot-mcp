import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { scene3d } from '../../tools/scene3d.js';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const aabb = { position: v(0, 0, 0), size: v(2, 2, 2), end: v(2, 2, 2) };

describe('godot_scene3d', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('source reporting (#405)', () => {
    it('says when spatial info came from the running game', async () => {
      mock.mockResponse({
        nodes: [{
          path: '/root/Dungeon/FloorGridMap', type: 'GridMap', global_position: v(0, 0, 0),
          global_rotation: v(0, 0, 0), global_scale: v(1, 1, 1), visible: true, aabb, global_aabb: aabb,
        }],
        count: 1,
        source: 'game',
      });
      const result = await scene3d.execute(
        { action: 'get_spatial_info', node_path: '/root/Dungeon/FloorGridMap', include_children: false },
        createToolContext(mock)
      );
      expect(result).toContain('Found 1 Node3D node(s) in the running game:');
      expect(mock.calls[0].command).toBe('get_spatial_info');
    });

    it('says when bounds came from the editor scene', async () => {
      mock.mockResponse({ root_path: '/root/Dungeon', node_count: 3, combined_aabb: aabb, source: 'editor' });
      const result = await scene3d.execute({ action: 'get_bounds' }, createToolContext(mock));
      expect(result).toContain('Scene bounds for /root/Dungeon in the editor scene:');
    });

    it('names the source on an empty result too', async () => {
      mock.mockResponse({ nodes: [], count: 0, source: 'game' });
      const result = await scene3d.execute(
        { action: 'get_spatial_info', node_path: '/root/Dungeon', include_children: true, type_filter: 'Light3D' },
        createToolContext(mock)
      );
      expect(result).toBe('No matching Node3D nodes found in the running game');
    });

    it('omits the source when an older addon sends none', async () => {
      mock.mockResponse({ root_path: '/root/Main', node_count: 1, combined_aabb: aabb });
      const result = await scene3d.execute({ action: 'get_bounds' }, createToolContext(mock));
      expect(result).toContain('Scene bounds for /root/Main:');
    });
  });
});
