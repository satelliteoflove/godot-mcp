# Tools Reference

This documentation is auto-generated from the tool definitions.

## [Scene](scene.md)

Scene management tools

- `scene` - Manage scenes: open, save, or create scenes

## [Node](node.md)

Node manipulation and script attachment tools

- `node` - Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts

## [Editor](editor.md)

Editor control, debugging, and screenshot tools

- `editor` - Control the Godot editor: get state (includes viewport/camera info), manage selection, run/stop project, get debug output, get performance metrics, capture screenshots, set 2D viewport position/zoom

## [Project](project.md)

Project information tools

- `project` - Get project information and settings

## [Animation](animation.md)

Animation query, playback, and editing tools

- `animation` - Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, seek. Edit: create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

## [TileMap/GridMap](tilemap.md)

TileMap and GridMap editing tools

- `tilemap` - Query and edit TileMapLayer data: list layers, get info, get/set cells, convert coordinates
- `gridmap` - Query and edit GridMap data: list gridmaps, get info, get/set cells

## [Resource](resource.md)

Resource inspection tools for SpriteFrames, TileSet, Materials, etc.

- `resource` - Manage Godot resources: inspect Resource files by path. Returns type-specific structured data for SpriteFrames, TileSet, Material, Texture2D, etc.

## [Scene3D](scene3d.md)

3D spatial information and bounding box tools

- `scene3d` - Get spatial information for 3D nodes: global transforms, bounding boxes, visibility. Use get_spatial_info for node details, get_bounds for combined AABB of a subtree.

## [Documentation](docs.md)

Fetch Godot Engine documentation with smart extraction

- `godot_docs` - Fetch Godot Engine documentation. Use fetch_class for class references (e.g. CharacterBody2D), fetch_page for tutorials/guides. Auto-detects Godot version from editor connection. Returns clean markdown.

