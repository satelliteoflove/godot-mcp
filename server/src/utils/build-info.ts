import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// A stale `dist` looks exactly like a fresh one from the outside: package.json
// carries the version, so addon_status reports versions_match: true while the
// running code predates the last edit. The build writes a hash of the source
// tree into dist/build-info.json; at runtime, when src/ sits beside dist/ (a
// source checkout — npm installs don't ship src), the hash is recomputed and
// compared. Nothing here is on the hot path: it runs once at startup and on
// addon_status.

export interface BuildInfo {
  version: string;
  built_at: string;
  source_hash: string;
}

export interface BuildFreshness {
  // 'dist' = running compiled output; 'source' = running .ts directly (tsx),
  // which is fresh by construction; 'packaged' = dist without src beside it.
  mode: 'dist' | 'source' | 'packaged';
  built_at?: string;
  stale: boolean;
  // Files whose contents differ from what was built, when determinable.
  changed?: string[];
  reason?: string;
}

function walkTs(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full);
  }
}

// Per-file content hashes keyed by path relative to srcDir (posix separators).
export function hashSourceFiles(srcDir: string): Record<string, string> {
  const files: string[] = [];
  walkTs(srcDir, files);
  files.sort();
  const out: Record<string, string> = {};
  for (const f of files) {
    const rel = relative(srcDir, f).split(sep).join('/');
    out[rel] = createHash('sha1').update(readFileSync(f)).digest('hex');
  }
  return out;
}

export function computeSourceHash(srcDir: string): string {
  const perFile = hashSourceFiles(srcDir);
  const h = createHash('sha1');
  for (const [rel, digest] of Object.entries(perFile)) h.update(`${rel}\0${digest}\n`);
  return h.digest('hex');
}

export function writeBuildInfoObject(version: string, srcDir: string, now: Date = new Date()): BuildInfo & { files: Record<string, string> } {
  return {
    version,
    built_at: now.toISOString(),
    source_hash: computeSourceHash(srcDir),
    files: hashSourceFiles(srcDir),
  };
}

// Where this module lives at runtime: <root>/dist/utils or <root>/src/utils.
function moduleDir(): string {
  return fileURLToPath(new URL('.', import.meta.url));
}

export function checkBuildFreshness(here: string = moduleDir()): BuildFreshness {
  const parent = dirname(here.replace(/[\\/]+$/, ''));
  const parentName = basename(parent);
  if (parentName !== 'dist') {
    return { mode: 'source', stale: false };
  }
  const root = dirname(parent);
  const srcDir = join(root, 'src');
  const infoPath = join(parent, 'build-info.json');
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    return { mode: 'packaged', stale: false, ...(existsSync(infoPath) ? { built_at: readInfo(infoPath)?.built_at } : {}) };
  }
  const info = existsSync(infoPath) ? readInfo(infoPath) : undefined;
  if (!info) {
    return { mode: 'dist', stale: true, reason: 'dist/build-info.json is missing — dist predates the build stamp; run `npm run build` in server/' };
  }
  const current = hashSourceFiles(srcDir);
  const changed: string[] = [];
  const built = info.files ?? {};
  for (const [rel, digest] of Object.entries(current)) {
    if (built[rel] !== digest) changed.push(rel);
  }
  for (const rel of Object.keys(built)) {
    if (!(rel in current)) changed.push(`${rel} (removed)`);
  }
  if (changed.length === 0) {
    return { mode: 'dist', built_at: info.built_at, stale: false };
  }
  return {
    mode: 'dist',
    built_at: info.built_at,
    stale: true,
    changed,
    reason: `${changed.length} source file(s) changed since dist was built at ${info.built_at}; run \`npm run build\` in server/ and reconnect`,
  };
}

function readInfo(path: string): (BuildInfo & { files?: Record<string, string> }) | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return undefined;
  }
}
