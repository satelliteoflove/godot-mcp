import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { validateMeshes } from '../../tools/validate-meshes.js';

describe('validate_meshes tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('accepts empty args and bounds max_findings to 1..100', () => {
      expect(validateMeshes.schema.safeParse({}).success).toBe(true);
      expect(validateMeshes.schema.safeParse({ max_findings: 1 }).success).toBe(true);
      expect(validateMeshes.schema.safeParse({ max_findings: 100 }).success).toBe(true);
      expect(validateMeshes.schema.safeParse({ max_findings: 0 }).success).toBe(false);
      expect(validateMeshes.schema.safeParse({ max_findings: 101 }).success).toBe(false);
    });
  });

  it('forwards max_findings with a default of 25', async () => {
    mock.mockResponse({ checked_meshes: 1, checked_surfaces: 1, total_findings: 0, findings: [] });
    await validateMeshes.execute({}, createToolContext(mock));
    expect(mock.calls[0].command).toBe('validate_meshes');
    expect(mock.calls[0].params.max_findings).toBe(25);

    mock.mockResponse({ checked_meshes: 1, checked_surfaces: 1, total_findings: 0, findings: [] });
    await validateMeshes.execute({ max_findings: 7 }, createToolContext(mock));
    expect(mock.calls[1].params.max_findings).toBe(7);
  });

  it('returns a clean bill naming what was ruled out when surfaces were checked', async () => {
    mock.mockResponse({ checked_meshes: 12, checked_surfaces: 16, total_findings: 0, findings: [] });
    const result = await validateMeshes.execute({}, createToolContext(mock));
    expect(typeof result).toBe('string');
    expect(result as string).toContain('no integrity problems');
    expect(result as string).toContain('12 meshes');
  });

  it('does NOT claim a clean bill when nothing was checked', async () => {
    // "Checked 0 meshes - no problems" would rule things out on zero
    // evidence, the exact confident-lie failure mode the tool exists to stop.
    mock.mockResponse({ checked_meshes: 0, checked_surfaces: 0, total_findings: 0, findings: [] });
    const result = await validateMeshes.execute({}, createToolContext(mock));
    expect(typeof result).toBe('string');
    expect(result as string).not.toContain('no integrity problems');
    expect(result as string).toContain('NOT a clean bill');
  });

  it('surfaces the bridge note when nothing was checked for a stated reason', async () => {
    mock.mockResponse({ checked_meshes: 0, checked_surfaces: 0, total_findings: 0, findings: [], note: 'no current scene' });
    const result = await validateMeshes.execute({}, createToolContext(mock));
    expect(result as string).toContain('no current scene');
  });

  it('returns findings as structured content', async () => {
    const payload = {
      checked_meshes: 3,
      checked_surfaces: 4,
      total_findings: 1,
      findings: [
        {
          node: 'World/Level/Floor',
          surface: 0,
          severity: 'error',
          kind: 'dropped_triangles',
          stat: '132 of 199 vertices (66%) are never referenced by the index buffer',
          fix: 'Deindex the source first',
        },
      ],
    };
    mock.mockResponse(payload);
    const result = await validateMeshes.execute({}, createToolContext(mock));
    expect(structuredOf(result)).toEqual(payload);
  });

  it('propagates errors from Godot', async () => {
    mock.mockError(new Error('No game is currently running'));
    await expect(validateMeshes.execute({}, createToolContext(mock))).rejects.toThrow('No game is currently running');
  });
});
