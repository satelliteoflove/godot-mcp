import { describe, it, expect } from 'vitest';
import { toInputSchema } from '../../core/schema.js';
import { node } from '../../tools/node.js';
import { animation } from '../../tools/animation.js';
import { editor } from '../../tools/editor.js';

type JsonSchema = Record<string, unknown>;

const schemaOf = (tool: { schema: Parameters<typeof toInputSchema>[0] }): JsonSchema =>
  toInputSchema(tool.schema) as JsonSchema;

const actionEnumOf = (schema: JsonSchema): string[] =>
  ((schema.properties as JsonSchema).action as JsonSchema).enum as string[];

describe('discriminated-union tool schemas', () => {
  it('serialize to a flat object schema with an action enum', () => {
    const schema = schemaOf(node);
    expect(schema.type).toBe('object');
    const actions = actionEnumOf(schema);
    expect(Array.isArray(actions)).toBe(true);
    expect(actions).toHaveLength(5);
    expect(actions).toContain('get_scene_tree');
    expect(actions).toContain('reparent');
  });

  it('mark action as the only required field; action-specific fields are optional', () => {
    const schema = schemaOf(node);
    expect(schema.required).toEqual(['action']);
    const props = schema.properties as JsonSchema;
    // action-specific fields are present as optional top-level properties
    expect(props).toHaveProperty('node_path');
    expect(props).toHaveProperty('new_parent_path');
    expect(props).toHaveProperty('properties');
  });

  it('keep residual constraints the union cannot express on its own', () => {
    // node find requires name_pattern and/or type
    expect(node.schema.safeParse({ action: 'find' }).success).toBe(false);
    expect(node.schema.safeParse({ action: 'find', type: 'Area2D' }).success).toBe(true);
    // editor set_viewport_2d requires at least one of center_x / center_y / zoom
    expect(editor.schema.safeParse({ action: 'set_viewport_2d' }).success).toBe(false);
    expect(editor.schema.safeParse({ action: 'set_viewport_2d', zoom: 2 }).success).toBe(true);
  });

  it('reject unknown actions', () => {
    expect(animation.schema.safeParse({ action: 'not_a_real_action' }).success).toBe(false);
  });
});
