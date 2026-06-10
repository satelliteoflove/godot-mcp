# godot-mcp Documentation

MCP (Model Context Protocol) server for Godot Engine integration.

## Overview

This server provides **14 tools** and **3 resources** for AI-assisted Godot development.

## Quick Links

- [Claude Code Setup Guide](claude-code-setup.md) - Configure your project for AI-assisted development
- [Tools Reference](tools/README.md) - All available MCP tools
- [Resources Reference](resources.md) - MCP resources for reading project data

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| [Scene](tools/scene.md) | 1 | Scene management tools |
| [Node](tools/node.md) | 1 | Node manipulation and script attachment tools |
| [Editor](tools/editor.md) | 1 | Editor control, debugging, and screenshot tools |
| [Project](tools/project.md) | 1 | Project information tools |
| [Animation](tools/animation.md) | 1 | Animation query, playback, and editing tools |
| [TileMapLayer/GridMap](tools/tilemap.md) | 2 | TileMapLayer and GridMap editing tools (uses Godot 4.3+ TileMapLayer, not deprecated TileMap) |
| [Resource](tools/resource.md) | 1 | Resource inspection tools for SpriteFrames, TileSet, Materials, etc. |
| [Scene3D](tools/scene3d.md) | 1 | 3D spatial information and bounding box tools |
| [Documentation](tools/docs.md) | 1 | Fetch Godot Engine documentation with smart extraction |
| [Input](tools/input.md) | 1 | Input injection for testing running games: named actions, joypad buttons, analog axes and stick vectors, and text typing (no mouse/coordinate input) |
| [Profiler](tools/profiler.md) | 1 | Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections |
| [Runtime State](tools/runtime-state.md) | 1 | Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Much cheaper than screenshots. |
| [Game Script Execution](tools/exec.md) | 1 | Run GDScript inside the running game for test scenario setup: one-shot state mutations plus persistent holder-managed nodes, behind a denylist accident guard. |

## Installation

Add to your MCP configuration:

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

## Requirements

- Godot 4.5+ (required for Logger class)
- godot-mcp addon installed and enabled in your Godot project

---

*This documentation is auto-generated from tool definitions.*
