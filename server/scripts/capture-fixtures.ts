import { WebSocket } from 'ws';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../src/__tests__/fixtures');

const GODOT_HOST = process.env.GODOT_HOST || 'localhost';
const GODOT_PORT = process.env.GODOT_PORT || '6550';

interface GodotResponse {
  status: 'success' | 'error';
  result?: unknown;
  error?: { code: string; message: string };
}

async function sendCommand(
  ws: WebSocket,
  command: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = Date.now().toString();
    const message = JSON.stringify({ id, command, params });

    const handler = (data: Buffer) => {
      const response = JSON.parse(data.toString()) as { id: string } & GodotResponse;
      if (response.id === id) {
        ws.off('message', handler);
        if (response.status === 'error') {
          reject(new Error(response.error?.message || 'Unknown error'));
        } else {
          resolve(response.result);
        }
      }
    };

    ws.on('message', handler);
    ws.send(message);
  });
}

async function captureFixture(
  ws: WebSocket,
  name: string,
  command: string,
  params: Record<string, unknown>
): Promise<void> {
  console.log(`Capturing ${name}...`);
  try {
    const result = await sendCommand(ws, command, params);
    const filepath = join(FIXTURES_DIR, `${name}.json`);
    writeFileSync(filepath, JSON.stringify(result, null, 2));
    console.log(`  Saved: ${filepath}`);
  } catch (err) {
    console.error(`  Error: ${err}`);
  }
}

async function main(): Promise<void> {
  if (!existsSync(FIXTURES_DIR)) {
    mkdirSync(FIXTURES_DIR, { recursive: true });
  }

  const ws = new WebSocket(`ws://${GODOT_HOST}:${GODOT_PORT}`);

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  console.log('Connected to Godot\n');

  await captureFixture(ws, 'resource-spriteframes', 'get_resource_info', {
    resource_path: 'res://player/player_sprites.tres',
    max_depth: 1,
    include_internal: false,
  });

  await captureFixture(ws, 'resource-spriteframes-depth0', 'get_resource_info', {
    resource_path: 'res://player/player_sprites.tres',
    max_depth: 0,
    include_internal: false,
  });

  await captureFixture(ws, 'resource-texture', 'get_resource_info', {
    resource_path: 'res://sprites/player/open_gunner_hero.png',
    max_depth: 1,
    include_internal: false,
  });

  await captureFixture(ws, 'resource-not-found', 'get_resource_info', {
    resource_path: 'res://nonexistent.tres',
    max_depth: 1,
    include_internal: false,
  });

  ws.close();
  console.log('\nDone!');
}

main().catch(console.error);
