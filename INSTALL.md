# Installation Guide

How to connect godot-mcp to your MCP client. If something refuses to connect after setup, see the [Troubleshooting Guide](docs/troubleshooting.md).

## Prerequisites

- **Node.js 20+** - the MCP server runs on Node
- **Godot 4.5+** - required for Logger class support
- **godot-mcp addon installed and enabled** in your Godot project (see [Quick Start](README.md#quick-start) step 2)

## Generic MCP Client

Any MCP client that supports stdio transport can use godot-mcp. The command and arguments are the same regardless of client:

- **Command:** `npx`
- **Args:** `["-y", "@satelliteoflove/godot-mcp"]`

If your client takes a single command string instead of command + args:

```
npx -y @satelliteoflove/godot-mcp
```

Use this as a starting point and adapt to your client's config format.

## Claude Desktop

Config file locations:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux:** `~/.config/Claude/claude_desktop_config.json`

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

Restart Claude Desktop after saving.

## Claude Code

Add a `.mcp.json` file to your project root:

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

Claude Code picks this up automatically when you open the project.

## VSCode with GitHub Copilot

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "godot-mcp": {
      "command": "npx",
      "args": ["-y", "@satelliteoflove/godot-mcp"]
    }
  }
}
```

Copilot Chat agent mode will detect the server when you open the workspace.

## GitHub Copilot CLI

Configure via the `gh` CLI:

```bash
gh copilot config set mcp-servers '{
  "godot-mcp": {
    "command": "npx",
    "args": ["-y", "@satelliteoflove/godot-mcp"]
  }
}'
```

Or add to your Copilot CLI settings file (`~/.config/github-copilot/mcp.json`):

```json
{
  "godot-mcp": {
    "command": "npx",
    "args": ["-y", "@satelliteoflove/godot-mcp"]
  }
}
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GODOT_HOST` | `localhost` | WebSocket host for the Godot addon. Auto-detected in WSL. |
| `GODOT_PORT` | `6550` | WebSocket port for the Godot addon. |
| `GODOT_MCP_USAGE_LOG` | on | Local usage telemetry: each tool call appends a JSON line (tool, action, success, duration) to `~/.godot-mcp/usage.log`. **Enabled by default** — set to `0` or `false` to disable. The log never leaves your machine. |
| `GODOT_MCP_USAGE_LOG_MAX_SIZE` | `10485760` (10MB) | Size in bytes at which `usage.log` is rotated. |
| `GODOT_MCP_VERBOSE` | off | Set to `1` to surface info/debug logs on stderr. Warnings and errors always print. |
| `GODOT_MCP_READ_ONLY` | off | Set to `1` to register only the 12 observation tools — the agent can look but not touch. Same as `--read-only`. |

Example with environment variables:

```bash
GODOT_HOST=192.168.1.100 GODOT_PORT=7000 npx -y @satelliteoflove/godot-mcp
```

### Read-only mode

Start the server with `--read-only` (or `GODOT_MCP_READ_ONLY=1`) to register only the 12 observation tools — no scene, node, animation, tilemap, or gridmap edits, no input injection, no running the game. Useful for agents that should inspect a project without being able to modify it:

```bash
npx -y @satelliteoflove/godot-mcp --read-only
```

## WSL Support

The MCP server has built-in support for Windows Subsystem for Linux (WSL2):

- **Auto-detection**: MCP server automatically detects WSL environment via environment variables and `/proc/version`
- **Host IP discovery**: Auto-discovers Windows host IP from WSL to connect to Godot running on Windows

**Security note:** the Godot addon binds to `127.0.0.1` by default.

In the Godot Editor bottom panel (**MCP**), you can configure what the addon listens on:
- **Bind mode: Localhost** (default) - `127.0.0.1`
- **Bind mode: WSL** - Windows `vEthernet (WSL)` IPv4 (required for Windows Godot + WSL2 server)
- **Bind mode: Custom** - bind to a specific IP
- **Port override** - change the listen port from `6550`

If you enable **Port override**, set `GODOT_PORT` on the server to match.

## Don't see your client?

We only list configs that someone has actually tested. If you've got godot-mcp working with a client not listed here, open a [PR](https://github.com/satelliteoflove/godot-mcp/pulls) or [issue](https://github.com/satelliteoflove/godot-mcp/issues) with your verified setup instructions and we'll add it.
