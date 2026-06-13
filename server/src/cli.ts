#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { installAddon } from './installer/install.js';
import { getServerVersion } from './version.js';

function parseCliArgs() {
  try {
    return parseArgs({
      options: {
        'install-addon': { type: 'boolean', short: 'i' },
        force: { type: 'boolean', short: 'f' },
        'read-only': { type: 'boolean' },
        version: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
      allowPositionals: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);
    console.error('Run godot-mcp --help for usage.');
    process.exit(1);
  }
}

const { values, positionals } = parseCliArgs();

if (values.help) {
  console.log(`godot-mcp - MCP server for Godot Engine

Usage:
  godot-mcp                              Start the MCP server
  godot-mcp --read-only                  Start with observation tools only
  godot-mcp --install-addon <path>       Install addon to a Godot project
  godot-mcp --version                    Show version
  godot-mcp --help                       Show this help

Options:
  -i, --install-addon    Install the Godot addon to the specified project path
  -f, --force            Force install even if it would downgrade the addon
      --read-only        Register only read-only tools (no scene/node/animation
                         edits, no game control, no input injection, no exec).
                         GODOT_MCP_READ_ONLY=1 does the same.
  -v, --version          Show version number
  -h, --help             Show help
`);
  process.exit(0);
}

if (values.version) {
  console.log(getServerVersion());
  process.exit(0);
}

if (values['install-addon']) {
  const projectPath = positionals[0];
  if (!projectPath) {
    console.error('Error: Project path required');
    console.error('Usage: godot-mcp --install-addon <path-to-godot-project>');
    process.exit(1);
  }

  const result = await installAddon(projectPath, { force: values.force });
  if (result.success) {
    console.log(result.message);
    if (!result.skipped) {
      console.log('\nNext steps:');
      console.log('  1. Open the Godot project');
      console.log('  2. Go to Project > Project Settings > Plugins');
      console.log('  3. Enable "Godot MCP"');
      console.log('  4. Restart your AI assistant to reconnect');
    }
    process.exit(0);
  } else {
    console.error('Error:', result.message);
    process.exit(1);
  }
} else {
  // Only start the MCP server if no CLI command was specified
  // Dynamic import avoids loading MCP SDK for CLI commands (fixes npx stdin issue)
  if (values['read-only']) {
    process.env.GODOT_MCP_READ_ONLY = '1';
  }
  const { main } = await import('./index.js');
  main().catch((error) => {
    console.error('[godot-mcp] Fatal error:', error);
    process.exit(1);
  });
}
