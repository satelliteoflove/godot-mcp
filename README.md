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

### Scene Tools
- `get_scene_tree` - Get the full scene hierarchy
- `open_scene` - Open a scene file
- `save_scene` - Save the current scene
- `create_scene` - Create a new scene

### Node Tools
- `get_node_properties` - Get properties of a node
- `create_node` - Create a new node
- `update_node` - Modify node properties
- `delete_node` - Remove a node

### Script Tools
- `get_script` - Read a script file
- `create_script` - Create a new script
- `edit_script` - Modify a script

### Project Tools
- `list_project_files` - List scripts, scenes, or assets
- `get_editor_state` - Get current editor state
- `run_project` - Run the project
- `stop_project` - Stop the running project
- `get_debug_output` - Get debug/print output

### Screenshot Tools
- `capture_game_screenshot` - Capture the running game viewport
- `capture_editor_screenshot` - Capture the editor 2D or 3D viewport

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
