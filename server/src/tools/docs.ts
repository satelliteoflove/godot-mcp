import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition, ToolContext } from '../core/types.js';

const GODOT_DOCS_BASE = 'https://docs.godotengine.org/en';
const FETCH_TIMEOUT_MS = 15000;

const SUPPORTED_VERSIONS = ['stable', 'latest', '4.5', '4.4', '4.3', '4.2'] as const;
type DocsVersion = (typeof SUPPORTED_VERSIONS)[number];

const DocsSchema = z.object({
  action: z
    .enum(['fetch_class', 'fetch_page'])
    .describe('Action: fetch_class (get class reference by name), fetch_page (get any docs page by path)'),
  class_name: z
    .string()
    .optional()
    .describe('Class name to fetch, e.g. "CharacterBody2D" (fetch_class only)'),
  path: z
    .string()
    .optional()
    .describe('Documentation path, e.g. "/tutorials/2d/2d_movement.html" (fetch_page only)'),
  version: z
    .enum(SUPPORTED_VERSIONS)
    .optional()
    .describe('Godot docs version. If omitted, auto-detects from connected Godot editor or defaults to "stable"'),
  section: z
    .enum(['full', 'description', 'properties', 'methods', 'signals'])
    .optional()
    .default('full')
    .describe('Which section to return (default: full). Use specific sections to reduce token usage.'),
});

type DocsArgs = z.infer<typeof DocsSchema>;

function detectVersionFromGodot(ctx: ToolContext): DocsVersion | null {
  const godotVersion = ctx.godot.godotVersion;
  if (!godotVersion) return null;

  const match = godotVersion.match(/^(\d+\.\d+)/);
  if (!match) return null;

  const majorMinor = match[1] as DocsVersion;
  if (SUPPORTED_VERSIONS.includes(majorMinor)) {
    return majorMinor;
  }

  return null;
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.status === 404) {
      throw new Error(`Documentation page not found: ${url}`);
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch documentation: HTTP ${response.status}`);
    }
    return response.text();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
      }
      throw error;
    }
    throw new Error(`Failed to fetch documentation: ${url}`);
  }
}

function extractMainContent(html: string): string {
  const mainMatch = html.match(/<div role="main"[^>]*>([\s\S]*?)<div role="contentinfo"/);
  if (!mainMatch) {
    throw new Error('Could not extract main content from documentation page. The page structure may have changed.');
  }
  return mainMatch[1];
}

function htmlToMarkdown(html: string): string {
  let md = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '#### $1\n\n')
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, '```\n$1\n```\n')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n')
    .replace(/<\/?(?:ul|ol|div|span|p|table|tr|td|th|thead|tbody|section|article|nav|aside|header|footer|dl|dt|dd)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return md;
}

function extractSection(markdown: string, section: string): string {
  if (section === 'full') return markdown;

  const sections = markdown.split(/(?=^## )/m);

  const sectionMap: Record<string, string[]> = {
    description: ['Description'],
    properties: ['Properties', 'Property'],
    methods: ['Methods', 'Method'],
    signals: ['Signals', 'Signal'],
  };

  const targetHeaders = sectionMap[section];
  if (!targetHeaders) return markdown;

  if (section === 'description') {
    const descSection = sections.find(s => s.startsWith('## Description'));
    if (descSection) {
      const titleMatch = markdown.match(/^# [^\n]+\n+(?:\*\*Inherits:[^\n]+\n+)?/);
      const title = titleMatch ? titleMatch[0] : '';
      return title + descSection.trim();
    }
    return `Section "description" not found in this class reference.`;
  }

  const matchingSection = sections.find(s => targetHeaders.some(h => s.startsWith(`## ${h}`)));

  return matchingSection ? matchingSection.trim() : `Section "${section}" not found in this class reference.`;
}

export const docs = defineTool({
  name: 'godot_docs',
  description:
    'Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.',
  schema: DocsSchema,
  async execute(args: DocsArgs, ctx: ToolContext) {
    const version = args.version ?? detectVersionFromGodot(ctx) ?? 'stable';
    let url: string;

    switch (args.action) {
      case 'fetch_class': {
        if (!args.class_name) {
          throw new Error('class_name is required for fetch_class action');
        }
        const className = args.class_name.toLowerCase();
        url = `${GODOT_DOCS_BASE}/${version}/classes/class_${className}.html`;
        break;
      }

      case 'fetch_page': {
        if (!args.path) {
          throw new Error('path is required for fetch_page action');
        }
        const path = args.path.startsWith('/') ? args.path : '/' + args.path;
        url = `${GODOT_DOCS_BASE}/${version}${path}`;
        break;
      }
    }

    const html = await fetchHtml(url);
    const mainContent = extractMainContent(html);
    const markdown = htmlToMarkdown(mainContent);
    const result = extractSection(markdown, args.section || 'full');

    const charCount = result.length;
    const approxTokens = Math.round(charCount / 4);

    const versionNote = args.version ? '' : ` (auto-detected: ${version})`;
    return `Source: ${url}${versionNote}\nApprox tokens: ${approxTokens}\n\n---\n\n${result}`;
  },
});

export const docsTools = [docs] as AnyToolDefinition[];
