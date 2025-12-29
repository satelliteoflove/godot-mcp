# godot-mcp Documentation

MCP (Model Context Protocol) server for Godot Engine integration.

## Overview

This server provides **34 tools** and **3 resources** for AI-assisted Godot development.

## Quick Links

- [Tools Reference](tools/README.md) - All available MCP tools
- [Resources Reference](resources.md) - MCP resources for reading project data

## Tool Categories

| Category | Tools | Description |
|----------|-------|-------------|
| [Scene](tools/scene.md) | 4 | Scene management tools |
| [Node](tools/node.md) | 5 | Node manipulation tools |
| [Script](tools/script.md) | 5 | GDScript management tools |
| [Editor](tools/editor.md) | 6 | Editor control and debugging tools |
| [Project](tools/project.md) | 4 | Project information tools |
| [Screenshot](tools/screenshot.md) | 2 | Screenshot capture tools |
| [Animation](tools/animation.md) | 3 | Animation query, playback, and editing tools |
| [TileMap/GridMap](tools/tilemap.md) | 4 | TileMap and GridMap editing tools |
| [Resource](tools/resource.md) | 1 | Resource inspection tools for SpriteFrames, TileSet, Materials, etc. |

## Installation

```bash
npx @anthropic-ai/create-mcp@latest init godot-mcp
```

Or add to your MCP configuration:

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
