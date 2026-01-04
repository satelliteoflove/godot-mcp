# godot-mcp

MCP server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects.

## Features

- **8 MCP tools** across 7 categories
- **3 MCP resources** for reading scene trees, scripts, and project files
- Screenshot capture from editor viewports and running games
- Full animation support (query, playback, editing)
- TileMapLayer and GridMap editing
- Resource inspection for SpriteFrames, TileSets, Materials, and Textures
- Debug output capture from running games

## Quick Start

### 1. Configure Your AI Assistant

**Claude Desktop** - Add to config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

**Claude Code** - Add to `.mcp.json`:

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

### 2. Install the Godot Addon

```bash
npx @satelliteoflove/godot-mcp --install-addon /path/to/your/godot/project
```

Then enable the addon in Godot: Project Settings > Plugins > Godot MCP.

### 3. Start Using

Open your Godot project (with addon enabled), restart your AI assistant, and start building.

**Version Sync:** The MCP server auto-updates via npx. If the addon version falls behind, use `project` tool with `addon_status` action to check compatibility, then re-run the install command to update.

## Tools

| Tool | Description |
|------|-------------|
| `scene` | Manage scenes: open, save, or create scenes |
| `node` | Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts |
| `editor` | Control the Godot editor: get state (includes viewport/camera info), manage selection, run/stop project, get debug output, get performance metrics, capture screenshots, set 2D viewport position/zoom |
| `project` | Get project information and settings |
| `animation` | Query, control, and edit animations |
| `tilemap` | Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates |
| `gridmap` | Query and edit GridMap data: list gridmaps, get info, get/set cells |
| `resource` | Manage Godot resources: inspect Resource files by path |

See [docs/](docs/) for detailed API reference, including the [Claude Code Setup Guide](docs/claude-code-setup.md).

## Architecture

```
[AI Assistant] <--stdio--> [MCP Server] <--WebSocket--> [Godot Addon]
```

## Development

```bash
cd server
npm install && npm run build
npm test
npm run generate-docs
```

## Requirements

- Node.js 20+
- Godot 4.5+

## License

MIT
