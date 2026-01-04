@tool
extends MCPBaseCommand
class_name MCPResourceCommands


const MAX_ARRAY_PREVIEW := 100
const BINARY_ARRAY_TYPES := [
	TYPE_PACKED_BYTE_ARRAY,
	TYPE_PACKED_INT32_ARRAY,
	TYPE_PACKED_INT64_ARRAY,
	TYPE_PACKED_FLOAT32_ARRAY,
	TYPE_PACKED_FLOAT64_ARRAY,
]


func get_commands() -> Dictionary:
	return {
		"get_resource_info": get_resource_info
	}


func get_resource_info(params: Dictionary) -> Dictionary:
	var resource_path: String = params.get("resource_path", "")
	var max_depth: int = params.get("max_depth", 1)
	var include_internal: bool = params.get("include_internal", false)

	if resource_path.is_empty():
		return _error("INVALID_PARAMS", "resource_path is required")

	if not ResourceLoader.exists(resource_path):
		return _error("RESOURCE_NOT_FOUND", "Resource not found: %s" % resource_path)

	var resource := load(resource_path)
	if not resource:
		return _error("LOAD_FAILED", "Failed to load resource: %s" % resource_path)

	var result := {
		"resource_path": resource_path,
		"resource_type": resource.get_class()
	}

	var type_specific := _get_type_specific_info(resource, max_depth)
	if not type_specific.is_empty():
		result["type_specific"] = type_specific
	else:
		var properties := _get_generic_properties(resource, max_depth, include_internal)
		if not properties.is_empty():
			result["properties"] = properties

	return _success(result)


func _get_type_specific_info(resource: Resource, max_depth: int) -> Dictionary:
	if resource is SpriteFrames:
		return _format_sprite_frames(resource, max_depth)
	elif resource is TileSet:
		return _format_tileset(resource, max_depth)
	elif resource is ShaderMaterial:
		return _format_shader_material(resource, max_depth)
	elif resource is StandardMaterial3D or resource is ORMMaterial3D:
		return _format_standard_material(resource, max_depth)
	elif resource is Texture2D:
		return _format_texture2d(resource)
	return {}


func _format_sprite_frames(sf: SpriteFrames, max_depth: int) -> Dictionary:
	var animations := []

	for anim_name in sf.get_animation_names():
		var anim_info := {
			"name": str(anim_name),
			"frame_count": sf.get_frame_count(anim_name),
			"fps": sf.get_animation_speed(anim_name),
			"loop": sf.get_animation_loop(anim_name),
		}

		if max_depth >= 1:
			var frames := []
			for i in range(sf.get_frame_count(anim_name)):
				var texture := sf.get_frame_texture(anim_name, i)
				var frame_info := {
					"index": i,
					"duration": sf.get_frame_duration(anim_name, i),
				}

				if texture:
					frame_info["texture_type"] = texture.get_class()

					if texture is AtlasTexture:
						var atlas := texture as AtlasTexture
						if atlas.atlas:
							frame_info["atlas_source"] = atlas.atlas.resource_path
						frame_info["region"] = _serialize_rect2(atlas.region)
						if atlas.margin != Rect2():
							frame_info["margin"] = _serialize_rect2(atlas.margin)
					elif texture.resource_path:
						frame_info["texture_path"] = texture.resource_path

				frames.append(frame_info)
			anim_info["frames"] = frames

		animations.append(anim_info)

	return {"animations": animations}


func _format_tileset(ts: TileSet, max_depth: int) -> Dictionary:
	var sources := []

	for i in range(ts.get_source_count()):
		var source_id := ts.get_source_id(i)
		var source := ts.get_source(source_id)
		var source_info := {
			"source_id": source_id,
			"source_type": source.get_class(),
		}

		if source is TileSetAtlasSource:
			var atlas := source as TileSetAtlasSource
			if atlas.texture:
				source_info["texture_path"] = atlas.texture.resource_path
			source_info["texture_region_size"] = _serialize_vector2i(atlas.texture_region_size)
			source_info["tile_count"] = atlas.get_tiles_count()

			if max_depth >= 2:
				var tiles := []
				for j in range(atlas.get_tiles_count()):
					var coords := atlas.get_tile_id(j)
					tiles.append({
						"atlas_coords": _serialize_vector2i(coords),
						"size": _serialize_vector2i(atlas.get_tile_size_in_atlas(coords))
					})
				source_info["tiles"] = _truncate_array(tiles)

		elif source is TileSetScenesCollectionSource:
			var scenes := source as TileSetScenesCollectionSource
			source_info["scene_count"] = scenes.get_scene_tiles_count()

		sources.append(source_info)

	return {
		"tile_size": _serialize_vector2i(ts.tile_size),
		"source_count": ts.get_source_count(),
		"physics_layers_count": ts.get_physics_layers_count(),
		"navigation_layers_count": ts.get_navigation_layers_count(),
		"custom_data_layers_count": ts.get_custom_data_layers_count(),
		"terrain_sets_count": ts.get_terrain_sets_count(),
		"sources": sources
	}


