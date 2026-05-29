import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../core/registry.js';
import { registerAllTools } from '../../tools/index.js';

describe('tool annotations passthrough', () => {
  beforeAll(() => {
    registerAllTools();
  });

  const byName = () => new Map(registry.getToolList().map((t) => [t.name, t]));

  it('every registered tool exposes a title annotation', () => {
    for (const tool of registry.getToolList()) {
      expect(tool.annotations?.title, tool.name).toBeTruthy();
    }
  });

  it('pure-read tools are marked readOnlyHint true', () => {
    const map = byName();
    const readOnly = ['godot_docs', 'godot_scene3d', 'godot_resource', 'godot_profiler', 'godot_project'];
    for (const name of readOnly) {
      expect(map.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it('write-capable tools are not read-only and flag destructive where apt', () => {
    const map = byName();
    expect(map.get('godot_node')?.annotations?.readOnlyHint).toBe(false);
    expect(map.get('godot_node')?.annotations?.destructiveHint).toBe(true);
    expect(map.get('godot_tilemap')?.annotations?.destructiveHint).toBe(true);
  });

  it('only the docs tool reaches the open world', () => {
    const map = byName();
    expect(map.get('godot_docs')?.annotations?.openWorldHint).toBe(true);
    expect(map.get('godot_node')?.annotations?.openWorldHint).toBe(false);
  });
});
