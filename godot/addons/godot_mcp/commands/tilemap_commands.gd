@tool
extends MCPBaseCommand
class_name MCPTilemapCommands


func get_commands() -> Dictionary:
	return {
		"list_tilemap_layers": list_tilemap_layers,
		"get_tilemap_layer_info": get_tilemap_layer_info,
		"get_tileset_info": get_tileset_info,
		"get_used_cells": get_used_cells,
		"get_cell": get_cell,
		"set_cell": set_cell,
		"erase_cell": erase_cell,
		"clear_layer": clear_layer,
		"get_cells_in_region": get_cells_in_region,
		"set_cells_batch": set_cells_batch,
		"convert_coords": convert_coords,
		"list_gridmaps": list_gridmaps,
		"get_gridmap_info": get_gridmap_info,
		"get_meshlib_info": get_meshlib_info,
		"get_gridmap_used_cells": get_gridmap_used_cells,
		"get_gridmap_cell": get_gridmap_cell,
		"set_gridmap_cell": set_gridmap_cell,
		"clear_gridmap_cell": clear_gridmap_cell,
		"clear_gridmap": clear_gridmap,
		"get_cells_by_item": get_cells_by_item,
		"set_gridmap_cells_batch": set_gridmap_cells_batch,
	}


func _get_tilemap_layer(node_path: String) -> TileMapLayer:
	var node := _get_node(node_path)
	if not node:
		return null
	if not node is TileMapLayer:
		return null
	return node as TileMapLayer


func _get_gridmap(node_path: String) -> GridMap:
	var node := _get_node(node_path)
	if not node:
		return null
	if not node is GridMap:
		return null
	return node as GridMap


func _find_tilemap_layers(node: Node, result: Array, scene_root: Node) -> void:
	if node is TileMapLayer:
		result.append({
			"path": str(scene_root.get_path_to(node)),
			"name": node.name
		})
	for child in node.get_children():
		_find_tilemap_layers(child, result, scene_root)


func _find_gridmaps(node: Node, result: Array, scene_root: Node) -> void:
	if node is GridMap:
		result.append({
			"path": str(scene_root.get_path_to(node)),
			"name": node.name
		})
	for child in node.get_children():
		_find_gridmaps(child, result, scene_root)


func _serialize_vector2i(v: Vector2i) -> Dictionary:
	return {"x": v.x, "y": v.y}


func _serialize_vector3i(v: Vector3i) -> Dictionary:
	return {"x": v.x, "y": v.y, "z": v.z}


func _deserialize_vector2i(d: Dictionary) -> Vector2i:
	return Vector2i(int(d.get("x", 0)), int(d.get("y", 0)))


func _deserialize_vector3i(d: Dictionary) -> Vector3i:
	return Vector3i(int(d.get("x", 0)), int(d.get("y", 0)), int(d.get("z", 0)))


func list_tilemap_layers(params: Dictionary) -> Dictionary:
	var root_path: String = params.get("root_path", "")
	var scene_root := EditorInterface.get_edited_scene_root()
	var root: Node

	if not scene_root:
		return _error("NO_SCENE", "No scene is open")

	if root_path.is_empty():
		root = scene_root
	else:
		root = _get_node(root_path)

	if not root:
		return _error("NODE_NOT_FOUND", "Root node not found")

	var layers := []
	_find_tilemap_layers(root, layers, scene_root)

	return _success({"tilemap_layers": layers})


func get_tilemap_layer_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var tileset_path := ""
	if layer.tile_set:
		tileset_path = layer.tile_set.resource_path

	return _success({
		"name": layer.name,
		"enabled": layer.enabled,
		"tileset_path": tileset_path,
		"cell_quadrant_size": layer.rendering_quadrant_size,
		"collision_enabled": layer.collision_enabled,
		"used_cells_count": layer.get_used_cells().size()
	})


func get_tileset_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	if not layer.tile_set:
		return _error("NO_TILESET", "TileMapLayer has no TileSet assigned")

	var tileset := layer.tile_set
	var sources := []

	for i in range(tileset.get_source_count()):
		var source_id := tileset.get_source_id(i)
		var source := tileset.get_source(source_id)
		var source_info := {
			"source_id": source_id,
			"source_type": "unknown"
		}

		if source is TileSetAtlasSource:
			var atlas := source as TileSetAtlasSource
			source_info["source_type"] = "atlas"
			source_info["texture_path"] = atlas.texture.resource_path if atlas.texture else ""
			source_info["texture_region_size"] = _serialize_vector2i(atlas.texture_region_size)
			source_info["tile_count"] = atlas.get_tiles_count()
		elif source is TileSetScenesCollectionSource:
			source_info["source_type"] = "scenes_collection"
			var scenes_source := source as TileSetScenesCollectionSource
			source_info["scene_count"] = scenes_source.get_scene_tiles_count()

		sources.append(source_info)

	return _success({
		"tileset_path": tileset.resource_path,
		"tile_size": _serialize_vector2i(tileset.tile_size),
		"source_count": tileset.get_source_count(),
		"sources": sources
	})


