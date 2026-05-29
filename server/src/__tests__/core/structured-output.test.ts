import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../core/registry.js';
import { registerAllTools } from '../../tools/index.js';
import { structured, isStructuredResult } from '../../core/structured.js';
import { resource } from '../../tools/resource.js';
import { createMockGodot, createToolContext } from '../helpers/mock-godot.js';

describe('structured tool output', () => {
  beforeAll(() => {
    registerAllTools();
  });

  const byName = () => new Map(registry.getToolList().map((t) => [t.name, t]));

  it('structured() renders compact JSON text alongside the object', () => {
    const data = { a: 1, b: { c: 2 } };
    const result = structured(data);
    expect(result.text).toBe('{"a":1,"b":{"c":2}}');
    expect(result.structuredContent).toEqual(data);
  });

  it('isStructuredResult recognizes a structured result', () => {
    expect(isStructuredResult(structured({ x: 1 }))).toBe(true);
  });

  it('isStructuredResult rejects a plain string result', () => {
    expect(isStructuredResult('Opened scene: res://main.tscn')).toBe(false);
  });

  it('isStructuredResult rejects text and image content items', () => {
    expect(isStructuredResult({ type: 'text', text: 'hi' })).toBe(false);
    expect(isStructuredResult({ type: 'image', data: 'x', mimeType: 'image/png' })).toBe(false);
  });

  it('advertises outputSchema for godot_resource', () => {
    const tool = byName().get('godot_resource');
    const schema = tool?.outputSchema as { type?: string; required?: string[] } | undefined;
    expect(schema?.type).toBe('object');
    expect(schema?.required).toEqual(expect.arrayContaining(['resource_path', 'resource_type']));
  });

  it('omits outputSchema for tools that do not define one', () => {
    expect(byName().get('godot_scene')).not.toHaveProperty('outputSchema');
  });

  it('resource get_info returns a structured result, not a string', async () => {
    const mock = createMockGodot();
    mock.mockResponse({ resource_path: 'res://x.tres', resource_type: 'Resource' });
    const result = await resource.execute(
      { action: 'get_info', resource_path: 'res://x.tres' },
      createToolContext(mock)
    );
    expect(isStructuredResult(result)).toBe(true);
  });

  it('resource get_info structuredContent matches the Godot payload', async () => {
    const mock = createMockGodot();
    const payload = { resource_path: 'res://x.tres', resource_type: 'Texture2D', properties: { width: 64 } };
    mock.mockResponse(payload);
    const result = await resource.execute(
      { action: 'get_info', resource_path: 'res://x.tres' },
      createToolContext(mock)
    );
    expect(isStructuredResult(result) && result.structuredContent).toEqual(payload);
  });

  it('resource get_info text fallback is compact JSON of the payload', async () => {
    const mock = createMockGodot();
    const payload = { resource_path: 'res://x.tres', resource_type: 'Resource' };
    mock.mockResponse(payload);
    const result = await resource.execute(
      { action: 'get_info', resource_path: 'res://x.tres' },
      createToolContext(mock)
    );
    expect(isStructuredResult(result) && result.text).toBe(JSON.stringify(payload));
  });
});
