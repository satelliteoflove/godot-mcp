import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeConnection, getGodotConnection } from './connection/websocket.js';
import { registry } from './core/registry.js';
import { isStructuredResult } from './core/structured.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { GodotCommandError } from './utils/errors.js';
import { setMcpServer, logger } from './utils/logger.js';
import { getServerVersion } from './version.js';

registerAllTools();
registerAllResources();

export async function main() {
  const server = new Server(
    {
      name: 'godot-mcp',
      version: getServerVersion(),
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
      // Injected into the client's context at connect time: the traps below
      // produce NO error anywhere, so guidance must arrive before the symptom
      // is misread (e.g. "too dark" tuned as lighting when the mesh data is
      // corrupt). Keep this short — it is paid by every session.
      instructions:
        'Godot pitfalls that produce no errors: ' +
        '(1) If 3D rendering looks wrong with nothing in any log (black/too-dark surfaces, ' +
        'invisible or one-sided walls/floors, lighting that ignores light changes), run ' +
        'godot_validate_meshes BEFORE tuning lights or materials — procedurally generated ' +
        'meshes are often silently corrupt (winding, dropped triangles, bad tangents). ' +
        '(2) SDFGI replaces constant ambient light: to lift shadow sides, add a dim ' +
        'shadowless DirectionalLight (light_specular=0) opposing the key light instead of ' +
        'raising ambient_light_energy, which will appear to do nothing. ' +
        '(3) After editing .gd files on disk, run godot_editor restart — the editor does ' +
        'not reliably rescan externally modified scripts.',
    }
  );

  setMcpServer(server);

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

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: registry.getResourceList() };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    const godot = getGodotConnection();
    const resource = registry.getResourceByUri(uri);

    try {
      const content = await registry.readResource(uri, { godot });
      return {
        contents: [{ uri, mimeType: resource?.mimeType ?? 'application/json', text: content }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read resource: ${message}`);
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