func get_used_cells(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var cells := layer.get_used_cells()
	var result := []
	for cell in cells:
		result.append(_serialize_vector2i(cell))

	return _success({"cells": result, "count": result.size()})


func get_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var coords := _deserialize_vector2i(params["coords"])
	var source_id := layer.get_cell_source_id(coords)
	var atlas_coords := layer.get_cell_atlas_coords(coords)
	var alt_tile := layer.get_cell_alternative_tile(coords)

	if source_id == -1:
		return _success({
			"coords": _serialize_vector2i(coords),
			"empty": true
		})

	return _success({
		"coords": _serialize_vector2i(coords),
		"empty": false,
		"source_id": source_id,
		"atlas_coords": _serialize_vector2i(atlas_coords),
		"alternative_tile": alt_tile
	})


func set_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var coords := _deserialize_vector2i(params["coords"])
	var source_id: int = params.get("source_id", 0)
	var atlas_coords := Vector2i(0, 0)
	if params.has("atlas_coords"):
		atlas_coords = _deserialize_vector2i(params["atlas_coords"])
	var alt_tile: int = params.get("alternative_tile", 0)

	layer.set_cell(coords, source_id, atlas_coords, alt_tile)

	return _success({
		"coords": _serialize_vector2i(coords),
		"source_id": source_id,
		"atlas_coords": _serialize_vector2i(atlas_coords),
		"alternative_tile": alt_tile
	})


func erase_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var coords := _deserialize_vector2i(params["coords"])
	layer.erase_cell(coords)

	return _success({"erased": _serialize_vector2i(coords)})


func clear_layer(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var count := layer.get_used_cells().size()
	layer.clear()

	return _success({"cleared": true, "cells_removed": count})


func get_cells_in_region(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("min_coords"):
		return _error("INVALID_PARAMS", "min_coords is required")
	if not params.has("max_coords"):
		return _error("INVALID_PARAMS", "max_coords is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var min_coords := _deserialize_vector2i(params["min_coords"])
	var max_coords := _deserialize_vector2i(params["max_coords"])

	var cells := []
	for cell in layer.get_used_cells():
		if cell.x >= min_coords.x and cell.x <= max_coords.x and cell.y >= min_coords.y and cell.y <= max_coords.y:
			var source_id := layer.get_cell_source_id(cell)
			var atlas_coords := layer.get_cell_atlas_coords(cell)
			var alt_tile := layer.get_cell_alternative_tile(cell)
			cells.append({
				"coords": _serialize_vector2i(cell),
				"source_id": source_id,
				"atlas_coords": _serialize_vector2i(atlas_coords),
				"alternative_tile": alt_tile
			})

	return _success({"cells": cells, "count": cells.size()})


func set_cells_batch(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("cells"):
		return _error("INVALID_PARAMS", "cells is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	var cells_data: Array = params["cells"]
	var count := 0

	for cell_data in cells_data:
		if not cell_data.has("coords"):
			continue
		var coords := _deserialize_vector2i(cell_data["coords"])
		var source_id: int = cell_data.get("source_id", 0)
		var atlas_coords := Vector2i(0, 0)
		if cell_data.has("atlas_coords"):
			atlas_coords = _deserialize_vector2i(cell_data["atlas_coords"])
		var alt_tile: int = cell_data.get("alternative_tile", 0)

		layer.set_cell(coords, source_id, atlas_coords, alt_tile)
		count += 1

	return _success({"cells_set": count})


func convert_coords(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var layer := _get_tilemap_layer(node_path)
	if not layer:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_TILEMAP_LAYER", "Node is not a TileMapLayer: %s" % node_path)

	if params.has("local_position"):
		var local_pos_data: Dictionary = params["local_position"]
		var local_pos := Vector2(local_pos_data.get("x", 0.0), local_pos_data.get("y", 0.0))
		var map_coords := layer.local_to_map(local_pos)
		return _success({
			"direction": "local_to_map",
			"local_position": {"x": local_pos.x, "y": local_pos.y},
			"map_coords": _serialize_vector2i(map_coords)
		})
	elif params.has("map_coords"):
		var map_coords := _deserialize_vector2i(params["map_coords"])
		var local_pos := layer.map_to_local(map_coords)
		return _success({
			"direction": "map_to_local",
			"map_coords": _serialize_vector2i(map_coords),
			"local_position": {"x": local_pos.x, "y": local_pos.y}
		})
	else:
		return _error("INVALID_PARAMS", "Either local_position or map_coords is required")


func list_gridmaps(params: Dictionary) -> Dictionary:
	var root_path: String = params.get("root_path", "")
	var scene_root := EditorInterface.get_edited_scene_root()
	var root: Node

	if not scene_root:
		return _error("NO_SCENE", "No scene is open")

	if root_path.is_empty():
		root = scene_root
	else:
		root = _get_node(root_path)

	if not root:
		return _error("NODE_NOT_FOUND", "Root node not found")

	var gridmaps := []
	_find_gridmaps(root, gridmaps, scene_root)

	return _success({"gridmaps": gridmaps})


func get_gridmap_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var meshlib_path := ""
	if gridmap.mesh_library:
		meshlib_path = gridmap.mesh_library.resource_path

	return _success({
		"name": gridmap.name,
		"mesh_library_path": meshlib_path,
		"cell_size": _serialize_value(gridmap.cell_size),
		"cell_center_x": gridmap.cell_center_x,
		"cell_center_y": gridmap.cell_center_y,
		"cell_center_z": gridmap.cell_center_z,
		"used_cells_count": gridmap.get_used_cells().size()
	})


func get_meshlib_info(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	if not gridmap.mesh_library:
		return _error("NO_MESH_LIBRARY", "GridMap has no MeshLibrary assigned")

	var meshlib := gridmap.mesh_library
	var items := []

	for i in range(meshlib.get_item_list().size()):
		var item_id: int = meshlib.get_item_list()[i]
		var item_name := meshlib.get_item_name(item_id)
		var mesh := meshlib.get_item_mesh(item_id)
		var mesh_path := mesh.resource_path if mesh else ""

		items.append({
			"index": item_id,
			"name": item_name,
			"mesh_path": mesh_path
		})

	return _success({
		"mesh_library_path": meshlib.resource_path,
		"item_count": meshlib.get_item_list().size(),
		"items": items
	})


func get_gridmap_used_cells(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var cells := gridmap.get_used_cells()
	var result := []
	for cell in cells:
		result.append(_serialize_vector3i(cell))

	return _success({"cells": result, "count": result.size()})


func get_gridmap_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var coords := _deserialize_vector3i(params["coords"])
	var item := gridmap.get_cell_item(coords)
	var orientation := gridmap.get_cell_item_orientation(coords)

	if item == GridMap.INVALID_CELL_ITEM:
		return _success({
			"coords": _serialize_vector3i(coords),
			"empty": true
		})

	var item_name := ""
	if gridmap.mesh_library:
		item_name = gridmap.mesh_library.get_item_name(item)

	return _success({
		"coords": _serialize_vector3i(coords),
		"empty": false,
		"item": item,
		"item_name": item_name,
		"orientation": orientation
	})


func set_gridmap_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")
	if not params.has("item"):
		return _error("INVALID_PARAMS", "item is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var coords := _deserialize_vector3i(params["coords"])
	var item: int = params["item"]
	var orientation: int = params.get("orientation", 0)

	gridmap.set_cell_item(coords, item, orientation)

	return _success({
		"coords": _serialize_vector3i(coords),
		"item": item,
		"orientation": orientation
	})


func clear_gridmap_cell(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("coords"):
		return _error("INVALID_PARAMS", "coords is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var coords := _deserialize_vector3i(params["coords"])
	gridmap.set_cell_item(coords, GridMap.INVALID_CELL_ITEM)

	return _success({"cleared": _serialize_vector3i(coords)})


func clear_gridmap(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var count := gridmap.get_used_cells().size()
	gridmap.clear()

	return _success({"cleared": true, "cells_removed": count})


func get_cells_by_item(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("item"):
		return _error("INVALID_PARAMS", "item is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var item: int = params["item"]
	var cells := gridmap.get_used_cells_by_item(item)
	var result := []
	for cell in cells:
		result.append(_serialize_vector3i(cell))

	return _success({"item": item, "cells": result, "count": result.size()})


func set_gridmap_cells_batch(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")
	if not params.has("cells"):
		return _error("INVALID_PARAMS", "cells is required")

	var gridmap := _get_gridmap(node_path)
	if not gridmap:
		var node := _get_node(node_path)
		if not node:
			return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)
		return _error("NOT_GRIDMAP", "Node is not a GridMap: %s" % node_path)

	var cells_data: Array = params["cells"]
	var count := 0

	for cell_data in cells_data:
		if not cell_data.has("coords") or not cell_data.has("item"):
			continue
		var coords := _deserialize_vector3i(cell_data["coords"])
		var item: int = cell_data["item"]
		var orientation: int = cell_data.get("orientation", 0)

		gridmap.set_cell_item(coords, item, orientation)
		count += 1

	return _success({"cells_set": count})
