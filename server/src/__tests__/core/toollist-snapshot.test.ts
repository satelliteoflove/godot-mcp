import { describe, it, expect, beforeAll } from 'vitest';
import { registry } from '../../core/registry.js';
import { registerAllTools } from '../../tools/index.js';

// Toolsnap-style guard (after GitHub's MCP server): one JSON snapshot per tool
// of exactly what models receive from tools/list — the flattened schema, the
// description, the annotations. Any change to a published tool surface shows
// up as a reviewable snapshot diff instead of shipping silently.
//
// To accept an intentional change: npx vitest run -u
describe('published tool list', () => {
  beforeAll(() => {
    registerAllTools();
  });

  it('matches one snapshot per tool', async () => {
    const tools = registry.getToolList();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      await expect(JSON.stringify(tool, null, 2) + '\n').toMatchFileSnapshot(
        `./__toolsnaps__/${tool.name}.json`
      );
    }
  });

  it('snapshot directory has no snapshots for unregistered tools', async () => {
    const { readdirSync, existsSync } = await import('node:fs');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = join(dirname(fileURLToPath(import.meta.url)), '__toolsnaps__');
    if (!existsSync(dir)) return; // fresh checkout before the first snapshot write
    const registered = new Set(registry.getToolList().map((t) => `${t.name}.json`));
    for (const file of readdirSync(dir)) {
      expect(registered.has(file), `stale snapshot: ${file}`).toBe(true);
    }
  });
});
