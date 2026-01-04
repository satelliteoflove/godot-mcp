# @satelliteoflove/godot-mcp

MCP server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects.

## Features

- **8 MCP tools** across 7 categories
- **3 MCP resources** for reading scene trees, scripts, and project files
- Screenshot capture from editor viewports and running games
- Full animation support (query, playback, editing)
- TileMapLayer and GridMap editing
- Resource inspection for SpriteFrames, TileSets, Materials, and Textures
- Debug output capture from running games

## Installation

```bash
npx @satelliteoflove/godot-mcp
```

## Setup

1. Configure your MCP client (see below)
2. Install the addon: `npx @satelliteoflove/godot-mcp --install-addon /path/to/project`
3. Enable it in Godot: Project Settings > Plugins > Godot MCP

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

### Claude Code

Add to `.mcp.json`:

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

See the [GitHub repository](https://github.com/satelliteoflove/godot-mcp) for full documentation.

## Requirements

- Node.js 20+
- Godot 4.5+

## License

MIT
