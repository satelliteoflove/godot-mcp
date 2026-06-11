# godot-mcp

[![npm version](https://img.shields.io/npm/v/%40satelliteoflove%2Fgodot-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/@satelliteoflove/godot-mcp)
[![CI](https://github.com/satelliteoflove/godot-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/satelliteoflove/godot-mcp/actions/workflows/ci.yml)
[![Godot 4.5+](https://img.shields.io/badge/Godot-4.5%2B-478cbf?logo=godotengine&logoColor=white)](https://godotengine.org)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/satelliteoflove/godot-mcp/blob/main/LICENSE)

Give your AI assistant eyes and hands in the Godot editor — and a running game it can actually playtest.

<!-- HERO PLACEHOLDER: short demo GIF goes here (agent running the game, stepping time, reading state). Use an absolute raw.githubusercontent.com URL so it also renders on npm. -->

## Why this one?

There are a few Godot MCP servers out there, and most can open a scene and poke at nodes. This one is built around a harder problem: **letting an agent verify its own work.** Run the game, drive it like a player, observe what actually happened, and prove the change did what it claimed — without you ferrying screenshots and error logs back and forth.

The pieces that make that possible, and that you won't find elsewhere:

- **Deterministic playtesting.** Freeze the game clock, step exact slices of game time (or step *until a condition holds*), with inputs riding inside the window. Observation never races the game.
- **Cheap observation.** Live entity state — positions, velocities, animation state, your own custom data — as structured JSON. Most "what's happening on screen?" questions get answered without spending vision tokens on a screenshot.
- **Real input.** Named actions with analog strength, joypad buttons and stick vectors, raw keys with modifier combos, relative mouse-look, text typing. Sequences run with precise timing and can prove they changed game state.
- **Scenario setup.** Run GDScript inside the running game: grant the weapon, skip to wave 3, spawn a test bot — no debug hooks baked into your game code.

Here's what that looks like when an agent tests a boss fight:

```text
godot_editor        run frozen=true           # boot with game time frozen at frame 0
godot_exec          GameState.wave = 3        # set up the scenario worth testing
godot_game_time     step_until "tree.get_nodes_in_group('boss').size() >= 1"
godot_runtime_state digest                    # exact positions and state — no pixels, no guessing
godot_game_time     step 500ms + dodge input  # play the moment that matters
godot_editor        screenshot_game           # and a screenshot when it's actually worth the tokens
```

Less copy-paste, more creating.

## Quick Start

### 1. Configure your AI assistant

Add godot-mcp to your MCP client. See the [Installation Guide](INSTALL.md) for config examples (Claude Desktop, Claude Code, VSCode/Copilot, and more). The short version:

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

Enable it in Godot: **Project > Project Settings > Plugins > Godot MCP**

### 3. Start building

Open your Godot project, restart your AI assistant, and start building. If anything refuses to connect, the [Troubleshooting Guide](docs/troubleshooting.md) has you covered.

## What's in the box

15 tools, ~90 actions, 3 MCP resources. Full API docs in the [Tools Reference](docs/tools/README.md).

| Tool | What it does |
|------|--------------|
| `godot_scene` | Open, save, and create scenes |
| `godot_node` | Create, update, delete, and reparent nodes; attach scripts; connect signals |
| `godot_editor` | Editor state, selection, run/stop/restart, screenshots, editor error log, 2D viewport control |
| `godot_project` | Project info and settings |
| `godot_animation` | Query, play, and edit animations down to individual tracks and keyframes |
| `godot_tilemap` / `godot_gridmap` | Read and edit TileMapLayer and GridMap cells |
| `godot_resource` | Inspect resources with type-aware output: SpriteFrames, TileSet, Materials, Textures |
| `godot_scene3d` | 3D transforms, bounding boxes, and visibility for spatial reasoning |
| `godot_docs` | Fetch Godot documentation as clean markdown, version-matched to your editor |
| `godot_input` | Inject input into the running game: actions, joypad, raw keys, mouse-look, text |
| `godot_profiler` | Metric snapshots and per-frame time series with spike detection |
| `godot_runtime_state` | Live game state as JSON: one-shot digests, watch windows, signal timelines |
| `godot_game_time` | Freeze, step, and step-until on the game clock — deterministic observation |
| `godot_exec` | Run GDScript inside the running game for test scenario setup |

A note on shape: this kit deliberately stays at 15 tools rather than 90. Related operations live as actions inside one tool, so your agent's context isn't flooded with tool definitions it won't use.

## Things to ask for

A feel for what an agent can do with this, in plain prompts:

- *"Run the game and screenshot the title screen. Does the layout survive 1280x720?"*
- *"The player can clip through the east wall. Reproduce it, then check the collision shapes and tell me why."*
- *"Step the game until the second wave spawns and give me every enemy's position and velocity."*
- *"Hold the left stick at half deflection for two seconds — does the walk animation blend correctly?"*
- *"Profile ten seconds of gameplay and find what's causing the frame spikes."*
- *"Add a hit-flash animation to the Player: modulate to red and back over 0.2 seconds."*

For richer runtime observation, add key nodes to the `mcp_watch` group or give them a `_mcp_state()` method — see the [Runtime State Guide](docs/runtime-state-guide.md).

## How it works

```text
┌─────────────────┐   stdio    ┌─────────────────┐  WebSocket   ┌──────────────────┐  debugger   ┌──────────────┐
│   MCP client    │ ◄────────► │  godot-mcp      │ ◄──────────► │  Bridge addon    │ ◄─────────► │ Running game │
│ (Claude, etc.)  │            │  server (Node)  │   :6550      │  (Godot editor)  │    wire     │  (autoload)  │
└─────────────────┘            └─────────────────┘              └──────────────────┘             └──────────────┘
```

The server talks to an editor addon over a local WebSocket; the addon reaches into the running game over Godot's own debugger protocol, so the game process needs no extra ports or setup. The addon binds to `127.0.0.1` by default. WSL2 is fully supported (auto-detection, host IP discovery, configurable bind modes) — see the [Installation Guide](INSTALL.md#wsl-support).

Curious about connection lifecycles, the single-client policy, or how frozen-time stepping works under the hood? The [Architecture Guide](docs/architecture.md) goes deep.

## Works well with minimal-godot-mcp

[minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) by [@ryanmazzolini](https://github.com/ryanmazzolini) covers exactly what this server doesn't: LSP diagnostics for fast static GDScript checking, and the running game's console output over DAP. This server covers everything that needs an editor bridge. No overlap, no conflict — run both, and your agent gets static analysis and the game console alongside full editor and runtime control.

One caveat: a Godot editor serves a single godot-mcp client at a time. Extra clients (a subagent inheriting your MCP config, say) wait their turn rather than hijacking your session — details in [Troubleshooting](docs/troubleshooting.md#one-client-at-a-time).

## Documentation

- [Installation Guide](INSTALL.md) — MCP client configs for Claude Desktop, Claude Code, VSCode/Copilot, and more
- [Troubleshooting](docs/troubleshooting.md) — connection checklist, CLI smoke test, common fixes
- [Claude Code Setup Guide](docs/claude-code-setup.md) — CLAUDE.md template for Godot projects
- [Runtime State Guide](docs/runtime-state-guide.md) — expose game state to agents via `mcp_watch` and `_mcp_state()`
- [Tools Reference](docs/tools/README.md) — all 15 tools with full API docs
- [Resources Reference](docs/resources.md) — MCP resources for reading project data
- [Architecture Guide](docs/architecture.md) — how the server, addon, and game bridge fit together
- [Contributing](CONTRIBUTING.md) — dev setup, adding tools, release process
- [Changelog](server/CHANGELOG.md) — release history

## Requirements

- **Godot 4.5+** (the addon uses the Logger class introduced in 4.5)
- **Node.js 20+**
- Any MCP client that speaks stdio

## Development

```bash
cd server
npm install && npm run build
npm test
npm run generate-docs
```

Contributions welcome — this project favors tools that solve real, time-wasting problems. Read [CONTRIBUTING.md](CONTRIBUTING.md) before building something big, or open an issue and we'll figure out the right shape together.

## License

[MIT](LICENSE)
