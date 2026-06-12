# Tools Reference

This documentation is auto-generated from the tool definitions.

## [Scene](scene.md)

Scene management tools

- `godot_scene` - Manage scenes: open, save, or create scenes

## [Node](node.md)

Node manipulation and script attachment tools

- `godot_node` - Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts, connect signals

## [Editor](editor.md)

Editor control, debugging, and screenshot tools

- `godot_editor` - Control the Godot editor: get state, manage selection, run/stop project, restart the editor, capture screenshots, read log messages and stack traces, control 2D viewport

## [Project](project.md)

Project information tools

- `godot_project` - Get project information and settings

## [Animation](animation.md)

Animation query, playback, and editing tools

- `godot_animation` - Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, seek. Edit: create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

## [TileMapLayer/GridMap](tilemap.md)

TileMapLayer and GridMap editing tools (uses Godot 4.3+ TileMapLayer, not deprecated TileMap)

- `godot_tilemap` - Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates
- `godot_gridmap` - Query and edit GridMap data: list gridmaps, get info, get/set cells

## [Resource](resource.md)

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

- `godot_resource` - Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.

## [Scene3D](scene3d.md)

3D spatial information and bounding box tools

- `godot_scene3d` - Get spatial information for 3D nodes: global transforms, bounding boxes, visibility. Use get_spatial_info for node details, get_bounds for combined AABB of a subtree.

## [Documentation](docs.md)

Fetch Godot Engine documentation with smart extraction

- `godot_docs` - Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.

## [Input](input.md)

Input injection for testing running games: named actions, joypad buttons, analog axes and stick vectors, raw keyboard keys with modifier combos, relative mouse-look, and text typing (no absolute cursor positioning)

- `godot_input` - Inject input into a running Godot game for testing: named actions (with analog strength), joypad buttons, analog axes, stick vectors, raw keyboard keys (with modifier combos), and relative mouse-look. Use get_map to discover available input actions and their bindings, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: relative mouse-look is supported (look: [dx, dy], for FPS-camera _input handlers); absolute cursor positioning is not (see docs/design/mouse-input-spike.md).

## [Profiler](profiler.md)

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

- `godot_profiler` - Performance profiling and analysis: snapshot all engine metrics, collect per-frame time series data with spike detection, list active _process/_physics_process scripts, inspect signal connections

## [Runtime State](runtime-state.md)

Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Works out of the box for both 2D and 3D scenes (the auto fallback surfaces visible 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas — not just UI). Much cheaper than screenshots.

- `godot_runtime_state` - Observe live game state as structured data. Use digest for a one-shot entity snapshot (replaces most screenshot_game calls). Use watch_start → watch_collect for state-over-time without context blowup.

## [Game Time Control](game-time.md)

Deterministic game-clock control: freeze the running game, step a bounded slice of game time (or step until a condition holds) with inputs riding inside the window, then thaw — so observation is not racing ahead between tool calls.

- `godot_game_time` - Make game time answer to your clock instead of racing ahead between tool calls: freeze the running game, observe it at leisure (screenshots and state digests work while frozen), then step forward a bounded slice of game time (step) — or until a condition you specify holds (step_until) — with inputs riding inside the window. The game's own pause menu is layered correctly: freezing over it, stepping under it, and thawing back to it all preserve the game's pause intent.

## [Game Script Execution](exec.md)

Run GDScript inside the running game for test scenario setup: one-shot state mutations plus persistent holder-managed nodes, behind a denylist accident guard.

- `godot_exec` - Execute GDScript inside the RUNNING game process — the scenario-setup primitive: grant weapons, skip waves, spawn entities, arm persistent test bots, without baking debug hooks into game code. Errors when no game is running. For launch-time setup, compose: godot_editor run frozen=true -> godot_exec run (mutate state, attach bots under `holder`) -> godot_game_time thaw. A static denylist rejects accidental process/file-write escape (OS.execute, DirAccess, write-mode FileAccess, ResourceSaver, ProjectSettings.save, ...) and names the offending token — an accident guard, NOT a security boundary. Compile errors reject the call with the parser message; runtime errors come back in runtime_errors with the call still completing.

## [Mesh Validation](validate-meshes.md)

Detect silently corrupt procedurally generated mesh data (inside-out winding, dropped triangles, degenerate UVs, NaN normals/tangents) that renders without errors and masquerades as lighting problems. Findings carry their likely cause and fix; a cheap scene-load sniff also attaches one-line warnings to game screenshots.

- `godot_validate_meshes` - Check every code-built (ArrayMesh) surface in the RUNNING game for silent data corruption that renders WITHOUT any error. Run this FIRST when rendering looks wrong and no error is reported anywhere: surfaces pure black or far too dark, floors/walls invisible or see-through, geometry visible from only one side, lighting that ignores light-energy changes, scenes that "tuning" cannot fix. Detects: inside-out or mixed triangle winding (Godot front faces wind clockwise — wrong winding = culled faces or inverted lighting normals), dropped triangles / orphaned vertices (e.g. SurfaceTool.append_from of an indexed mesh mixed with raw add_vertex silently discards most of the batch), degenerate UVs that make generate_tangents() emit garbage, and NaN/zero normals or tangents. Every finding includes its likely cause and the fix. Read-only and cheap. Walks the current scene only (meshes parented elsewhere under root are not seen). Also run it after writing or changing mesh-generation code — BEFORE spending time tuning lights or materials to rescue a "too dark" scene.

