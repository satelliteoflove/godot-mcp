import type {
  AnyToolDefinition,
  ToolAnnotations,
  ToolContext,
  ToolExecuteResult,
} from './types.js';
import { z } from 'zod';
import { describeValidationError, toInputSchema } from './schema.js';
import { isStructuredResult } from './structured.js';
import {
  formatError,
  GodotCommandError,
  GodotConnectionError,
  GodotTimeoutError,
} from '../utils/errors.js';
import { logToolUsage, categorizeError } from '../utils/usage-logger.js';

class ToolRegistry {
  private tools: Map<string, AnyToolDefinition> = new Map();

  registerTool(tool: AnyToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  registerTools(tools: AnyToolDefinition[]): void {
    tools.forEach((tool) => this.registerTool(tool));
  }

  getToolList(): Array<{
    name: string;
    description: string;
    inputSchema: object;
    annotations?: ToolAnnotations;
  }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toInputSchema(tool.schema),
      ...(tool.annotations ? { annotations: tool.annotations } : {}),
    }));
  }

  async executeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecuteResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const startTime = performance.now();
    let success = false;
    let responseBytes = 0;
    let errorType: string | undefined;

    try {
      const validated = tool.schema.parse(args);
      const result = await tool.execute(validated, ctx);
      success = true;
      const responseText =
        typeof result === 'string'
          ? result
          : isStructuredResult(result)
            ? result.text
            : JSON.stringify(result);
      responseBytes = Buffer.byteLength(responseText, 'utf-8');
      return result;
    } catch (error) {
      errorType = categorizeError(error);
      if (
        error instanceof GodotCommandError ||
        error instanceof GodotConnectionError ||
        error instanceof GodotTimeoutError
      ) {
        throw error;
      }
      if (error instanceof z.ZodError) {
        throw new Error(describeValidationError(name, tool.schema, args, error));
      }
      throw new Error(formatError(error));
    } finally {
      const durationMs = performance.now() - startTime;
      logToolUsage(name, args, success, durationMs, responseBytes, errorType);
    }
  }

}

export const registry = new ToolRegistry();
