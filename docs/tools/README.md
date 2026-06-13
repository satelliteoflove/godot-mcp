# Tools Reference

This documentation is auto-generated from the tool definitions.

## [Scene](scene.md)

Scene management tools

- `godot_scene` - Manage scenes in the editor: open a scene, or save the open scene. To create a new scene, write the .tscn file directly — header [gd_scene format=3] without a uid (the editor assigns one when it imports the file), then one [node name="X" type="Node2D"] block per node — and open it with this tool.

## [Node](node.md)

Node manipulation and script attachment tools

- `godot_node_read` - Inspect scene nodes in the editor: read a node's effective properties (including class defaults a .tscn read cannot show), view the full scene tree as the editor sees it (including children inside instanced sub-scenes), and find nodes by name or type. Use it to discover node paths and verify the live state of the open scene before or after making changes. It cannot modify anything; to update properties or reparent a node, use godot_node_edit.
- `godot_node_edit` - Modify scene nodes in the editor: update a node's properties, or reparent it (the editor rewrites child paths and signal connections correctly; hand-editing .tscn for a reparent does not). Use it to change existing nodes in the open scene. To inspect properties, the scene tree, or search for nodes, use godot_node_read; to add or remove nodes, or attach scripts and connect signals, edit the .tscn file directly, then verify with godot_node_read's get_scene_tree.

## [Editor](editor.md)

Editor control, debugging, and screenshot tools

- `godot_editor_read` - Observe the editor and running game: get editor state (open scene, play state, camera, viewport), read the current node selection, pull editor log messages (with an incremental cursor) and stack traces, and capture lossless PNG screenshots of the running game or an editor viewport. Reach for it to check what the editor sees before and after a change; screenshot_game needs a running game, while every other action works in the bare editor. It changes nothing - to select nodes, run/stop/restart, or move the 2D viewport use godot_editor_edit; errors from the running game (not the editor process) come via minimal-godot-mcp's get_console_output when that companion server is installed.
- `godot_editor_edit` - Drive the editor: select a node, run or stop the project, restart the editor, and center/zoom the 2D viewport. Use run with frozen=true as the deterministic-playtest entry point (game time holds at frame 0 until godot_game_time steps or thaws it). To test edited gameplay scripts just stop then run — the launched game loads .gd/.tscn fresh from disk; reserve restart for EDITOR-side staleness (edited @tool/addon code, a stale project.godot, or a cached .gdshader). For observation only (state, selection, logs, screenshots) use godot_editor_read instead; restart does not start a cold editor, so one must already be running.

## [Project](project.md)

Project information tools

- `godot_project` - Read project-level data from the editor: name, path, Godot version, and main scene (get_info), plus project settings including input mappings (get_settings). After editing project.godot as a file, use check_stale to detect whether the editor is still running stale autoloads or input map from before the edit; restart via godot_editor_edit to reload. Use addon_status to diagnose addon/server version skew when commands misbehave or the connection drops. For scene contents or node properties, use godot_node_read instead.

## [Animation](animation.md)

Animation query, playback, and editing tools

- `godot_animation_read` - Inspect animation data on AnimationPlayer nodes in the editor: list players in the scene, read a player's state and libraries, get an animation's tracks and properties, and read a track's keyframes. Reach for it to verify what the editor actually loaded, including after editing animation resources by hand. It changes and previews nothing; use godot_animation_edit to create, modify, or play animations.
- `godot_animation_edit` - Create and modify animations on an AnimationPlayer and preview them in the editor: create, delete, or update animations, add and remove tracks and keyframes, and play, stop, or seek the editor's preview (playback controls the editor, not the running game). Pair each change with an immediate play or seek to check the result; this is the only way to verify animation feel without running the whole game. To inspect animation data without changing it, use godot_animation_read.

## [TileMapLayer/GridMap](tilemap.md)

TileMapLayer and GridMap editing tools (uses Godot 4.3+ TileMapLayer, not deprecated TileMap)

- `godot_tilemap_read` - Inspect TileMapLayer data in the open scene: list layers, get layer and TileSet info, read used cells, a single cell, or a rectangular region, and convert between local positions and map coordinates. Use it whenever you need to know what tiles are placed where; cell data is stored base64-encoded in the .tscn, so reading the file is not an alternative. To place, erase, or clear tiles, use godot_tilemap_edit instead.
- `godot_tilemap_edit` - Modify TileMapLayer cells in the open scene: set a single cell, erase a cell, clear a whole layer, or set many cells in one batch. Use it to paint or remove tiles; cell data is stored base64-encoded in the .tscn, so editing the file is not an alternative, and set_cells_batch beats repeated set_cell calls for anything beyond a few tiles. To inspect layers, TileSets, or existing cells without changing anything, use godot_tilemap_read.
- `godot_gridmap_read` - Inspect GridMap data in the open scene: list GridMap nodes, get map and MeshLibrary info, and read used cells, a single cell, or every cell using a given item. Use it whenever you need to know which mesh items occupy which 3D grid cells; cell data is stored base64-encoded in the .tscn, so reading the file is not an alternative. To place or clear cells, use godot_gridmap_edit instead.
- `godot_gridmap_edit` - Modify GridMap cells in the open scene: set a single cell to a MeshLibrary item with an orientation, clear a cell, clear the whole map, or set many cells in one batch. Use it to build or remove 3D grid content; cell data is stored base64-encoded in the .tscn, so editing the file is not an alternative, and set_cells_batch beats repeated set_cell calls for anything beyond a few cells. To inspect the map, its MeshLibrary, or existing cells without changing anything, use godot_gridmap_read.

