import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { computeSourceHash, hashSourceFiles, writeBuildInfoObject, checkBuildFreshness } from '../../utils/build-info.js';

describe('build-info', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'godot-mcp-build-'));
    mkdirSync(join(root, 'src', 'utils'), { recursive: true });
    mkdirSync(join(root, 'src', '__tests__'), { recursive: true });
    mkdirSync(join(root, 'dist', 'utils'), { recursive: true });
    writeFileSync(join(root, 'src', 'a.ts'), 'export const a = 1;\n');
    writeFileSync(join(root, 'src', 'utils', 'b.ts'), 'export const b = 2;\n');
    writeFileSync(join(root, 'src', '__tests__', 'x.test.ts'), 'test\n');
    writeFileSync(join(root, 'src', 'types.d.ts'), 'declare const q: number;\n');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('hashes source .ts files, skipping tests and declarations', () => {
    const files = hashSourceFiles(join(root, 'src'));
    expect(Object.keys(files).sort()).toEqual(['a.ts', 'utils/b.ts']);
  });

  it('changes the tree hash when a file changes', () => {
    const before = computeSourceHash(join(root, 'src'));
    writeFileSync(join(root, 'src', 'utils', 'b.ts'), 'export const b = 3;\n');
    expect(computeSourceHash(join(root, 'src'))).not.toBe(before);
  });

  it('reports source mode when not running from dist', () => {
    expect(checkBuildFreshness(join(root, 'src', 'utils') + '/')).toEqual({ mode: 'source', stale: false });
  });

  it('reports packaged when dist has no src beside it', () => {
    rmSync(join(root, 'src'), { recursive: true });
    expect(checkBuildFreshness(join(root, 'dist', 'utils') + '/').mode).toBe('packaged');
  });

  it('is stale when dist has no build stamp', () => {
    const r = checkBuildFreshness(join(root, 'dist', 'utils') + '/');
    expect(r.stale).toBe(true);
    expect(r.reason).toContain('build-info.json is missing');
  });

  it('is fresh when the stamp matches src, stale with the changed files once src moves on', () => {
    const info = writeBuildInfoObject('9.9.9', join(root, 'src'), new Date('2026-08-26T00:35:00Z'));
    writeFileSync(join(root, 'dist', 'build-info.json'), JSON.stringify(info));
    const fresh = checkBuildFreshness(join(root, 'dist', 'utils') + '/');
    expect(fresh).toEqual({ mode: 'dist', built_at: '2026-08-26T00:35:00.000Z', stale: false });

    writeFileSync(join(root, 'src', 'utils', 'b.ts'), 'export const b = 3;\n');
    writeFileSync(join(root, 'src', 'c.ts'), 'export const c = 1;\n');
    const stale = checkBuildFreshness(join(root, 'dist', 'utils') + '/');
    expect(stale.stale).toBe(true);
    expect(stale.changed).toEqual(['c.ts', 'utils/b.ts']);
    expect(stale.reason).toContain('2 source file(s) changed since dist was built at 2026-08-26T00:35:00.000Z');
    expect(stale.reason).toContain('npm run build');
  });
});
