import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../core/registry.js';
import { registerAllTools } from '../../tools/index.js';

// The split convention is load-bearing for clients: every *_read tool must be
// safely auto-allowable (readOnlyHint true), and no tool may mix the classes.
describe('tool annotations', () => {
  beforeAll(() => {
    registerAllTools();
  });

  const byName = () => new Map(registry.getToolList().map((t) => [t.name, t]));

  it('every registered tool exposes a title annotation', () => {
    for (const tool of registry.getToolList()) {
      expect(tool.annotations?.title, tool.name).toBeTruthy();
    }
  });

  it('every *_read tool is readOnlyHint true and not destructive', () => {
    const readTools = registry.getToolList().filter((t) => t.name.endsWith('_read'));
    expect(readTools.length).toBeGreaterThanOrEqual(5);
    for (const tool of readTools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(true);
      expect(tool.annotations?.destructiveHint ?? false, tool.name).toBe(false);
    }
  });

  it('every *_edit tool is readOnlyHint false', () => {
    const editTools = registry.getToolList().filter((t) => t.name.endsWith('_edit'));
    expect(editTools.length).toBeGreaterThanOrEqual(5);
    for (const tool of editTools) {
      expect(tool.annotations?.readOnlyHint, tool.name).toBe(false);
    }
  });

  it('single-class read tools are marked readOnlyHint true', () => {
    const map = byName();
    const readOnly = [
      'godot_docs',
      'godot_scene3d',
      'godot_resource',
      'godot_profiler',
      'godot_project',
      'godot_runtime_state',
      'godot_validate_meshes',
    ];
    for (const name of readOnly) {
      expect(map.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('destructive hints sit only where data is actually destroyed', () => {
    const map = byName();
    expect(map.get('godot_animation_edit')?.annotations?.destructiveHint).toBe(true);
    expect(map.get('godot_tilemap_edit')?.annotations?.destructiveHint).toBe(true);
    expect(map.get('godot_gridmap_edit')?.annotations?.destructiveHint).toBe(true);
    expect(map.get('godot_exec')?.annotations?.destructiveHint).toBe(true);
    // reversible writes are not destructive
    expect(map.get('godot_node_edit')?.annotations?.destructiveHint).toBe(false);
    expect(map.get('godot_editor_edit')?.annotations?.destructiveHint).toBe(false);
    expect(map.get('godot_scene')?.annotations?.destructiveHint).toBe(false);
  });

  it('only the docs tool reaches the open world', () => {
    for (const tool of registry.getToolList()) {
      expect(tool.annotations?.openWorldHint ?? false, tool.name).toBe(
        tool.name === 'godot_docs'
      );
    }
  });
});
