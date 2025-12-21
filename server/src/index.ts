import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { initializeConnection } from './connection/websocket.js';
import { sceneTools, handleSceneTool } from './tools/scene.js';
import { nodeTools, handleNodeTool } from './tools/node.js';
import { scriptTools, handleScriptTool } from './tools/script.js';
import { editorTools, handleEditorTool } from './tools/editor.js';
import { projectTools, handleProjectTool } from './tools/project.js';
import { sceneResources, handleSceneResource } from './resources/scene.js';
import { scriptResources, handleScriptResource } from './resources/script.js';

const allTools = [
  ...sceneTools,
  ...nodeTools,
  ...scriptTools,
  ...editorTools,
  ...projectTools,
];

const allResources = [
  ...sceneResources,
  ...scriptResources,
];

async function main() {
  const server = new Server(
    {
      name: 'godot-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: allTools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      if (sceneTools.some(t => t.name === name)) {
        result = await handleSceneTool(name, args ?? {});
      } else if (nodeTools.some(t => t.name === name)) {
        result = await handleNodeTool(name, args ?? {});
      } else if (scriptTools.some(t => t.name === name)) {
        result = await handleScriptTool(name, args ?? {});
      } else if (editorTools.some(t => t.name === name)) {
        result = await handleEditorTool(name, args ?? {});
      } else if (projectTools.some(t => t.name === name)) {
        result = await handleProjectTool(name, args ?? {});
      } else {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [{ type: 'text', text: result }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: allResources };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    try {
      let content: string;

      if (uri.startsWith('godot://scene/')) {
        content = await handleSceneResource(uri);
      } else if (uri.startsWith('godot://script/')) {
        content = await handleScriptResource(uri);
      } else {
        throw new Error(`Unknown resource: ${uri}`);
      }

      return {
        contents: [{ uri, mimeType: 'application/json', text: content }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to read resource: ${message}`);
    }
  });

  await initializeConnection();

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[godot-mcp] Server started');
}

main().catch((error) => {
  console.error('[godot-mcp] Fatal error:', error);
  process.exit(1);
});
