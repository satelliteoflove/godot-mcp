@tool
class_name MCPUtils
extends RefCounted


static func success(result: Dictionary) -> Dictionary:
	return {
		"status": "success",
		"result": result
	}


static func error(code: String, message: String) -> Dictionary:
	return {
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	}


static func get_node_from_path(path: String) -> Node:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return null

	if path == "/root" or path == "/" or path == str(root.get_path()):
		return root

	if path.begins_with("/root/"):
		var parts := path.split("/")
		if parts.size() >= 3:
			if parts[2] == root.name:
				var relative_path := "/".join(parts.slice(3))
				if relative_path.is_empty():
					return root
				return root.get_node_or_null(relative_path)

	if path.begins_with("/"):
		path = path.substr(1)

	return root.get_node_or_null(path)


static func serialize_value(value: Variant) -> Variant:
	match typeof(value):
		TYPE_VECTOR2:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR2I:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR3:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_VECTOR3I:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_COLOR:
			return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_OBJECT:
			if value == null:
				return null
			if value is Resource:
				return value.resource_path if value.resource_path else str(value)
			return str(value)
		_:
			return value


static func deserialize_value(value: Variant) -> Variant:
	if value is String and value.begins_with("res://"):
		var resource := load(value)
		if resource:
			return resource
	if value is Dictionary:
		if value.has("_resource"):
			return _create_resource(value)
		if value.has("x") and value.has("y"):
			if value.has("z"):
				return Vector3(value.x, value.y, value.z)
			return Vector2(value.x, value.y)
		if value.has("r") and value.has("g") and value.has("b"):
			return Color(value.r, value.g, value.b, value.get("a", 1.0))
	return value


static func _create_resource(spec: Dictionary) -> Resource:
	var resource_type: String = spec.get("_resource", "")
	if not ClassDB.class_exists(resource_type):
		MCPLog.error("Unknown resource type: %s" % resource_type)
		return null
	if not ClassDB.is_parent_class(resource_type, "Resource"):
		MCPLog.error("Type is not a Resource: %s" % resource_type)
		return null

	var resource: Resource = ClassDB.instantiate(resource_type)
	if not resource:
		MCPLog.error("Failed to create resource: %s" % resource_type)
		return null

	for key in spec:
		if key == "_resource":
			continue
		if key in resource:
			resource.set(key, deserialize_value(spec[key]))

	return resource


static func is_resource_path(path: String) -> bool:
	return path.begins_with("res://")


static func dir_exists(path: String) -> bool:
	if path.is_empty():
		return false
	if is_resource_path(path):
		var dir := DirAccess.open("res://")
		return dir != null and dir.dir_exists(path.trim_prefix("res://"))
	return DirAccess.dir_exists_absolute(path)


static func ensure_dir_exists(path: String) -> Error:
	if dir_exists(path):
		return OK
	if is_resource_path(path):
		var dir := DirAccess.open("res://")
		if not dir:
			return ERR_CANT_OPEN
		return dir.make_dir_recursive(path.trim_prefix("res://"))
	return DirAccess.make_dir_recursive_absolute(path)
