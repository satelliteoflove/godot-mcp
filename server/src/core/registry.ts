import type { AnyToolDefinition, ResourceDefinition, ToolContext } from './types.js';
import { toInputSchema } from './schema.js';
import { formatError } from '../utils/errors.js';

class ToolRegistry {
  private tools: Map<string, AnyToolDefinition> = new Map();
  private resources: Map<string, ResourceDefinition> = new Map();

  registerTool(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerTools(tools: AnyToolDefinition[]): void {
    tools.forEach((tool) => this.registerTool(tool));
  }

  registerResource(resource: ResourceDefinition): void {
    if (this.resources.has(resource.uri)) {
      throw new Error(`Resource '${resource.uri}' already registered`);
    }
    this.resources.set(resource.uri, resource);
  }

  registerResources(resources: ResourceDefinition[]): void {
    resources.forEach((resource) => this.registerResource(resource));
  }

  getToolList(): Array<{ name: string; description: string; inputSchema: object }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toInputSchema(tool.schema),
    }));
  }

  getResourceList(): Array<{
    uri: string;
    name: string;
    description: string;
    mimeType: string;
  }> {
    return Array.from(this.resources.values()).map(
      ({ uri, name, description, mimeType }) => ({
        uri,
        name,
        description,
        mimeType,
      })
    );
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    try {
      const validated = tool.schema.parse(args);
      return await tool.execute(validated, ctx);
    } catch (error) {
      throw new Error(formatError(error));
    }
  }

  async readResource(uri: string, ctx: ToolContext): Promise<string> {
    const resource = this.resources.get(uri);
    if (!resource) {
      throw new Error(`Unknown resource: ${uri}`);
    }
    return await resource.handler(ctx);
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  hasResource(uri: string): boolean {
    return this.resources.has(uri);
  }

  getResourceByUri(uri: string): ResourceDefinition | undefined {
    return this.resources.get(uri);
  }
}

export const registry = new ToolRegistry();
