# godot-mcp Roadmap

## Current Status: Alpha (v0.1.x)

Core implementation complete, published to npm as [@satelliteoflove/godot-mcp](https://www.npmjs.com/package/@satelliteoflove/godot-mcp).

**Minimum Godot Version: 4.5** (required for Logger class)

## Completed

### P0 - Core Features
- [x] WebSocket connection with auto-reconnect
- [x] Scene tools: get_scene_tree, open/save/create_scene
- [x] Node tools: get_node_properties, create/update/delete/reparent_node
- [x] Script tools: get_script, create/edit_script, attach/detach_script
- [x] Basic error handling with structured responses

### P1 - Extended Features
- [x] Project tools: get_project_info, list_project_files, search_files, get_project_settings
- [x] Editor tools: get_editor_state, get_selected_nodes, select_node
- [x] Run/stop project
- [x] Debug output capture (via Godot 4.5 Logger class)

### Infrastructure
- [x] TypeScript MCP server with official SDK
- [x] GDScript EditorPlugin with WebSocket server
- [x] Status panel in Godot bottom dock
- [x] Project-scoped MCP config support
- [x] GitHub Actions CI/CD (build, test, release-please)
- [x] npm package publishing with OIDC trusted publishing
- [x] Basic test suite (registry, schema) - see [#1](https://github.com/satelliteoflove/godot-mcp/issues/1) for expansion

## In Progress

### Testing
- [x] Verify MCP server <-> Godot WebSocket connection
- [x] Test all tools with real Godot project
- [ ] Edge cases: no scene open, invalid paths, etc.

## TODO

### P2 - Nice to Have
- [x] Resource assignment (scripts, materials, PackedScenes)
- [x] Animation support (AnimationPlayer read/write)
- [x] Screenshot capture for visual AI context
- [x] TileMap/GridMap editing (TileMapLayer and GridMap read/write)

### Quality
- [ ] Comprehensive unit tests (see [#1](https://github.com/satelliteoflove/godot-mcp/issues/1))
- [ ] Integration tests with mock Godot

### Documentation
- [ ] Getting started guide
- [ ] API reference for all tools
- [ ] Troubleshooting guide
- [ ] Contributing guide

## Known Issues

None currently - all previously tracked issues have been resolved:
- Debug output capture now uses Godot 4.5 Logger class
- Script attachment now includes filesystem scan, reload, and verification
- Resource paths now handled correctly via MCPUtils path utilities

## Architecture Notes

```
[Claude/IDE] <--stdio--> [MCP Server (TS)] <--WebSocket:6550--> [Godot Addon (GDScript)]
```

- MCP Server is a WebSocket **client** that connects to Godot
- Godot addon runs a WebSocket **server** on port 6550
- JSON-RPC style messages with id/command/params pattern
- Responses include status (success/error) and result/error object

## References

- [MCP SDK Docs](https://modelcontextprotocol.io/docs/sdk)
- [Godot EditorPlugin](https://docs.godotengine.org/en/stable/classes/class_editorplugin.html)
- [Godot EditorInterface](https://docs.godotengine.org/en/stable/classes/class_editorinterface.html)
- Original plan: see `.claude/plans/ethereal-shimmying-brooks.md`
