# godot-mcp

A robust Model Context Protocol (MCP) server for Godot Engine 4.5+, enabling AI assistants to interact with your Godot projects in real-time.

## Features

- Real-time bidirectional communication with Godot Editor
- Scene tree inspection and manipulation
- Node creation, modification, and deletion
- Script reading, writing, and creation
- Scene management (open, save, create)
- Project file listing and search
- Editor state access
- Debug output capture
- Screenshot capture (editor viewports and running game)
- Animation editing (AnimationPlayer read/write/playback)
- TileMapLayer editing (2D tile-based levels)
- GridMap editing (3D grid-based levels)

## Architecture

```
[Claude/IDE] <--stdio--> [MCP Server (TypeScript)] <--WebSocket--> [Godot Addon (GDScript)]
```

## Quick Start

### 1. Install the Godot Addon

Copy the `godot/addons/godot_mcp` folder to your Godot project's `addons` directory, then enable it in Project Settings > Plugins.

### 2. Configure Your AI Assistant

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["@satelliteoflove/godot-mcp"]
    }
  }
}
```

Or if running from source:

```bash
cd server
npm install
npm run build
```

```json
{
  "mcpServers": {
    "godot-mcp": {
      "command": "node",
      "args": ["/path/to/godot-mcp/server/dist/index.js"]
    }
  }
}
```

### 3. Start Using

1. Open your Godot project (with the addon enabled)
2. Restart Claude Desktop
3. Start asking Claude to help with your Godot project

## Available Tools

godot-mcp provides 66 tools organized into categories:

### Scene Tools (4 tools)
- `get_scene_tree` - Get the full scene hierarchy
- `open_scene` - Open a scene file
- `save_scene` - Save the current scene
- `create_scene` - Create a new scene with a root node

### Node Tools (5 tools)
- `get_node_properties` - Get all properties of a node
- `create_node` - Create a new node as a child
- `update_node` - Modify node properties
- `delete_node` - Remove a node from the scene
- `reparent_node` - Move a node to a new parent

### Script Tools (5 tools)
- `get_script` - Read a GDScript file
- `create_script` - Create a new GDScript file
- `edit_script` - Replace script content
- `attach_script` - Attach a script to a node
- `detach_script` - Remove a script from a node

### Project Tools (4 tools)
- `get_project_info` - Get project metadata
- `list_project_files` - List files by type (scripts, scenes, resources, images, audio)
- `search_files` - Search files by name pattern
- `get_project_settings` - Get project settings

### Editor Tools (4 tools)
- `get_editor_state` - Get current editor state
- `get_selected_nodes` - Get currently selected nodes
- `select_node` - Select a node in the editor
- `get_debug_output` - Get debug/print output from running project

### Run Tools (2 tools)
- `run_project` - Run the current project
- `stop_project` - Stop the running project

### Screenshot Tools (2 tools)
- `capture_game_screenshot` - Capture the running game viewport
- `capture_editor_screenshot` - Capture the editor 2D or 3D viewport

### Animation Tools (19 tools)
- `list_animation_players` - Find all AnimationPlayer nodes
- `get_animation_player_info` - Get AnimationPlayer state and animations
- `get_animation_details` - Get detailed animation info (tracks, length, loop)
- `get_track_keyframes` - Get all keyframes for a track
- `play_animation` - Play an animation
- `stop_animation` - Stop current animation
- `pause_animation` - Pause/unpause animation
- `seek_animation` - Seek to a specific time
- `queue_animation` - Queue animation after current
- `clear_animation_queue` - Clear the animation queue
- `create_animation` - Create a new animation
- `delete_animation` - Delete an animation
- `rename_animation` - Rename an animation
- `update_animation_properties` - Update length, loop mode, step
- `add_animation_track` - Add a track to an animation
- `remove_animation_track` - Remove a track
- `add_keyframe` - Add a keyframe to a track
- `remove_keyframe` - Remove a keyframe
- `update_keyframe` - Update keyframe value or time

### TileMap Tools (11 tools)
- `list_tilemap_layers` - Find all TileMapLayer nodes
- `get_tilemap_layer_info` - Get TileMapLayer properties
- `get_tileset_info` - Get TileSet sources and atlas info
- `get_used_cells` - Get all non-empty cell coordinates
- `get_cell` - Get cell data (source_id, atlas_coords, alternative_tile)
- `set_cell` - Set a cell with tile data
- `erase_cell` - Clear a single cell
- `clear_layer` - Clear all cells in a layer
- `get_cells_in_region` - Get cells in a rectangular region
- `set_cells_batch` - Set multiple cells at once
- `convert_coords` - Convert between local and map coordinates

### GridMap Tools (10 tools)
- `list_gridmaps` - Find all GridMap nodes
- `get_gridmap_info` - Get GridMap properties (mesh_library, cell_size)
- `get_meshlib_info` - Get MeshLibrary item names and indices
- `get_gridmap_used_cells` - Get all non-empty cells
- `get_gridmap_cell` - Get cell data (item index, orientation)
- `set_gridmap_cell` - Set a cell with an item
- `clear_gridmap_cell` - Clear a single cell
- `clear_gridmap` - Clear all cells
- `get_cells_by_item` - Get all cells containing a specific item
- `set_gridmap_cells_batch` - Set multiple cells at once

## Tool Configuration

All 66 tools consume approximately 42,000 context tokens. You can reduce context usage by enabling only the tools you need using Claude Code's permissions system.

### Context Cost by Category

| Category | Tools | Approx. Tokens |
|----------|-------|----------------|
| Scene | 4 | ~2,400 |
| Node | 5 | ~3,000 |
| Script | 5 | ~3,000 |
| Project | 4 | ~2,400 |
| Editor | 4 | ~2,400 |
| Run | 2 | ~1,200 |
| Screenshot | 2 | ~1,200 |
| Animation | 19 | ~13,000 |
| TileMap | 11 | ~7,400 |
| GridMap | 10 | ~6,500 |

### Configuring Enabled Tools

Add permissions to `~/.claude/settings.json` (global) or `.claude/settings.json` (project-local):

**Example: Allow only core tools (save ~27k tokens)**
```json
{
  "permissions": {
    "allow": [
      "mcp__godot-mcp__get_scene_tree",
      "mcp__godot-mcp__open_scene",
      "mcp__godot-mcp__save_scene",
      "mcp__godot-mcp__create_scene",
      "mcp__godot-mcp__get_node_properties",
      "mcp__godot-mcp__create_node",
      "mcp__godot-mcp__update_node",
      "mcp__godot-mcp__delete_node",
      "mcp__godot-mcp__reparent_node",
      "mcp__godot-mcp__get_script",
      "mcp__godot-mcp__create_script",
      "mcp__godot-mcp__edit_script",
      "mcp__godot-mcp__attach_script",
      "mcp__godot-mcp__detach_script",
      "mcp__godot-mcp__get_project_info",
      "mcp__godot-mcp__list_project_files",
      "mcp__godot-mcp__search_files",
      "mcp__godot-mcp__get_project_settings",
      "mcp__godot-mcp__get_editor_state",
      "mcp__godot-mcp__get_selected_nodes",
      "mcp__godot-mcp__select_node",
      "mcp__godot-mcp__get_debug_output",
      "mcp__godot-mcp__run_project",
      "mcp__godot-mcp__stop_project",
      "mcp__godot-mcp__capture_game_screenshot",
      "mcp__godot-mcp__capture_editor_screenshot"
    ]
  }
}
```

**Example: Exclude animation tools (save ~13k tokens)**
```json
{
  "permissions": {
    "deny": [
      "mcp__godot-mcp__*animation*",
      "mcp__godot-mcp__*_keyframe",
      "mcp__godot-mcp__*_track"
    ]
  }
}
```

**Example: 3D game - exclude TileMap tools (save ~7k tokens)**
```json
{
  "permissions": {
    "deny": [
      "mcp__godot-mcp__*tilemap*",
      "mcp__godot-mcp__*tileset*",
      "mcp__godot-mcp__*_cell",
      "mcp__godot-mcp__*_cells*",
      "mcp__godot-mcp__*_layer",
      "mcp__godot-mcp__convert_coords"
    ]
  }
}
```

**Example: 2D game - exclude GridMap tools (save ~6.5k tokens)**
```json
{
  "permissions": {
    "deny": [
      "mcp__godot-mcp__*gridmap*",
      "mcp__godot-mcp__*meshlib*",
      "mcp__godot-mcp__*_by_item"
    ]
  }
}
```

## Development

```bash
# Server development
cd server
npm run dev

# Run tests
npm test
```

## License

MIT
