import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { sceneTools } from '../src/tools/scene.js';
import { nodeTools } from '../src/tools/node.js';
import { editorTools } from '../src/tools/editor.js';
import { projectTools } from '../src/tools/project.js';
import { animationTools } from '../src/tools/animation.js';
import { tilemapTools } from '../src/tools/tilemap.js';
import { resourceTools } from '../src/tools/resource.js';
import { sceneResources } from '../src/resources/scene.js';
import { scriptResources } from '../src/resources/script.js';
import { toInputSchema } from '../src/core/schema.js';
import type { AnyToolDefinition, ResourceDefinition } from '../src/core/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = join(__dirname, '../../docs');
const TOOLS_DIR = join(DOCS_DIR, 'tools');
const ROOT_README = join(__dirname, '../../README.md');

interface ToolCategory {
  name: string;
  filename: string;
  description: string;
  tools: AnyToolDefinition[];
}

const categories: ToolCategory[] = [
  { name: 'Scene', filename: 'scene', description: 'Scene management tools', tools: sceneTools },
  { name: 'Node', filename: 'node', description: 'Node manipulation and script attachment tools', tools: nodeTools },
  { name: 'Editor', filename: 'editor', description: 'Editor control, debugging, and screenshot tools', tools: editorTools },
  { name: 'Project', filename: 'project', description: 'Project information tools', tools: projectTools },
  { name: 'Animation', filename: 'animation', description: 'Animation query, playback, and editing tools', tools: animationTools },
  { name: 'TileMap/GridMap', filename: 'tilemap', description: 'TileMap and GridMap editing tools', tools: tilemapTools },
  { name: 'Resource', filename: 'resource', description: 'Resource inspection tools for SpriteFrames, TileSet, Materials, etc.', tools: resourceTools },
];

const allResources: ResourceDefinition[] = [...sceneResources, ...scriptResources];

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function cleanupOldDocs(): void {
  if (!existsSync(TOOLS_DIR)) return;

  const validFilenames = new Set(['README.md', ...categories.map(c => `${c.filename}.md`)]);
  const existingFiles = readdirSync(TOOLS_DIR);

  for (const file of existingFiles) {
    if (file.endsWith('.md') && !validFilenames.has(file)) {
      const filepath = join(TOOLS_DIR, file);
      unlinkSync(filepath);
      console.log(`  Deleted stale doc: ${file}`);
    }
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function getTypeString(prop: Record<string, unknown>): string {
  if (prop.enum) {
    const values = prop.enum as string[];
    return values.map(v => `\`${v}\``).join(', ');
  }
  if (prop.type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items?.type) {
      return `${items.type}[]`;
    }
    return 'array';
  }
  if (prop.type === 'object') {
    const properties = prop.properties as Record<string, Record<string, unknown>> | undefined;
    if (properties && Object.keys(properties).length > 0) {
      const keys = Object.keys(properties).slice(0, 5);
      const keyStr = keys.map(k => `${k}`).join(', ');
      if (Object.keys(properties).length > 5) {
        return `object {${keyStr}, ...}`;
      }
      return `object {${keyStr}}`;
    }
    if (prop.additionalProperties) {
      return 'Record<string, unknown>';
    }
    return 'object';
  }
  return String(prop.type || 'unknown');
}

function parseActionRequirements(description: string): string | null {
  const requiredForMatch = description.match(/\(required for:\s*([^)]+)\)/i);
  if (requiredForMatch) {
    return requiredForMatch[1].trim();
  }

  const onlyMatch = description.match(/\(([^)]+)\s+only\)/i);
  if (onlyMatch) {
    return onlyMatch[1].trim();
  }

  const actionsMatch = description.match(/\(([a-z_]+(?:,\s*[a-z_]+)+)\)$/i);
  if (actionsMatch) {
    return actionsMatch[1].trim();
  }

  return null;
}

function getRequiredString(name: string, prop: Record<string, unknown>, required: string[]): string {
  const isSchemaRequired = required.includes(name);
  const description = String(prop.description || '');
  const actionReqs = parseActionRequirements(description);

  if (isSchemaRequired) {
    return 'Yes';
  }
  if (actionReqs) {
    return actionReqs;
  }
  return 'No';
}

function cleanDescription(description: string): string {
  return description
    .replace(/\s*\(required for:[^)]+\)/gi, '')
    .replace(/\s*\([^)]+\s+only\)/gi, '')
    .replace(/\s*\(([a-z_]+(?:,\s*[a-z_]+)+)\)$/gi, '')
    .trim();
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
    const typeStr = getTypeString(prop);
    const reqStr = getRequiredString(name, prop, required);
    const desc = escapeMarkdown(cleanDescription(String(prop.description || '')));
    table += `| \`${name}\` | ${typeStr} | ${reqStr} | ${desc} |\n`;
  }

  return table;
}

