# godot-mcp

MCP server that connects Claude to your Godot editor. Less copy-paste, more creating.

## Why This Exists

Using AI assistants for game dev means a lot of back-and-forth: copying error messages, describing what's on screen, pasting debug output, manually applying suggested changes. It works, but it's tedious.

This MCP gives Claude direct access to your Godot editor. It can see your scene tree, capture screenshots, read errors, and make changes directly. You stay focused on the creative work while the mechanical relay disappears. Faster iterations, less busywork, more time building the game you actually want to make.

## Quick Start

### 1. Configure your AI assistant

Add godot-mcp to your MCP client. See the [Installation Guide](INSTALL.md) for config examples (Claude Desktop, Claude Code, VSCode/Copilot, and more).

While you're at it, add [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) too — it's a complementary server that covers static GDScript diagnostics and the running game's console output. See [Works Well With](#works-well-with).

### 2. Install the Godot addon

```bash
npx @satelliteoflove/godot-mcp --install-addon /path/to/your/godot/project
```

Enable in Godot: **Project Settings > Plugins > Godot MCP**

### 3. Go

Open your Godot project, restart your AI assistant, and start building.

## What Claude Can Do

- **See** your editor, scenes, running game, editor errors, and performance
- **Inspect** nodes, resources, animations, tilemaps, 3D spatial data
- **Modify** scenes, nodes, scripts, animations, tilemaps directly
- **Test** by running the game and injecting input
- **Learn** by fetching Godot docs on demand

## Works Well With

[minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) by [@ryanmazzolini](https://github.com/ryanmazzolini) is another MCP server for Godot, and it's worth running alongside this one. This server drives the editor through an addon — scene and node manipulation, running the game, input injection, runtime state, screenshots, and editor-side errors (`@tool`, import, and addon failures). minimal-godot-mcp needs no addon and provides exactly the functionality this server does not implement: LSP diagnostics for fast static `.gd` checking, and the running game's console output and stderr over DAP.

Neither duplicates the other, and they don't conflict. Install both and you get static analysis and the live game console alongside full editor and runtime control.

**One godot-mcp client at a time, though.** A Godot editor bridge serves a single godot-mcp connection. If a second godot-mcp client connects - for example, a subagent that inherited the same MCP config - it is rejected while the first is active rather than displacing it, so the original session keeps working. The second client retries and connects automatically once the first disconnects. A client that crashes without closing its socket is taken over after a short idle timeout, so a dead session never permanently blocks new connections.

## Documentation

- [Installation Guide](INSTALL.md) - MCP client configs for Claude Desktop, Claude Code, VSCode/Copilot, and more
- [Claude Code Setup Guide](../docs/claude-code-setup.md) - CLAUDE.md template for Godot projects
- [Runtime State Guide](../docs/runtime-state-guide.md) - Expose game state to agents via the `mcp_watch` group and `_mcp_state()`
- [Tools Reference](../docs/tools/README.md) - All 12 tools with full API docs
- [Resources Reference](../docs/resources.md) - MCP resources for reading project data
- [Contributing](../CONTRIBUTING.md) - Dev setup, adding tools, release process
- [Changelog](CHANGELOG.md) - Release history

## Architecture

```
[Claude/AI Assistant/MCP Client] <--stdio--> [MCP Server] <--WebSocket:6550--> [Godot MCP Bridge Addon]
```

WSL2 is supported (auto-detection, host IP discovery, configurable bind modes). See the [Installation Guide](INSTALL.md#wsl-support) for setup details.

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
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"godot_editor","arguments":{"action":"get_state"}}}
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
