import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeBuildInfoObject } from '../src/utils/build-info.js';

// Stamp dist with a hash of the source it was built from, so a server running
// from an unbuilt checkout can say so (addon_status server_build).
const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8')) as { version: string };
const info = writeBuildInfoObject(pkg.version, resolve(root, 'src'));
writeFileSync(resolve(root, 'dist', 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`build-info written: ${info.source_hash.slice(0, 12)} @ ${info.built_at}`);
