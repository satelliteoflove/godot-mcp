import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toInputSchema } from '../core/schema.js';

describe('toInputSchema', () => {
  it('converts simple object schema', () => {
    const schema = z.object({
      name: z.string(),
    });

    const result = toInputSchema(schema);

    expect(result).toHaveProperty('type', 'object');
    expect(result).toHaveProperty('properties');
    expect((result as Record<string, unknown>).properties).toHaveProperty('name');
  });

  it('converts schema with optional fields', () => {
    const schema = z.object({
      required_field: z.string(),
      optional_field: z.string().optional(),
    });

    const result = toInputSchema(schema) as Record<string, unknown>;

    expect(result.required).toContain('required_field');
    expect(result.required).not.toContain('optional_field');
  });

  it('converts schema with descriptions', () => {
    const schema = z.object({
      path: z.string().describe('The file path'),
    });

    const result = toInputSchema(schema) as Record<string, unknown>;
    const properties = result.properties as Record<string, unknown>;
    const pathProp = properties.path as Record<string, unknown>;

    expect(pathProp.description).toBe('The file path');
  });

  it('converts nested object schema', () => {
    const schema = z.object({
      node: z.object({
        name: z.string(),
        type: z.string(),
      }),
    });

    const result = toInputSchema(schema) as Record<string, unknown>;
    const properties = result.properties as Record<string, unknown>;
    const nodeProp = properties.node as Record<string, unknown>;

    expect(nodeProp.type).toBe('object');
    expect(nodeProp.properties).toHaveProperty('name');
    expect(nodeProp.properties).toHaveProperty('type');
  });

  it('converts boolean schema', () => {
    const schema = z.object({
      enabled: z.boolean(),
    });

    const result = toInputSchema(schema) as Record<string, unknown>;
    const properties = result.properties as Record<string, unknown>;
    const enabledProp = properties.enabled as Record<string, unknown>;

    expect(enabledProp.type).toBe('boolean');
  });

  it('removes $schema property from output', () => {
    const schema = z.object({ test: z.string() });

    const result = toInputSchema(schema);

    expect(result).not.toHaveProperty('$schema');
  });

  it('converts empty object schema', () => {
    const schema = z.object({});

    const result = toInputSchema(schema) as Record<string, unknown>;

    expect(result.type).toBe('object');
    expect(result.properties).toEqual({});
  });
});
