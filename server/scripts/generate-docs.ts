import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { sceneTools } from '../src/tools/scene.js';
import { nodeTools } from '../src/tools/node.js';
import { scriptTools } from '../src/tools/script.js';
import { editorTools } from '../src/tools/editor.js';
import { projectTools } from '../src/tools/project.js';
import { screenshotTools } from '../src/tools/screenshot.js';
import { animationTools } from '../src/tools/animation.js';
import { tilemapTools } from '../src/tools/tilemap.js';
import { sceneResources } from '../src/resources/scene.js';
import { scriptResources } from '../src/resources/script.js';
import { toInputSchema } from '../src/core/schema.js';
import type { AnyToolDefinition, ResourceDefinition } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, '../../docs');

interface ToolCategory {
  name: string;
  filename: string;
  description: string;
  tools: AnyToolDefinition[];
}

const categories: ToolCategory[] = [
  { name: 'Scene', filename: 'scene', description: 'Scene management tools', tools: sceneTools },
  { name: 'Node', filename: 'node', description: 'Node manipulation tools', tools: nodeTools },
  { name: 'Script', filename: 'script', description: 'GDScript management tools', tools: scriptTools },
  { name: 'Editor', filename: 'editor', description: 'Editor control and debugging tools', tools: editorTools },
  { name: 'Project', filename: 'project', description: 'Project information tools', tools: projectTools },
  { name: 'Screenshot', filename: 'screenshot', description: 'Screenshot capture tools', tools: screenshotTools },
  { name: 'Animation', filename: 'animation', description: 'Animation query, playback, and editing tools', tools: animationTools },
  { name: 'TileMap/GridMap', filename: 'tilemap', description: 'TileMap and GridMap editing tools', tools: tilemapTools },
];

const allResources: ResourceDefinition[] = [...sceneResources, ...scriptResources];

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function getTypeString(prop: Record<string, unknown>): string {
  if (prop.enum) {
    const values = prop.enum as string[];
    if (values.length <= 4) {
      return values.map(v => `\`${v}\``).join(', ');
    }
    return `enum (${values.length} values)`;
  }
  if (prop.type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items?.type) {
      return `${items.type}[]`;
    }
    return 'array';
  }
  if (prop.type === 'object' && prop.additionalProperties) {
    return 'object';
  }
  return String(prop.type || 'unknown');
}

function generateParamsTable(schema: Record<string, unknown>): string {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  const required = (schema.required as string[]) || [];

  if (!properties || Object.keys(properties).length === 0) {
    return '*No parameters required.*\n';
  }

  let table = '| Parameter | Type | Required | Description |\n';
  table += '|-----------|------|----------|-------------|\n';

  for (const [name, prop] of Object.entries(properties)) {
    const isRequired = required.includes(name);
    const typeStr = getTypeString(prop);
    const desc = escapeMarkdown(String(prop.description || ''));
    table += `| \`${name}\` | ${typeStr} | ${isRequired ? 'Yes' : 'No'} | ${desc} |\n`;
  }

  return table;
}

function generateToolMarkdown(tool: AnyToolDefinition): string {
  const schema = toInputSchema(tool.schema);
  let md = `## ${tool.name}\n\n`;
  md += `${tool.description}\n\n`;
  md += `### Parameters\n\n`;
  md += generateParamsTable(schema);
  md += '\n';
  return md;
}

function generateCategoryFile(category: ToolCategory): string {
  let md = `# ${category.name} Tools\n\n`;
  md += `${category.description}\n\n`;
  md += `## Tools\n\n`;

  for (const tool of category.tools) {
    md += `- [${tool.name}](#${tool.name.replace(/_/g, '_')})\n`;
  }

  md += '\n---\n\n';

  for (const tool of category.tools) {
    md += generateToolMarkdown(tool);
    md += '---\n\n';
  }

  return md;
}

function generateToolsIndex(): string {
  let md = `# Tools Reference\n\n`;
  md += `This documentation is auto-generated from the tool definitions.\n\n`;

  for (const category of categories) {
    md += `## [${category.name}](${category.filename}.md)\n\n`;
    md += `${category.description}\n\n`;
    for (const tool of category.tools) {
      md += `- \`${tool.name}\` - ${tool.description}\n`;
    }
    md += '\n';
  }

  return md;
}

function generateResourcesDoc(): string {
  let md = `# Resources Reference\n\n`;
  md += `MCP resources provide read-only access to Godot project data.\n\n`;

  for (const resource of allResources) {
    md += `## ${resource.name}\n\n`;
    md += `**URI:** \`${resource.uri}\`\n\n`;
    md += `**MIME Type:** \`${resource.mimeType}\`\n\n`;
    md += `${resource.description}\n\n`;
    md += '---\n\n';
  }

  return md;
}

function generateMainReadme(): string {
  const totalTools = categories.reduce((sum, cat) => sum + cat.tools.length, 0);

  return `# godot-mcp Documentation

MCP (Model Context Protocol) server for Godot Engine integration.

## Overview

This server provides **${totalTools} tools** and **${allResources.length} resources** for AI-assisted Godot development.

## Quick Links

- [Tools Reference](tools/README.md) - All available MCP tools
- [Resources Reference](resources.md) - MCP resources for reading project data

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
${categories.map(c => `| [${c.name}](tools/${c.filename}.md) | ${c.tools.length} | ${c.description} |`).join('\n')}

## Installation

\`\`\`bash
npx @anthropic-ai/create-mcp@latest init godot-mcp
\`\`\`

Or add to your MCP configuration:

\`\`\`json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@satelliteoflove/godot-mcp"]
    }
  }
}
\`\`\`

## Requirements

- Godot 4.5+ (required for Logger class)
- godot-mcp addon installed and enabled in your Godot project

---

*This documentation is auto-generated from tool definitions.*
`;
}

function main(): void {
  console.log('Generating documentation...');

  ensureDir(DOCS_DIR);
  ensureDir(join(DOCS_DIR, 'tools'));

  writeFileSync(join(DOCS_DIR, 'README.md'), generateMainReadme());
  console.log('  Created docs/README.md');

  writeFileSync(join(DOCS_DIR, 'tools', 'README.md'), generateToolsIndex());
  console.log('  Created docs/tools/README.md');

  for (const category of categories) {
    const content = generateCategoryFile(category);
    writeFileSync(join(DOCS_DIR, 'tools', `${category.filename}.md`), content);
    console.log(`  Created docs/tools/${category.filename}.md`);
  }

  writeFileSync(join(DOCS_DIR, 'resources.md'), generateResourcesDoc());
  console.log('  Created docs/resources.md');

  console.log(`\nGenerated documentation for ${categories.reduce((sum, c) => sum + c.tools.length, 0)} tools and ${allResources.length} resources.`);
}

main();
