import type { ResourceDefinition, ToolContext } from './types.js';

export function defineResource(config: {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  handler: (ctx: ToolContext) => Promise<string>;
}): ResourceDefinition {
  return config;
}
