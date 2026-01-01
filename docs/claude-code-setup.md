# Setting Up Claude Code for Godot Development

This guide explains how to configure your Godot project to get the most out of godot-mcp with Claude Code.

## CLAUDE.md Configuration

Add a `CLAUDE.md` file to your Godot project root with guidance on when and how to use the MCP tools. Here's a recommended template:

```markdown
# CLAUDE.md

## Godot MCP Tools

This project uses godot-mcp for AI-assisted development. The MCP provides real-time access to the Godot editor.

### When to Use MCP Tools vs File Editing

**Use MCP tools for:**
- Running and stopping the game (`editor` run/stop)
- Capturing screenshots of game or editor (`editor` screenshot_game/screenshot_editor)
- Reading debug output from running games (`editor` get_debug_output)
- Inspecting node properties at runtime (`node` get_properties)
- Finding nodes by pattern (`node` find)
- Getting project settings, especially input mappings (`project` get_settings with category)
- Inspecting complex resources like SpriteFrames or TileSets (`resource` get_info)
- Editing animations (complex format, easy to break)
- Editing TileMapLayers or GridMaps (coordinate systems, cell data)

**Use direct file editing for:**
- GDScript files (.gd) - plain text, easy to edit
- Simple scene modifications - when you know the exact structure
- Project settings (project.godot) - when you know the key names
- Shader files (.gdshader) - plain text

### Teaching and Guidance Workflow

When helping the user navigate the Godot UI:
1. Use `editor` get_state to see what scene is open and which panel (2D/3D/Script) is active
2. Use `editor` get_selection to see what the user has selected
3. Use `editor` select to highlight a specific node you're discussing
4. Use `node` get_properties to examine node configuration
5. Use `editor` screenshot_editor to see the current editor state visually
6. Use `resource` get_info to explain resource structure (like SpriteFrames)

### Debugging Workflow

When debugging issues:
1. Use `editor` run to start the game
2. Use `editor` screenshot_game to see what's happening visually
3. Use `editor` get_debug_output to check for errors or print statements
4. Use `editor` get_performance to check FPS and resource usage
5. Use `node` find to locate nodes in the running scene
6. Use `editor` stop when done

### Common Patterns

**Before modifying a scene:** Always use `node` get_properties to understand existing configuration.

**When user is confused about UI:** Use `editor` select to highlight the node, then guide them through the inspector.

**When debugging animation issues:** Use `resource` get_info on the SpriteFrames or AnimationLibrary resource.
```

## Why This Configuration Matters

Claude Code reads CLAUDE.md at the start of each conversation. By documenting when to use MCP tools vs direct file editing, you help Claude:

1. **Choose the right approach** - MCP for runtime features, files for simple edits
2. **Use efficient workflows** - Like `project get_settings` with category filter instead of parsing project.godot
3. **Guide you through the UI** - Using select, get_selection, and screenshots to teach
4. **Debug effectively** - Combining screenshots, debug output, and performance metrics

## Tool Capabilities Quick Reference

| Capability | Tool | Action |
|------------|------|--------|
| See what's open | `editor` | get_state |
| See user's selection | `editor` | get_selection |
| Highlight a node | `editor` | select |
| Run game | `editor` | run |
| Stop game | `editor` | stop |
| Game screenshot | `editor` | screenshot_game |
| Editor screenshot | `editor` | screenshot_editor |
| Console output | `editor` | get_debug_output |
| FPS/memory stats | `editor` | get_performance |
| Node configuration | `node` | get_properties |
| Find nodes | `node` | find |
| Input mappings | `project` | get_settings (category: input) |
| SpriteFrames info | `resource` | get_info |
