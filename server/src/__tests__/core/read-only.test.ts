import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../core/registry.js';
import { registerAllTools } from '../../tools/index.js';

// This file must be the only one in its module graph calling
// registerAllTools — the registry is a singleton and re-registration throws.
describe('read-only mode', () => {
  beforeAll(() => {
    registerAllTools({ readOnly: true });
  });

  it('registers only readOnlyHint tools', () => {
    const tools = registry.getToolList();
    expect(tools.length).toBeGreaterThanOrEqual(10);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
    }
  });

  it('keeps the observation surface', () => {
    const names = new Set(registry.getToolList().map((t) => t.name));
    for (const expected of [
      'godot_node_read',
      'godot_editor_read',
      'godot_animation_read',
      'godot_tilemap_read',
      'godot_gridmap_read',
      'godot_project',
      'godot_resource',
      'godot_scene3d',
      'godot_profiler',
      'godot_runtime_state',
      'godot_docs',
      'godot_validate_meshes',
    ]) {
      expect(names.has(expected), expected).toBe(true);
    }
  });

  it('excludes every write-capable tool', () => {
    const names = new Set(registry.getToolList().map((t) => t.name));
    for (const excluded of [
      'godot_scene',
      'godot_node_edit',
      'godot_editor_edit',
      'godot_animation_edit',
      'godot_tilemap_edit',
      'godot_gridmap_edit',
      'godot_input',
      'godot_game_time',
      'godot_exec',
    ]) {
      expect(names.has(excluded), excluded).toBe(false);
    }
  });
});
