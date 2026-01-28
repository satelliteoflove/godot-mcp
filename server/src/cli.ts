#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { installAddon } from './installer/install.js';
import { getServerVersion } from './version.js';

const { values, positionals } = parseArgs({
  options: {
    'install-addon': { type: 'boolean', short: 'i' },
    force: { type: 'boolean', short: 'f' },
    version: { type: 'boolean', short: 'v' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

if (values.help) {
  console.log(`godot-mcp - MCP server for Godot Engine

Usage:
  godot-mcp                              Start the MCP server
  godot-mcp --install-addon <path>       Install addon to a Godot project
  godot-mcp --version                    Show version
  godot-mcp --help                       Show this help

Options:
  -i, --install-addon    Install the Godot addon to the specified project path
  -f, --force            Force install even if it would downgrade the addon
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
  const { main } = await import('./index.js');
  main().catch((error) => {
    console.error('[godot-mcp] Fatal error:', error);
    process.exit(1);
  });
}
