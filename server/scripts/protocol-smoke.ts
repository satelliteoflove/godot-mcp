// Protocol smoke test: drives the BUILT server (dist/cli.js) over real stdio
// JSON-RPC and asserts the wire-level contract models depend on — initialize
// metadata, capabilities, the published tool list, humanized validation
// errors, and read-only mode. No Godot editor is required (and none is ever
// started): everything asserted here happens before any bridge call.
//
// The official @modelcontextprotocol/conformance suite targets HTTP servers
// and reference test-tools, so it cannot exercise this stdio domain server;
// this script is the equivalent guard for the surface that matters here.
//
// Run: npm run test:protocol   (after npm run build)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'dist', 'cli.js');

interface JsonRpcMessage {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

function rpc(cliArgs: string[], requests: object[]): Promise<Map<number, JsonRpcMessage>> {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [CLI, ...cliArgs]);
    const responses = new Map<number, JsonRpcMessage>();
    let buffer = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('protocol smoke timed out'));
    }, 15000);

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
        if (!line) continue;
        const message = JSON.parse(line) as JsonRpcMessage;
        if (typeof message.id === 'number') {
          responses.set(message.id, message);
        }
      }
      if (responses.size >= requests.filter((r) => 'id' in r).length) {
        clearTimeout(timer);
        child.kill();
        resolve(responses);
      }
    });
    child.on('error', reject);

    for (const request of requests) {
      child.stdin.write(JSON.stringify(request) + '\n');
    }
  });
}

let failures = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'protocol-smoke', version: '0' },
  },
};
const INITIALIZED = { jsonrpc: '2.0', method: 'notifications/initialized' };

async function main(): Promise<void> {
  if (!existsSync(CLI)) {
    console.error('dist/cli.js not found — run `npm run build` first.');
    process.exit(1);
  }

  console.log('initialize + tools/list (full mode)');
  const full = await rpc([], [
    INIT,
    INITIALIZED,
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'godot_scene', arguments: { action: 'create' } },
    },
  ]);

  const initResult = full.get(1)?.result as
    | { serverInfo?: Record<string, unknown>; capabilities?: Record<string, unknown>; instructions?: string }
    | undefined;
  check('initialize returns serverInfo.name godot-mcp', initResult?.serverInfo?.name === 'godot-mcp');
  check('serverInfo carries a description', typeof initResult?.serverInfo?.description === 'string');
  check(
    'capabilities declare exactly { tools }',
    JSON.stringify(Object.keys(initResult?.capabilities ?? {}).sort()) === '["tools"]'
  );
  check(
    'instructions lead with capability routing',
    (initResult?.instructions ?? '').startsWith('godot-mcp controls a live Godot editor')
  );

  const tools = (full.get(2)?.result?.tools ?? []) as Array<{
    name: string;
    description: string;
    inputSchema: { type?: string; oneOf?: unknown; anyOf?: unknown; allOf?: unknown };
    outputSchema?: unknown;
    annotations?: { title?: string; readOnlyHint?: boolean };
  }>;
  check('tools/list returns 21 tools', tools.length === 21, `got ${tools.length}`);
  check(
    'every inputSchema is a flat object (no oneOf/anyOf/allOf at root)',
    tools.every((t) => t.inputSchema.type === 'object' && !t.inputSchema.oneOf && !t.inputSchema.anyOf && !t.inputSchema.allOf)
  );
  check('no tool declares outputSchema', tools.every((t) => t.outputSchema === undefined));
  check('every tool has a titled annotation', tools.every((t) => typeof t.annotations?.title === 'string'));
  check(
    'every description is under 2KB',
    tools.every((t) => t.description.length < 2000)
  );

  const callResult = full.get(3)?.result as
    | { isError?: boolean; content?: Array<{ type: string; text?: string }> }
    | undefined;
  const errorText = callResult?.content?.[0]?.text ?? '';
  check('invalid tool call returns isError (not a protocol error)', callResult?.isError === true);
  check(
    'validation error is humanized, listing valid actions',
    errorText.includes('unknown action "create"') && errorText.includes('Valid actions: open, save'),
    errorText.slice(0, 120)
  );

  console.log('tools/list (read-only mode, via the --read-only flag)');
  const readOnly = await rpc(['--read-only'], [
    INIT,
    INITIALIZED,
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);
  const roTools = (readOnly.get(2)?.result?.tools ?? []) as Array<{
    name: string;
    annotations?: { readOnlyHint?: boolean };
  }>;
  check('read-only mode registers 12 tools', roTools.length === 12, `got ${roTools.length}`);
  check(
    'every read-only-mode tool is readOnlyHint true',
    roTools.every((t) => t.annotations?.readOnlyHint === true)
  );

  if (failures > 0) {
    console.error(`\n${failures} protocol smoke check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll protocol smoke checks passed.');
}

main().catch((error) => {
  console.error('protocol smoke fatal:', error);
  process.exit(1);
});
