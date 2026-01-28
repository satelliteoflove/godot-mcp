# godot-mcp

MCP server that connects Claude to your Godot editor. Less copy-paste, more creating.

## Why This Exists

Using AI assistants for game dev means a lot of back-and-forth: copying error messages, describing what's on screen, pasting debug output, manually applying suggested changes. It works, but it's tedious.

This MCP gives Claude direct access to your Godot editor. It can see your scene tree, capture screenshots, read errors, and make changes directly. You stay focused on the creative work while the mechanical relay disappears. Faster iterations, less busywork, more time building the game you actually want to make.

## Quick Start

### 1. Configure your AI assistant

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@satelliteoflove/godot-mcp"]
    }
  }
}
```

**Claude Code** (`.mcp.json` in your project):

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@satelliteoflove/godot-mcp"]
    }
  }
}
```

### 2. Install the Godot addon

```bash
npx @satelliteoflove/godot-mcp --install-addon /path/to/your/godot/project
```

Enable in Godot: **Project Settings > Plugins > Godot MCP**

### 3. Go

Open your Godot project, restart your AI assistant, and start building.

## What Claude Can Do

- **See** your editor, scenes, running game, errors, and performance
- **Inspect** nodes, resources, animations, tilemaps, 3D spatial data
- **Modify** scenes, nodes, scripts, animations, tilemaps directly
- **Test** by running the game and injecting input
- **Learn** by fetching Godot docs on demand

## Documentation

- [Claude Code Setup Guide](../docs/claude-code-setup.md) - CLAUDE.md templates and workflows
- [Tools Reference](../docs/tools/README.md) - All 11 tools with full API docs
- [Resources Reference](../docs/resources.md) - MCP resources for reading project data
- [Contributing](../CONTRIBUTING.md) - Dev setup, adding tools, release process
- [Changelog](CHANGELOG.md) - Release history

## Architecture

```
[Claude] <--stdio--> [MCP Server] <--WebSocket:6550--> [Godot Addon]
```

## Requirements

- Node.js 20+
- Godot 4.5+

## License

MIT
