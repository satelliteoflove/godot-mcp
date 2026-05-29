import type { StructuredToolResult } from './types.js';

// Wrap a query payload so the tool result carries both a compact-JSON text
// rendering (the fallback for clients without structured-output support) and
// the object itself as MCP `structuredContent`.
export function structured(data: unknown): StructuredToolResult {
  return {
    text: JSON.stringify(data),
    structuredContent: data as Record<string, unknown>,
  };
}

export function isStructuredResult(value: unknown): value is StructuredToolResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'structuredContent' in value &&
    'text' in value
  );
}
