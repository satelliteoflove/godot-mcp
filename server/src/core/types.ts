import type { z } from 'zod';
import type { GodotConnection } from '../connection/websocket.js';

export interface ToolContext {
  godot: GodotConnection;
}

export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ToolResult = TextContent | ImageContent;

// MCP tool annotations: advisory hints clients use to label tools and decide
// auto-approval. See the MCP spec's ToolAnnotations.
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<TSchema extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  schema: TSchema;
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<string | ToolResult>;
}

export interface AnyToolDefinition {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  schema: z.ZodType;
  execute: (args: unknown, ctx: ToolContext) => Promise<string | ToolResult>;
}

export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (ctx: ToolContext) => Promise<string>;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}
