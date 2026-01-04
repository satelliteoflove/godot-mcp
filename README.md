# godot-mcp

An MCP server that gives Claude direct visibility into your Godot editor and running game. Instead of copy-pasting debug output or describing what you're seeing, Claude can observe it directly.

## Core Capabilities

- Live editor state - what scene is open, what's selected, which panel you're in
- Runtime debug output from the running game
- Viewport awareness - where the camera is pointed (2D and 3D)
- Screenshots of the editor or running game
- Scene tree and node properties at runtime

## Design Goals

- **Observation over automation** - help Claude understand what's happening so it can help you solve problems
- **Minimal token footprint** - more room for actual conversation
- **Friction-free maintenance** - version mismatch detection and one-command updates

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
