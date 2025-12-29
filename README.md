# godot-mcp

A Model Context Protocol (MCP) server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects in real-time.

## Features

<!-- FEATURES_START -->
- **34 MCP tools** for scene, node, script, editor, project, screenshot, animation, tilemap, and resource operations
- **3 MCP resources** for reading scene trees, scripts, and project files
- Real-time bidirectional communication via WebSocket
- Debug output capture from running games (via Godot 4.5 Logger)
- Screenshot capture from both editor viewports and running games
- Full animation support (query, playback, editing)
- TileMapLayer and GridMap editing
- Resource inspection for SpriteFrames, TileSets, Materials, and Textures
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
### Scene Tools (4)
- `get_scene_tree` - Get the full hierarchy of nodes in the currently open scene
- `open_scene` - Open a scene file in the editor
- `save_scene` - Save the currently open scene
- `create_scene` - Create a new scene with a root node

### Node Tools (5)
- `get_node_properties` - Get all properties of a node at the specified path
- `create_node` - Create a new node as a child of an existing node, or instantiate a packed scene
- `update_node` - Update properties of an existing node
- `delete_node` - Delete a node from the scene
- `reparent_node` - Move a node to a new parent

### Script Tools (5)
- `get_script` - Get the content of a GDScript file
- `create_script` - Create a new GDScript file
- `edit_script` - Replace the content of an existing GDScript file
- `attach_script` - Attach an existing script to a node
- `detach_script` - Remove the script from a node

### Editor Tools (6)
- `get_editor_state` - Get the current state of the Godot editor
- `get_selected_nodes` - Get the currently selected nodes in the editor
- `select_node` - Select a node in the editor
- `run_project` - Run the current Godot project
- `stop_project` - Stop the running Godot project
- `get_debug_output` - Get debug output/print statements from the running project

### Project Tools (4)
- `get_project_info` - Get information about the current Godot project
- `list_project_files` - List files in the project by type
- `search_files` - Search for files by name pattern
- `get_project_settings` - Get project settings

### Screenshot Tools (2)
- `capture_game_screenshot` - Capture a screenshot of the running game viewport. The project must be running.
- `capture_editor_screenshot` - Capture a screenshot of the editor 2D or 3D viewport

### Animation Tools (3)
- `animation_query` - Query animation data. Actions: list_players (find AnimationPlayers), get_info (player state), get_details (animation tracks/length), get_keyframes (track keyframes)
- `animation_playback` - Control animation playback. Actions: play, stop, pause, seek, queue, clear_queue
- `animation_edit` - Edit animations. Actions: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

### TileMap/GridMap Tools (4)
- `tilemap_query` - Query TileMapLayer data. Actions: list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords
- `tilemap_edit` - Edit TileMapLayer cells. Actions: set_cell, erase_cell, clear_layer, set_cells_batch
- `gridmap_query` - Query GridMap data. Actions: list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item
- `gridmap_edit` - Edit GridMap cells. Actions: set_cell, clear_cell, clear, set_cells_batch

### Resource Tools (1)
- `get_resource_info` - Load and inspect any Godot Resource by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc. Falls back to generic property inspection for unknown types.
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
