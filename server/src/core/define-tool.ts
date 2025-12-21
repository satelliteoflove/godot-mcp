import type { z } from 'zod';
import type { ToolDefinition, ToolContext, ToolResult } from './types.js';

export function defineTool<TSchema extends z.ZodType>(config: {
  name: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<string | ToolResult>;
}): ToolDefinition<TSchema> {
  return config;
}
