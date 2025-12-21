# godot-mcp

A Model Context Protocol (MCP) server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects in real-time.

## Features

- **33 MCP tools** for scene, node, script, editor, project, screenshot, animation, and tilemap operations
- **3 MCP resources** for reading scene trees, scripts, and project files
- Real-time bidirectional communication via WebSocket
- Debug output capture from running games (via Godot 4.5 Logger)
- Screenshot capture from both editor viewports and running games
- Full animation support (query, playback, editing)
- TileMapLayer and GridMap editing

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

### Scene Tools (4)
- `get_scene_tree` - Get the full scene hierarchy
- `open_scene` - Open a scene file
- `save_scene` - Save the current scene
- `create_scene` - Create a new scene

### Node Tools (5)
- `get_node_properties` - Get properties of a node
- `create_node` - Create a new node
- `update_node` - Modify node properties
- `delete_node` - Remove a node
- `reparent_node` - Move a node to a new parent

### Script Tools (5)
- `get_script` - Read a script file
- `create_script` - Create a new script
- `edit_script` - Modify a script
- `attach_script` - Attach a script to a node
- `detach_script` - Remove a script from a node

### Editor Tools (6)
- `get_editor_state` - Get current editor state
- `get_selected_nodes` - Get selected nodes
- `select_node` - Select a node
- `run_project` - Run the project
- `stop_project` - Stop the running project
- `get_debug_output` - Get debug/print output

### Project Tools (4)
- `get_project_info` - Get project information
- `list_project_files` - List scripts, scenes, or assets
- `search_files` - Search for files by pattern
- `get_project_settings` - Get project settings

### Screenshot Tools (2)
- `capture_game_screenshot` - Capture the running game viewport
- `capture_editor_screenshot` - Capture the editor 2D or 3D viewport

### Animation Tools (3)
- `animation_query` - Query animation data (players, tracks, keyframes)
- `animation_playback` - Control animation playback (play, stop, pause, seek)
- `animation_edit` - Edit animations (create, delete, add tracks/keyframes)

### TileMap/GridMap Tools (4)
- `tilemap_query` - Query TileMapLayer data
- `tilemap_edit` - Edit TileMapLayer cells
- `gridmap_query` - Query GridMap data
- `gridmap_edit` - Edit GridMap cells

## API Documentation

See the [docs folder](docs/) for complete API reference generated from tool definitions.

## Development

```bash
cd server
npm install
npm run build
npm run dev    # Watch mode
npm test       # Run tests
```

## Requirements

- Node.js 20+
- Godot 4.5+ (required for Logger class)

## License

MIT