## [Resource](resource.md)

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

- `godot_resource` - Inspect a Resource file by path with type-aware structured output (SpriteFrames animations, TileSet, Material, Texture2D, etc.). Use it for imported or binary resources (.res, .scn, compressed textures) that a plain file read cannot parse, or when you want sub-resources resolved into the engine's view rather than raw .tres text. For nodes inside a scene, use godot_node_read instead.

## [Scene3D](scene3d.md)

3D spatial information and bounding box tools

- `godot_scene3d` - Read engine-computed 3D spatial data that cannot be derived from .tscn text: global transforms resolved through the parent chain, mesh AABBs, combined subtree bounds, and visibility. Use get_spatial_info for one Node3D or a filtered set of its children (by type or world-space region); use get_bounds for the combined AABB of a subtree. Read-only: to change transforms or other properties, use godot_node_edit.

## [Documentation](docs.md)

Fetch Godot Engine documentation with smart extraction

- `godot_docs` - Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.

## [Input](input.md)

Input injection for testing running games: named actions, joypad buttons, analog axes and stick vectors, raw keyboard keys with modifier combos, relative mouse-look, and text typing (no absolute cursor positioning)

- `godot_input` - Inject input into a running Godot game for testing: named actions (with analog strength), joypad buttons, analog axes, stick vectors, raw keyboard keys (with modifier combos), and relative mouse-look. Use get_map to discover available input actions and their bindings, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: relative mouse-look is supported (look: [dx, dy], for FPS-camera _input handlers); absolute cursor positioning is not (see docs/design/mouse-input-spike.md).

## [Profiler](profiler.md)

Performance profiling: snapshots, per-frame time series with spike detection, active process inspection, signal connections

- `godot_profiler` - Profile a running game; every action errors if no game is playing. Use snapshot for one-shot engine metrics, or start → get_data for a per-frame time series with percentile stats, frame-budget usage, spike detection, and monitor trends. get_active_processes lists scripts with live _process/_physics_process callbacks (useful for finding per-frame cost sources); get_signal_connections maps signal wiring. For observing game state rather than performance, use godot_runtime_state.

## [Runtime State](runtime-state.md)

Observe live game entity state as structured JSON — positions, velocities, animation state, and custom _mcp_state() data. Works out of the box for both 2D and 3D scenes (the auto fallback surfaces visible 3D world nodes — meshes, gridmaps, cameras, lights, physics bodies and areas — not just UI). Much cheaper than screenshots.

- `godot_runtime_state` - Observe live game state as structured data. Use digest for a one-shot entity snapshot (replaces most godot_editor_read screenshot_game calls). Use watch_start → watch_collect for state-over-time without context blowup.

## [Game Time Control](game-time.md)

Deterministic game-clock control: freeze the running game, step a bounded slice of game time (or step until a condition holds) with inputs riding inside the window, then thaw — so observation is not racing ahead between tool calls.

- `godot_game_time` - Make game time answer to your clock instead of racing ahead between tool calls: freeze the running game, observe it at leisure (screenshots and state digests work while frozen), then step forward a bounded slice of game time (step) — or until a condition you specify holds (step_until) — with inputs riding inside the window. The game's own pause menu is layered correctly: freezing over it, stepping under it, and thawing back to it all preserve the game's pause intent.

## [Game Script Execution](exec.md)

Run GDScript inside the running game for test scenario setup: one-shot state mutations plus persistent holder-managed nodes, behind a denylist accident guard.

- `godot_exec` - Execute GDScript inside the RUNNING game process — the scenario-setup primitive: grant weapons, skip waves, spawn entities, arm persistent test bots, without baking debug hooks into game code. Errors when no game is running. For launch-time setup, compose: godot_editor_edit run frozen=true -> godot_exec run (mutate state, attach bots under `holder`) -> godot_game_time thaw. A static denylist rejects accidental process/file-write escape (OS.execute, DirAccess, write-mode FileAccess, ResourceSaver, ProjectSettings.save, ...) and names the offending token — an accident guard, NOT a security boundary. Compile errors reject the call with the parser message; runtime errors come back in runtime_errors with the call still completing.

## [Mesh Validation](validate-meshes.md)

Detect silently corrupt procedurally generated mesh data (inside-out winding, dropped triangles, degenerate UVs, NaN normals/tangents) that renders without errors and masquerades as lighting problems. Findings carry their likely cause and fix; a cheap scene-load sniff also attaches one-line warnings to game screenshots.

- `godot_validate_meshes` - Check every code-built (ArrayMesh) surface in the RUNNING game for silent data corruption that renders WITHOUT any error. Run this FIRST when rendering looks wrong and no error is reported anywhere: surfaces pure black or far too dark, floors/walls invisible or see-through, geometry visible from only one side, lighting that ignores light-energy changes, scenes that "tuning" cannot fix. Detects: inside-out or mixed triangle winding (Godot front faces wind clockwise — wrong winding = culled faces or inverted lighting normals), dropped triangles / orphaned vertices (e.g. SurfaceTool.append_from of an indexed mesh mixed with raw add_vertex silently discards most of the batch), degenerate UVs that make generate_tangents() emit garbage, and NaN/zero normals or tangents. Every finding includes its likely cause and the fix. Read-only and cheap. Walks the current scene only (meshes parented elsewhere under root are not seen). Also run it after writing or changing mesh-generation code — BEFORE spending time tuning lights or materials to rescue a "too dark" scene.

