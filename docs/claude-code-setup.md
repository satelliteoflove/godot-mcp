# Setting Up Claude Code for Godot Development

Add a `CLAUDE.md` file to your Godot project root so Claude Code knows when to use MCP tools vs direct file editing.

## Recommended CLAUDE.md Template

```markdown
# CLAUDE.md

## Godot MCP

This project uses godot-mcp for AI-assisted development.

### When to Use MCP Tools vs File Editing

**Use MCP tools for:**
- Runtime interaction: running/stopping the game, screenshots, debug output, input injection
- Inspecting or modifying nodes, scenes, animations, tilemaps, and GridMaps (complex formats that are easy to break by hand)
- Querying editor state, selection, project settings, 3D spatial data
- Fetching Godot documentation
- Inspecting resources like SpriteFrames, TileSets, and Materials

**Use direct file editing for:**
- GDScript (.gd) and shader (.gdshader) files - plain text, safe to edit directly
- Simple scene modifications when you know the exact structure
- Project settings (project.godot) when you know the key names

### Companion Server

For language server diagnostics and raw console output, use [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) alongside this server. They complement each other without overlap.
```

Adjust to fit your project. The model already has access to tool descriptions and will figure out workflows on its own - this template just covers the non-obvious stuff.