function getActionsFromSchema(schema: Record<string, unknown>): string[] {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties?.action?.enum) return [];
  return properties.action.enum as string[];
}

function actionListContains(actionList: string, action: string): boolean {
  const actions = actionList.toLowerCase().split(/[,\s]+/).map(a => a.trim()).filter(Boolean);
  return actions.includes(action);
}

function getActionSpecificParams(properties: Record<string, Record<string, unknown>>, action: string): { required: string[]; optional: string[] } {
  const required: string[] = [];
  const optional: string[] = [];

  for (const [name, prop] of Object.entries(properties)) {
    if (name === 'action') continue;
    const desc = String(prop.description || '').toLowerCase();

    const hasOnlyMarker = desc.match(/\(([^)]+)\s+only\)/i);
    const hasRequiredForMarker = desc.match(/\(required for:\s*([^)]+)\)/i);
    const hasActionListMarker = desc.match(/\(([a-z_]+(?:,\s*[a-z_]+)+)\)$/i);

    const isForThisAction =
      (hasOnlyMarker && actionListContains(hasOnlyMarker[1], action)) ||
      (hasRequiredForMarker && actionListContains(hasRequiredForMarker[1], action)) ||
      (hasActionListMarker && actionListContains(hasActionListMarker[1], action));

    const hasAnyActionMarker = hasOnlyMarker || hasRequiredForMarker || hasActionListMarker;

    if (isForThisAction) {
      if (hasOnlyMarker || hasRequiredForMarker) {
        required.push(name);
      } else {
        optional.push(name);
      }
    } else if (!hasAnyActionMarker) {
      continue;
    }
  }

  return { required, optional };
}

function generateActionDocs(schema: Record<string, unknown>): string {
  const actions = getActionsFromSchema(schema);
  if (actions.length === 0) return '';

  const properties = schema.properties as Record<string, Record<string, unknown>>;

  let md = '### Actions\n\n';

  for (const action of actions) {
    const { required, optional } = getActionSpecificParams(properties, action);

    if (required.length === 0 && optional.length === 0) {
      md += `#### \`${action}\`\n\n`;
      continue;
    }

    md += `#### \`${action}\`\n\n`;

    const parts: string[] = [];
    if (required.length > 0) {
      parts.push(...required.map(p => `\`${p}\`*`));
    }
    if (optional.length > 0) {
      parts.push(...optional.map(p => `\`${p}\``));
    }

    if (parts.length > 0) {
      md += `Parameters: ${parts.join(', ')}\n\n`;
    }
  }

  return md;
}

function generateExample(tool: AnyToolDefinition, schema: Record<string, unknown>): string {
  const actions = getActionsFromSchema(schema);
  if (actions.length === 0) return '';

  const properties = schema.properties as Record<string, Record<string, unknown>>;
  const required = (schema.required as string[]) || [];

  let md = '### Examples\n\n';

  const examplesToShow = actions.slice(0, 3);

  for (const action of examplesToShow) {
    const example: Record<string, unknown> = { action };
    const addedParams = new Set<string>();

    for (const [name, prop] of Object.entries(properties)) {
      if (name === 'action') continue;
      const desc = String(prop.description || '').toLowerCase();

      const isSchemaRequired = required.includes(name);
      const isActionRequired =
        desc.includes(`${action} only`) ||
        (desc.includes('required for:') && desc.includes(action));

      if (isSchemaRequired || isActionRequired) {
        if (desc.includes('use this or')) {
          const match = desc.match(/use this or\s+(\w+)/i);
          if (match && addedParams.has(match[1])) {
            continue;
          }
        }
        example[name] = getExampleValue(name, prop);
        addedParams.add(name);
      }
    }

    md += `\`\`\`json\n// ${action}\n${JSON.stringify(example, null, 2)}\n\`\`\`\n\n`;
  }

  if (actions.length > 3) {
    md += `*${actions.length - 3} more actions available: ${actions.slice(3).map(a => `\`${a}\``).join(', ')}*\n\n`;
  }

  return md;
}

function getExampleValue(name: string, prop: Record<string, unknown>): unknown {
  if (prop.enum) {
    const values = prop.enum as string[];
    return values[0];
  }

  const exampleValues: Record<string, unknown> = {
    node_path: '/root/Main/Player',
    parent_path: '/root/Main',
    new_parent_path: '/root/UI',
    scene_path: 'res://scenes/enemy.tscn',
    script_path: 'res://scripts/player.gd',
    resource_path: 'res://resources/spriteframes.tres',
    animation_name: 'idle',
    node_name: 'NewNode',
    node_type: 'Sprite2D',
    name_pattern: '*Enemy*',
    type: 'CharacterBody2D',
    root_path: '/root/Main',
    layer_index: 0,
    track_index: 0,
    time: 0.5,
    seconds: 1.0,
    length: 2.0,
    max_depth: 1,
    x: 0,
    y: 0,
    value: 1,
  };

  if (name in exampleValues) {
    return exampleValues[name];
  }

  switch (prop.type) {
    case 'string':
      return 'example';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'object':
      return {};
    case 'array':
      return [];
    default:
      return null;
  }
}

function generateToolMarkdown(tool: AnyToolDefinition): string {
  const schema = toInputSchema(tool.schema);
  let md = `## ${tool.name}\n\n`;
  md += `${tool.description}\n\n`;
  md += `### Parameters\n\n`;
  md += generateParamsTable(schema);
  md += '\n';
  md += generateActionDocs(schema);
  md += generateExample(tool, schema);
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

