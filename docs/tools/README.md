# Tools Reference

This documentation is auto-generated from the tool definitions.

## [Scene](scene.md)

Scene management tools

- `get_scene_tree` - Get the full hierarchy of nodes in the currently open scene
- `open_scene` - Open a scene file in the editor
- `save_scene` - Save the currently open scene
- `create_scene` - Create a new scene with a root node

## [Node](node.md)

Node manipulation tools

- `get_node_properties` - Get all properties of a node at the specified path
- `create_node` - Create a new node as a child of an existing node, or instantiate a packed scene
- `update_node` - Update properties of an existing node
- `delete_node` - Delete a node from the scene
- `reparent_node` - Move a node to a new parent

## [Script](script.md)

GDScript management tools

- `get_script` - Get the content of a GDScript file
- `create_script` - Create a new GDScript file
- `edit_script` - Replace the content of an existing GDScript file
- `attach_script` - Attach an existing script to a node
- `detach_script` - Remove the script from a node

## [Editor](editor.md)

Editor control and debugging tools

- `get_editor_state` - Get the current state of the Godot editor
- `get_selected_nodes` - Get the currently selected nodes in the editor
- `select_node` - Select a node in the editor
- `run_project` - Run the current Godot project
- `stop_project` - Stop the running Godot project
- `get_debug_output` - Get debug output/print statements from the running project

## [Project](project.md)

Project information tools

- `get_project_info` - Get information about the current Godot project
- `list_project_files` - List files in the project by type
- `search_files` - Search for files by name pattern
- `get_project_settings` - Get project settings

## [Screenshot](screenshot.md)

Screenshot capture tools

- `capture_game_screenshot` - Capture a screenshot of the running game viewport. The project must be running.
- `capture_editor_screenshot` - Capture a screenshot of the editor 2D or 3D viewport

## [Animation](animation.md)

Animation query, playback, and editing tools

- `animation_query` - Query animation data. Actions: list_players (find AnimationPlayers), get_info (player state), get_details (animation tracks/length), get_keyframes (track keyframes)
- `animation_playback` - Control animation playback. Actions: play, stop, pause, seek, queue, clear_queue
- `animation_edit` - Edit animations. Actions: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

## [TileMap/GridMap](tilemap.md)

TileMap and GridMap editing tools

- `tilemap_query` - Query TileMapLayer data. Actions: list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords
- `tilemap_edit` - Edit TileMapLayer cells. Actions: set_cell, erase_cell, clear_layer, set_cells_batch
- `gridmap_query` - Query GridMap data. Actions: list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item
- `gridmap_edit` - Edit GridMap cells. Actions: set_cell, clear_cell, clear, set_cells_batch

## [Resource](resource.md)

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

- `get_resource_info` - Load and inspect any Godot Resource by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc. Falls back to generic property inspection for unknown types.

