# @satelliteoflove/godot-mcp

MCP (Model Context Protocol) server for Godot Engine integration. Enables AI assistants like Claude to interact with the Godot editor in real-time.

## Features

- **33 MCP tools** across 8 categories (scene, node, script, editor, project, screenshot, animation, tilemap)
- **3 MCP resources** for reading scene trees, scripts, and project files
- Real-time bidirectional communication via WebSocket
- Debug output and screenshot capture from running games
- Full TileMapLayer and GridMap editing support
- Animation query, playback, and editing

## Requirements

- Node.js 20+
- Godot 4.5+ (required for Logger class)
- The Godot MCP addon installed in your project

## Installation

Use directly with npx (recommended):

```bash
npx @satelliteoflove/godot-mcp
```

Or install globally:

```bash
npm install -g @satelliteoflove/godot-mcp
```

## Setup

1. Copy the Godot addon from `godot/addons/godot_mcp` into your project's `addons` folder
2. Enable the addon in Project Settings > Plugins
3. Configure your MCP client (see below)

### Claude Desktop Configuration

Add to your config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

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

### Claude Code Configuration

Add to your project's `.mcp.json`:

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

## Documentation

For full API documentation, setup guides, and the Godot addon source, visit the [GitHub repository](https://github.com/satelliteoflove/godot-mcp).

## License

MIT
