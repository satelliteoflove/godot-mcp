import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeConnection, getGodotConnection } from './connection/websocket.js';
import { registry } from './core/registry.js';
import { isStructuredResult } from './core/structured.js';
import { registerAllTools } from './tools/index.js';
import { GodotCommandError } from './utils/errors.js';
import { logger } from './utils/logger.js';
import { getServerVersion } from './version.js';

function isReadOnlyMode(): boolean {
  const envValue = process.env.GODOT_MCP_READ_ONLY;
  return envValue === '1' || envValue?.toLowerCase() === 'true';
}

// Seams for tests. Production uses the real stdio transport and the real Godot
// WebSocket setup; a test can inject a fake transport and a connect step that
// never resolves to prove startup does not block on Godot (see #319).
export interface MainDeps {
  createTransport?: () => Transport;
  connectGodot?: () => Promise<void>;
}

export async function main(deps: MainDeps = {}) {
  const createTransport = deps.createTransport ?? (() => new StdioServerTransport());
  const connectGodot = deps.connectGodot ?? initializeConnection;
  const readOnly = isReadOnlyMode();
  registerAllTools({ readOnly });
  if (readOnly) {
    logger.warning('Read-only mode: write tools are not registered');
  }
  const server = new Server(
    {
      name: 'godot-mcp',
      title: 'Godot MCP',
      version: getServerVersion(),
      description:
        'Eyes and hands in the Godot editor and the running game: scene and node editing, ' +
        'input injection, deterministic game-time control, and live runtime state for ' +
        'agent-driven playtesting.',
      websiteUrl: 'https://github.com/satelliteoflove/godot-mcp',
    },
    {
      capabilities: {
        tools: {},
      },
      // Injected into the client's context at connect time. With tool search
      // deferring schemas, this is the primary session-start surface: lead
      // with WHAT the tools cover (so search routes here), then the pitfalls
      // that produce no error anywhere and get misread without warning.
      // Keep under 2KB — Claude Code truncates beyond that.
      instructions:
        (readOnly
          ? 'godot-mcp is running in READ-ONLY mode: only observation tools are registered ' +
            '(no scene/node/animation edits, no running or stopping the game, no input ' +
            'injection, no in-game GDScript). godot-mcp observes a live Godot editor and ' +
            'the game it runs: '
          : 'godot-mcp controls a live Godot editor and the game it runs: open/save scenes, ' +
            'inspect and edit nodes, animations, tilemaps, and gridmaps, run the game and ' +
            'drive it like a player (input injection, frozen game-time stepping, in-game ' +
            'GDScript for scenario setup), and observe it cheaply: ') +
        'read project settings, engine-computed 3D data, runtime-state digests instead of ' +
        'screenshots, profiler data, and editor logs. Reach for godot_* tools whenever a ' +
        'task touches a Godot project; all godot_*_read tools are safe to auto-allow. ' +
        'Requires the editor to be open with the godot-mcp addon enabled. ' +
        'Godot pitfalls that produce no errors: ' +
        '(1) If 3D rendering looks wrong with nothing in any log (black/too-dark surfaces, ' +
        'invisible or one-sided walls/floors, lighting that ignores light changes), run ' +
        'godot_validate_meshes BEFORE tuning lights or materials — procedurally generated ' +
        'meshes are often silently corrupt (winding, dropped triangles, bad tangents). ' +
        '(2) SDFGI replaces constant ambient light: to lift shadow sides, add a dim ' +
        'shadowless DirectionalLight (light_specular=0) opposing the key light instead of ' +
        'raising ambient_light_energy, which will appear to do nothing. ' +
        'Screenshots never decay — each frame persists in context every later turn — so capture ' +
        'the fewest at a modest width and only to judge APPEARANCE; prefer godot_runtime_state ' +
        'digests (text, ~free) for value checks. ' +
        (readOnly
          ? '(3) The running editor can hold stale @tool/addon code or an out-of-date ' +
            'project.godot after external edits (godot_project check_stale detects the ' +
            'latter); clearing it needs an editor restart, which is the user\'s call in ' +
            'read-only mode.'
          : '(3) To TEST edited .gd code, just godot_editor_edit stop then run — the ' +
            'launched game loads scripts fresh from disk, so no restart is needed. Use ' +
            'restart only for EDITOR-side staleness: edited @tool/addon/plugin code, or a ' +
            '.gdshader the editor still renders from a cached compile. ' +
            '(4) After editing project.godot on disk, run godot_project check_stale (the ' +
            'editor never re-reads it); restart to apply changed autoloads/input map.'),
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: registry.getToolList() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const godot = getGodotConnection();

    try {
      const result = await registry.executeTool(name, args ?? {}, { godot });
      if (typeof result === 'string') {
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      // An array is a multi-content result (text + image blocks in order) —
      // checked before isStructuredResult since arrays are objects too.
      if (Array.isArray(result)) {
        return {
          content: result,
        };
      }
      if (isStructuredResult(result)) {
        return {
          content: [{ type: 'text', text: result.text }],
          structuredContent: result.structuredContent,
        };
      }
      return {
        content: [result],
      };
    } catch (error) {
      let message: string;
      if (error instanceof GodotCommandError) {
        message = `[${error.code}] ${error.message}`;
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Connect the MCP transport FIRST, before touching Godot. The tool list is
  // already registered above and does not depend on Godot being reachable, so
  // the client's initialize + tools/list exchange must complete immediately.
  // Awaiting the Godot connection here instead (the old order) coupled the MCP
  // handshake to the WebSocket connect: when Godot is unreachable in a way that
  // does not fail fast — e.g. a WSL2 client hitting a Windows host whose
  // firewall drops the SYN, so the TCP connect hangs to its full timeout — the
  // handshake stalled past the client's MCP startup deadline, the client cached
  // an empty tool list, and the only recovery was a manual reconnect (#319).
  await server.connect(createTransport());

  let isShuttingDown = false;
  const gracefulShutdown = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info('Shutting down');
    try {
      getGodotConnection().disconnect();
    } catch {
      // Connection may not exist yet
    }
    setTimeout(() => process.exit(0), 500);
  };

  process.stdin.on('end', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
  server.onclose = gracefulShutdown;

  logger.info('Server started');

  // Now reach for Godot, in the background. initializeConnection swallows its
  // own connect failures and schedules reconnects, so this never rejects and
  // never blocks the already-live transport. A tool called before Godot is up
  // returns the connection diagnostic (see GodotConnection.getDiagnosticMessage).
  void connectGodot().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Background Godot connection setup failed', { error: message });
  });
}
