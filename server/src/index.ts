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
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { GodotCommandError } from './utils/errors.js';
import { setMcpServer, logger } from './utils/logger.js';

registerAllTools();
registerAllResources();

export async function main() {
  const server = new Server(
    {
      name: 'godot-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {},
      },
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

  logger.info('Server started');
}

