# godot-mcp

MCP server that connects Claude to your Godot editor. Less copy-paste, more creating.

## Why This Exists

Using AI assistants for game dev means a lot of back-and-forth: copying error messages, describing what's on screen, pasting debug output, manually applying suggested changes. It works, but it's tedious.

This MCP gives Claude direct access to your Godot editor. It can see your scene tree, capture screenshots, read errors, and make changes directly. You stay focused on the creative work while the mechanical relay disappears. Faster iterations, less busywork, more time building the game you actually want to make.

## Quick Start

### 1. Configure your AI assistant

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

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

**Claude Code** (`.mcp.json` in your project):

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

### 2. Install the Godot addon

```bash
npx @satelliteoflove/godot-mcp --install-addon /path/to/your/godot/project
```

Enable in Godot: **Project Settings > Plugins > Godot MCP**

### 3. Go

Open your Godot project, restart your AI assistant, and start building.

## What Claude Can Do

- **See** your editor, scenes, running game, errors, and performance
- **Inspect** nodes, resources, animations, tilemaps, 3D spatial data
- **Modify** scenes, nodes, scripts, animations, tilemaps directly
- **Test** by running the game and injecting input
- **Learn** by fetching Godot docs on demand

## Documentation

- [Claude Code Setup Guide](docs/claude-code-setup.md) - CLAUDE.md templates and workflows
- [Tools Reference](docs/tools/README.md) - All 11 tools with full API docs
- [Resources Reference](docs/resources.md) - MCP resources for reading project data
- [Contributing](CONTRIBUTING.md) - Dev setup, adding tools, release process
- [Changelog](server/CHANGELOG.md) - Release history

## Architecture

```
[Claude/AI Assistant/MCP Client] <--stdio--> [MCP Server] <--WebSocket:6550--> [Godot MCP Bridge Addon]
```

### WSL Support

The MCP server has built-in support for Windows Subsystem for Linux (WSL2):

- **Auto-detection**: MCP server automatically detects WSL environment via environment variables and `/proc/version`
- **Host IP discovery**: Auto-discovers Windows host IP from WSL to connect to Godot running on Windows
- **Configuration**:
  - `GODOT_HOST` overrides the Godot addon host (auto-detected in WSL)
  - `GODOT_PORT` overrides the Godot addon port (default `6550`)

**Security note:** the Godot addon binds to `127.0.0.1` by default.

In the Godot Editor bottom panel (**MCP**), you can configure what the addon listens on:
- **Bind mode: Localhost** (default) → `127.0.0.1`
- **Bind mode: WSL** → Windows `vEthernet (WSL)` IPv4 (required for Windows Godot + WSL2 server)
- **Bind mode: Custom** → bind to a specific IP
- **Port override** → change the listen port from `6550`

If you enable **Port override**, set `GODOT_PORT` on the server to match.

## CLI smoke test (paste-ready JSON-RPC)

If you run the server manually via CLI (for example: `npx -y @satelliteoflove/godot-mcp`), you can paste these **stdio JSON-RPC frames** to verify it responds and can reach Godot:

1) Write in CLI

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cli-test","version":"0"}}}
```

2) Response

```json
{"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{},"resources":{},"logging":{}},"serverInfo":{"name":"godot-mcp","version":"2.11.0"}},"jsonrpc":"2.0","id":1}
```

3) Call a tool

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"editor","arguments":{"action":"get_state"}}}
```

4) Response

```json
{"result":{"content":[{"type":"text","text":"{\n  \"current_scene\": null,\n  \"godot_version\": \"4.5.1-stable (official)\",\n  \"is_playing\": false,\n  \"main_screen\": \"unknown\",\n  \"open_scenes\": []\n}"}]},"jsonrpc":"2.0","id":2}
```

Tip: If you enabled **Port override** in the Godot MCP panel, start the server with matching env vars (or export as environment variable):
`GODOT_HOST=... GODOT_PORT=... npm run start` or `GODOT_HOST=... GODOT_PORT=... npx -y @satelliteoflove/godot-mcp`

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
