# godot-mcp

An MCP server that gives Claude direct visibility into your Godot editor and running game. Instead of copy-pasting debug output or describing what you're seeing, Claude can observe it directly.

## Core Capabilities

**Observe** - Claude sees what you see
- Live editor state, selection, and open scenes
- Screenshots from editor viewports or running game
- Debug output and performance metrics from runtime
- Camera position and viewport in 2D and 3D

**Inspect** - Deep access to your project
- Scene tree traversal with node properties
- 3D spatial data: transforms, bounding boxes, visibility
- Resource introspection: SpriteFrames, TileSets, Materials
- Project settings and input mappings

**Modify** - Direct manipulation when needed
- Create, update, delete, and reparent nodes
- Attach and detach scripts
- Edit TileMapLayers and GridMaps cell-by-cell
- Control animation playback and edit tracks/keyframes
- Run and stop the game from the editor

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

**Version Sync:** The MCP server auto-updates via npx. Version mismatches are detected automatically on connection. If prompted, re-run the install command to update the addon.

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
| `scene3d` | Get spatial information for 3D nodes: global transforms, bounding boxes, visibility |
| `godot_docs` | Fetch Godot Engine documentation |

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
