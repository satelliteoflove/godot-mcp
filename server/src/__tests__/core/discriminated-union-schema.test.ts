import { describe, it, expect } from 'vitest';
import { toInputSchema } from '../../core/schema.js';
import { node } from '../../tools/node.js';
import { animation } from '../../tools/animation.js';
import { editor } from '../../tools/editor.js';

type JsonSchema = Record<string, unknown>;
const variantsOf = (tool: { schema: Parameters<typeof toInputSchema>[0] }): JsonSchema[] =>
  (toInputSchema(tool.schema) as JsonSchema).oneOf as JsonSchema[];
const actionOf = (variant: JsonSchema): string =>
  ((variant.properties as Record<string, JsonSchema>).action as JsonSchema).const as string;

describe('discriminated-union tool schemas', () => {
  it('serialize to oneOf with one variant per action', () => {
    const variants = variantsOf(node);
    expect(Array.isArray(variants)).toBe(true);
    expect(variants).toHaveLength(9);
    const actions = variants.map(actionOf);
    expect(actions).toContain('create');
    expect(actions).toContain('connect_signal');
  });

  it('encode per-action required fields in each variant', () => {
    const create = variantsOf(node).find((v) => actionOf(v) === 'create')!;
    expect(create.required).toEqual(expect.arrayContaining(['action', 'parent_path', 'node_name']));
    // node_type / scene_path are the XOR pair, so neither is individually required
    expect(create.required).not.toContain('node_type');
    expect(create.required).not.toContain('scene_path');
  });

  it('keep residual constraints the union cannot express on its own', () => {
    // node create requires exactly one of node_type / scene_path
    expect(node.schema.safeParse({ action: 'create', parent_path: '/r', node_name: 'X' }).success).toBe(false);
    expect(node.schema.safeParse({ action: 'create', parent_path: '/r', node_name: 'X', node_type: 'Sprite2D' }).success).toBe(true);
    expect(
      node.schema.safeParse({ action: 'create', parent_path: '/r', node_name: 'X', node_type: 'Sprite2D', scene_path: 'res://e.tscn' }).success
    ).toBe(false);
    // editor set_viewport_2d requires at least one of center_x / center_y / zoom
    expect(editor.schema.safeParse({ action: 'set_viewport_2d' }).success).toBe(false);
    expect(editor.schema.safeParse({ action: 'set_viewport_2d', zoom: 2 }).success).toBe(true);
  });

  it('reject unknown actions', () => {
    expect(animation.schema.safeParse({ action: 'not_a_real_action' }).success).toBe(false);
  });
});