func _format_shader_material(mat: ShaderMaterial, max_depth: int) -> Dictionary:
	var result := {
		"shader_path": mat.shader.resource_path if mat.shader else ""
	}

	if mat.shader and max_depth >= 1:
		var params := {}
		for prop in mat.get_property_list():
			var prop_name: String = prop["name"]
			if prop_name.begins_with("shader_parameter/"):
				var param_name := prop_name.substr(len("shader_parameter/"))
				var value = mat.get_shader_parameter(param_name)
				params[param_name] = _serialize_property_value(value, max_depth - 1)
		if not params.is_empty():
			result["shader_parameters"] = params

	return result


func _format_standard_material(mat: BaseMaterial3D, max_depth: int) -> Dictionary:
	var result := {
		"albedo_color": _serialize_color(mat.albedo_color),
		"metallic": mat.metallic,
		"roughness": mat.roughness,
		"emission_enabled": mat.emission_enabled,
		"transparency": mat.transparency,
		"cull_mode": mat.cull_mode,
		"shading_mode": mat.shading_mode
	}

	if mat.albedo_texture:
		result["albedo_texture"] = mat.albedo_texture.resource_path

	if mat.emission_enabled and mat.emission_texture:
		result["emission_texture"] = mat.emission_texture.resource_path

	if mat.normal_enabled and mat.normal_texture:
		result["normal_texture"] = mat.normal_texture.resource_path

	return result


func _format_texture2d(tex: Texture2D) -> Dictionary:
	var result := {
		"width": tex.get_width(),
		"height": tex.get_height(),
		"texture_type": tex.get_class()
	}

	if tex is CompressedTexture2D:
		var ct := tex as CompressedTexture2D
		result["load_path"] = ct.load_path

	if tex is AtlasTexture:
		var at := tex as AtlasTexture
		if at.atlas:
			result["atlas_source"] = at.atlas.resource_path
		result["region"] = _serialize_rect2(at.region)
		if at.margin != Rect2():
			result["margin"] = _serialize_rect2(at.margin)

	return result


func _get_generic_properties(resource: Resource, max_depth: int, include_internal: bool) -> Dictionary:
	var properties := {}

	for prop in resource.get_property_list():
		var prop_name: String = prop["name"]

		if prop_name.begins_with("_") and not include_internal:
			continue
		if prop["usage"] & PROPERTY_USAGE_EDITOR == 0:
			continue
		if prop_name in ["resource_local_to_scene", "resource_path", "resource_name", "script"]:
			continue

		var value = resource.get(prop_name)
		properties[prop_name] = _serialize_property_value(value, max_depth)

	return properties


func _serialize_property_value(value: Variant, depth: int) -> Variant:
	var value_type := typeof(value)

	if value_type in BINARY_ARRAY_TYPES:
		return {"_binary_array": true, "size": value.size(), "type": type_string(value_type)}

	if value_type == TYPE_ARRAY:
		if value.size() > MAX_ARRAY_PREVIEW:
			var preview := []
			for i in range(MAX_ARRAY_PREVIEW):
				preview.append(_serialize_property_value(value[i], depth - 1) if depth > 0 else str(value[i]))
			return {"_truncated": true, "size": value.size(), "preview": preview}
		else:
			var result := []
			for item in value:
				result.append(_serialize_property_value(item, depth - 1) if depth > 0 else str(item))
			return result

	if value_type == TYPE_DICTIONARY:
		var result := {}
		for key in value:
			result[str(key)] = _serialize_property_value(value[key], depth - 1) if depth > 0 else str(value[key])
		return result

	if value_type == TYPE_OBJECT:
		if value == null:
			return null
		if value is Resource:
			if value.resource_path and not value.resource_path.is_empty():
				return {"_resource_ref": value.resource_path, "type": value.get_class()}
			elif depth > 0:
				return {"_inline_resource": true, "type": value.get_class()}
			return str(value)
		return str(value)

	return _serialize_value(value)


func _serialize_rect2(r: Rect2) -> Dictionary:
	return {"x": r.position.x, "y": r.position.y, "width": r.size.x, "height": r.size.y}


func _serialize_vector2i(v: Vector2i) -> Dictionary:
	return {"x": v.x, "y": v.y}


func _serialize_color(c: Color) -> Dictionary:
	return {"r": c.r, "g": c.g, "b": c.b, "a": c.a}


func _truncate_array(arr: Array, limit: int = MAX_ARRAY_PREVIEW) -> Variant:
	if arr.size() <= limit:
		return arr
	return {
		"_truncated": true,
		"size": arr.size(),
		"preview": arr.slice(0, limit)
	}
