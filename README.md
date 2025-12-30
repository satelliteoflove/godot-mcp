# godot-mcp

A Model Context Protocol (MCP) server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects in real-time.

## Features

<!-- FEATURES_START -->
- **8 MCP tools** for scene, node, editor, project, animation, tilemap, resource operations
- **3 MCP resources** for reading scene trees, scripts, and project files
- Real-time bidirectional communication via WebSocket
- Screenshot capture from editor viewports and running games
- Full animation support (query, playback, editing)
- TileMapLayer and GridMap editing
- Resource inspection for SpriteFrames, TileSets, Materials, and Textures
- Debug output capture from running games
<!-- FEATURES_END -->

## Architecture

```
[Claude/IDE] <--stdio--> [MCP Server (TypeScript)] <--WebSocket:6550--> [Godot Addon (GDScript)]
```

## Quick Start

### 1. Install the Godot Addon

Copy the `godot/addons/godot_mcp` folder to your Godot project's `addons` directory, then enable it in Project Settings > Plugins.

### 2. Configure Your AI Assistant

**Claude Desktop** - Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

**Claude Code** - Add to your project's `.mcp.json`:

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

### 3. Start Using

1. Open your Godot project (with the addon enabled)
2. Restart your AI assistant
3. Start asking for help with your Godot project

## Available Tools

<!-- TOOLS_START -->
### Scene Tools (1)
- `scene` - Manage scenes: open, save, or create scenes

### Node Tools (1)
- `node` - Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts

### Editor Tools (1)
- `editor` - Control the Godot editor: get state, manage selection, run/stop project, get debug output, capture screenshots

### Project Tools (1)
- `project` - Get project information and settings

### Animation Tools (1)
- `animation` - Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, pause, seek, queue, clear_queue. Edit: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

### TileMap/GridMap Tools (2)
- `tilemap` - Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates
- `gridmap` - Query and edit GridMap data: list gridmaps, get info, get/set cells

### Resource Tools (1)
- `resource` - Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.
<!-- TOOLS_END -->

## Reducing Context Usage

The full toolset adds significant context to your AI assistant. If you're working on a specific type of project, consider disabling tools you won't need:

- **3D games**: Disable `tilemap_query` and `tilemap_edit` (2D TileMapLayer tools)
- **2D games**: Disable `gridmap_query` and `gridmap_edit` (3D GridMap tools)
- **No animations**: Disable `animation_query`, `animation_playback`, and `animation_edit`
- **Static scenes**: Disable screenshot tools if you don't need viewport captures
- **No asset inspection**: Disable `get_resource_info` if you don't need to inspect SpriteFrames, TileSets, etc.

Check your MCP client's documentation for how to disable specific tools. For Claude Code, you can specify tool filters in your `.claude/settings.local.json` configuration.

## API Documentation

See the [docs folder](docs/) for complete API reference generated from tool definitions.

## Development

```bash
cd server
npm install
npm run build
npm run dev    # Watch mode
npm test       # Run tests
npm run generate-docs  # Regenerate docs and README
```

## Requirements

- Node.js 20+
- Godot 4.5+ (required for Logger class)

## License

MIT
