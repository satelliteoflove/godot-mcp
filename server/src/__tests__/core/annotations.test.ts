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

  it('destructive hints sit exactly where data is actually destroyed', () => {
    // Set equality over the whole registry, so a new destructive tool (or a
    // wrongly-flagged reversible one) fails this test rather than slipping by.
    const destructive = registry
      .getToolList()
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    expect(destructive).toEqual([
      'godot_animation_edit',
      'godot_exec',
      'godot_gridmap_edit',
      'godot_tilemap_edit',
    ]);
  });

  it('only the docs tool reaches the open world', () => {
    for (const tool of registry.getToolList()) {
      expect(tool.annotations?.openWorldHint ?? false, tool.name).toBe(
        tool.name === 'godot_docs'
      );
    }
  });
});