function analyzeCapabilities(): string[] {
  const capabilities: string[] = [];
  const allTools = categories.flatMap(c => c.tools);

  const hasScreenshot = allTools.some(t =>
    t.description.toLowerCase().includes('screenshot'));
  const hasAnimation = allTools.some(t =>
    t.description.toLowerCase().includes('animation'));
  const hasTilemap = allTools.some(t =>
    t.description.toLowerCase().includes('tilemap') ||
    t.description.toLowerCase().includes('gridmap'));
  const hasResource = allTools.some(t =>
    t.description.toLowerCase().includes('resource'));
  const hasDebug = allTools.some(t =>
    t.description.toLowerCase().includes('debug'));

  if (hasScreenshot) capabilities.push('Screenshot capture from editor viewports and running games');
  if (hasAnimation) capabilities.push('Full animation support (query, playback, editing)');
  if (hasTilemap) capabilities.push('TileMapLayer and GridMap editing');
  if (hasResource) capabilities.push('Resource inspection for SpriteFrames, TileSets, Materials, and Textures');
  if (hasDebug) capabilities.push('Debug output capture from running games');

  return capabilities;
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

function generateReadmeFeatures(): string {
  const totalTools = categories.reduce((sum, cat) => sum + cat.tools.length, 0);
  const categoryNames = categories.map(c => c.filename).join(', ');
  const capabilities = analyzeCapabilities();

  const featureList = [
    `**${totalTools} MCP tools** for ${categoryNames} operations`,
    `**${allResources.length} MCP resources** for reading scene trees, scripts, and project files`,
    'Real-time bidirectional communication via WebSocket',
    ...capabilities,
  ];

  return featureList.map(f => `- ${f}`).join('\n');
}

function generateReadmeTools(): string {
  let content = '';

  for (const category of categories) {
    content += `### ${category.name} Tools (${category.tools.length})\n`;
    for (const tool of category.tools) {
      content += `- \`${tool.name}\` - ${tool.description}\n`;
    }
    content += '\n';
  }

  return content.trim();
}

function replaceMarkerContent(readme: string, marker: string, content: string): string {
  const startMarker = `<!-- ${marker}_START -->`;
  const endMarker = `<!-- ${marker}_END -->`;

  const startIdx = readme.indexOf(startMarker);
  const endIdx = readme.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.warn(`  Warning: Markers for ${marker} not found in README.md`);
    return readme;
  }

  const before = readme.substring(0, startIdx + startMarker.length);
  const after = readme.substring(endIdx);

  return `${before}\n${content}\n${after}`;
}

function updateRootReadme(): void {
  let readme = readFileSync(ROOT_README, 'utf-8');

  readme = replaceMarkerContent(readme, 'FEATURES', generateReadmeFeatures());
  readme = replaceMarkerContent(readme, 'TOOLS', generateReadmeTools());

  writeFileSync(ROOT_README, readme);
  console.log('  Updated README.md');
}

function main(): void {
  console.log('Generating documentation...');

  ensureDir(DOCS_DIR);
  ensureDir(TOOLS_DIR);

  cleanupOldDocs();

  writeFileSync(join(DOCS_DIR, 'README.md'), generateMainReadme());
  console.log('  Created docs/README.md');

  writeFileSync(join(TOOLS_DIR, 'README.md'), generateToolsIndex());
  console.log('  Created docs/tools/README.md');

  for (const category of categories) {
    const content = generateCategoryFile(category);
    writeFileSync(join(TOOLS_DIR, `${category.filename}.md`), content);
    console.log(`  Created docs/tools/${category.filename}.md`);
  }

  writeFileSync(join(DOCS_DIR, 'resources.md'), generateResourcesDoc());
  console.log('  Created docs/resources.md');

  updateRootReadme();

  console.log(`\nGenerated documentation for ${categories.reduce((sum, c) => sum + c.tools.length, 0)} tools and ${allResources.length} resources.`);
}

main();
