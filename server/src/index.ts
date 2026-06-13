import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

export async function main() {
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
        'godot-mcp controls a live Godot editor and the game it runs: open/save scenes, ' +
        'inspect and edit nodes, animations, tilemaps, and gridmaps, read project settings ' +
        'and engine-computed 3D data, run the game and drive it like a player (input ' +
        'injection, frozen game-time stepping, in-game GDScript for scenario setup), and ' +
        'observe it cheaply (runtime-state digests instead of screenshots, profiler, editor ' +
        'logs). Reach for godot_* tools whenever a task touches a Godot project; all ' +
        'godot_*_read tools are safe to auto-allow. Requires the editor to be open with the ' +
        'godot-mcp addon enabled. ' +
        'Godot pitfalls that produce no errors: ' +
        '(1) If 3D rendering looks wrong with nothing in any log (black/too-dark surfaces, ' +
        'invisible or one-sided walls/floors, lighting that ignores light changes), run ' +
        'godot_validate_meshes BEFORE tuning lights or materials — procedurally generated ' +
        'meshes are often silently corrupt (winding, dropped triangles, bad tangents). ' +
        '(2) SDFGI replaces constant ambient light: to lift shadow sides, add a dim ' +
        'shadowless DirectionalLight (light_specular=0) opposing the key light instead of ' +
        'raising ambient_light_energy, which will appear to do nothing. ' +
        '(3) After editing .gd files on disk, run godot_editor_edit restart — the editor ' +
        'does not reliably rescan externally modified scripts. ' +
        '(4) After editing project.godot on disk, run godot_project check_stale — the ' +
        'editor never re-reads it on its own.',
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

  await initializeConnection();

  const transport = new StdioServerTransport();
  await server.connect(transport);

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
}
