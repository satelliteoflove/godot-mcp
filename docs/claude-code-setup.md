# Setting Up Claude Code for Godot Development

Add a `CLAUDE.md` file to your Godot project root so Claude Code knows when to use MCP tools vs direct file editing.

While you're setting up, add [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) to your MCP config alongside godot-mcp. The two are complementary: godot-mcp handles editor, scene, and runtime control; minimal-godot-mcp handles static GDScript diagnostics (LSP) and the running game's console output, with no addon. See [Works Well With](../README.md#works-well-with).

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

This project also uses [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp). Use it for static GDScript diagnostics (LSP) and the running game's console output and stderr; use godot-mcp for editor and scene control, runtime state, input injection, and editor-side errors.
```

Adjust to fit your project. The model already has access to tool descriptions and will figure out workflows on its own - this template just covers the non-obvious stuff.

## Exposing Game State

To let agents read live game state as structured data (instead of inferring it from
screenshots), tag the entities that matter into the `mcp_watch` group and optionally
implement `func _mcp_state() -> Dictionary` on them. See the
[Runtime State Guide](runtime-state-guide.md) for the conventions, the `_mcp_state()`
contract, and examples.
