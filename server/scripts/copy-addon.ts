import { rmSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';

const src = resolve(process.cwd(), '../godot/addons/godot_mcp');
const dest = resolve(process.cwd(), 'addon');

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`addon copied: ${src} → ${dest}`);
