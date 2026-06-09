import type { z } from 'zod';
import type { GodotConnection } from '../connection/websocket.js';

export interface ToolContext {
  godot: GodotConnection;
}

export type TextContent = { type: 'text'; text: string };
export type ImageContent = { type: 'image'; data: string; mimeType: string };
export type ToolResult = TextContent | ImageContent;

// A query result that carries both a text rendering (for clients without
// structured-output support) and the structured object (emitted as the MCP
// result's `structuredContent`). Additive: the text is the fallback.
export interface StructuredToolResult {
  text: string;
  structuredContent: Record<string, unknown>;
}

// An ordered list of content blocks returned as the MCP result's `content`
// array, for a single call that yields several observations at once — e.g. a
// text summary followed by several captured frames (godot_input sequence).
export type MultiContentResult = ToolResult[];

export type ToolExecuteResult = string | ToolResult | MultiContentResult | StructuredToolResult;

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
  outputSchema?: z.ZodType;
  execute: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolExecuteResult>;
}

export interface AnyToolDefinition {
  name: string;
  description: string;
  annotations?: ToolAnnotations;
  schema: z.ZodType;
  outputSchema?: z.ZodType;
  execute: (args: unknown, ctx: ToolContext) => Promise<ToolExecuteResult>;
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
