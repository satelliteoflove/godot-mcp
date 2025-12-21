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
		TYPE_VECTOR3:
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
