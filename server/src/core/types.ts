import type { z } from 'zod';
import type { GodotConnection } from '../connection/websocket.js';

export interface ToolContext {
  godot: GodotConnection;
}

export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<string>;
}

export interface AnyToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType;
  execute: (args: unknown, ctx: ToolContext) => Promise<string>;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (ctx: ToolContext) => Promise<string>;
}
