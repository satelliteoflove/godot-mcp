import { rmSync, cpSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const src = resolve(process.cwd(), '../godot/addons/godot_mcp');
const dest = resolve(process.cwd(), 'addon');

rmSync(dest, { recursive: true, force: true });
// Ship everything except the dev-only headless test fixtures
// (godot/addons/godot_mcp/test/), which consumers don't need.
cpSync(src, dest, {
  recursive: true,
  filter: (source) => {
    const rel = relative(src, source);
    return rel === '' || rel.split(sep)[0] !== 'test';
  },
});
console.log(`addon copied: ${src} → ${dest}`);
