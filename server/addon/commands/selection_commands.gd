@tool
extends MCPBaseCommand
class_name MCPSelectionCommands


func get_commands() -> Dictionary:
	return {
		"get_editor_state": get_editor_state,
		"get_selected_nodes": get_selected_nodes,
		"select_node": select_node,
		"set_2d_viewport": set_2d_viewport
	}


func get_editor_state(_params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	var open_scenes := EditorInterface.get_open_scenes()

	var main_screen := _get_current_main_screen()

	var result := {
		"current_scene": root.scene_file_path if root else null,
		"is_playing": EditorInterface.is_playing_scene(),
		"godot_version": Engine.get_version_info()["string"],
		"open_scenes": Array(open_scenes),
		"main_screen": main_screen
	}

	if main_screen == "3D":
		var camera_info := _get_editor_camera_info()
		if not camera_info.is_empty():
			result["camera"] = camera_info
	elif main_screen == "2D":
		var viewport_2d_info := _get_editor_2d_viewport_info()
		if not viewport_2d_info.is_empty():
			result["viewport_2d"] = viewport_2d_info

	return _success(result)


func _get_editor_camera_info() -> Dictionary:
	var viewport := EditorInterface.get_editor_viewport_3d(0)
	if not viewport:
		return {}

	var camera := viewport.get_camera_3d()
	if not camera:
		return {}

	var pos: Vector3 = camera.global_position
	var rot: Vector3 = camera.global_rotation
	var forward: Vector3 = -camera.global_transform.basis.z

	var info := {
		"position": {"x": pos.x, "y": pos.y, "z": pos.z},
		"rotation": {"x": rot.x, "y": rot.y, "z": rot.z},
		"forward": {"x": forward.x, "y": forward.y, "z": forward.z},
		"fov": camera.fov,
		"near": camera.near,
		"far": camera.far,
		"projection": "orthogonal" if camera.projection == Camera3D.PROJECTION_ORTHOGONAL else "perspective",
	}

	if camera.projection == Camera3D.PROJECTION_ORTHOGONAL:
		info["size"] = camera.size

	return info


func _get_editor_2d_viewport_info() -> Dictionary:
	var viewport := EditorInterface.get_editor_viewport_2d()
	if not viewport:
		return {}

	var transform := viewport.global_canvas_transform
	var zoom: float = transform.x.x
	var offset: Vector2 = -transform.origin / zoom

	var size := viewport.size

	return {
		"center": {"x": offset.x + size.x / zoom / 2, "y": offset.y + size.y / zoom / 2},
		"zoom": zoom,
		"size": {"width": int(size.x), "height": int(size.y)}
	}


func set_2d_viewport(params: Dictionary) -> Dictionary:
	var viewport := EditorInterface.get_editor_viewport_2d()
	if not viewport:
		return _error("NO_VIEWPORT", "Could not access 2D editor viewport")

	var center_x: float = params.get("center_x", 0.0)
	var center_y: float = params.get("center_y", 0.0)
	var zoom: float = params.get("zoom", 1.0)

	if zoom <= 0:
		return _error("INVALID_PARAMS", "zoom must be positive")

	var size := viewport.size
	var offset := Vector2(center_x - size.x / zoom / 2, center_y - size.y / zoom / 2)
	var origin := -offset * zoom

	var transform := Transform2D(Vector2(zoom, 0), Vector2(0, zoom), origin)
	viewport.global_canvas_transform = transform

	return _success({
		"center": {"x": center_x, "y": center_y},
		"zoom": zoom
	})


const MAIN_SCREEN_PATTERNS := {
	"2D": ["CanvasItemEditor", "2D"],
	"3D": ["Node3DEditor", "3D"],
	"Script": ["ScriptEditor", "Script"],
	"AssetLib": ["AssetLib", "Asset"],
}


func _get_current_main_screen() -> String:
	var main_screen := EditorInterface.get_editor_main_screen()
	if not main_screen:
		return "unknown"

	for child in main_screen.get_children():
		if child.visible and child is Control:
			var cls := child.get_class()
			var node_name := child.name

			for screen_name in MAIN_SCREEN_PATTERNS:
				var patterns: Array = MAIN_SCREEN_PATTERNS[screen_name]
				if patterns[0] in cls or patterns[1] in node_name:
					return screen_name

	return "unknown"


func get_selected_nodes(_params: Dictionary) -> Dictionary:
	var selection := EditorInterface.get_selection()
	var root := EditorInterface.get_edited_scene_root()
	var selected: Array[String] = []

	for node in selection.get_selected_nodes():
		if root and root.is_ancestor_of(node):
			# Build clean path relative to scene root
			var relative_path := root.get_path_to(node)
			var usable_path := "/root/" + root.name
			if relative_path != NodePath("."):
				usable_path += "/" + str(relative_path)
			selected.append(usable_path)
		elif node == root:
			selected.append("/root/" + root.name)

	return _success({"selected": selected})


func select_node(params: Dictionary) -> Dictionary:
	var node_path: String = params.get("node_path", "")
	if node_path.is_empty():
		return _error("INVALID_PARAMS", "node_path is required")

	var node := _get_node(node_path)
	if not node:
		return _error("NODE_NOT_FOUND", "Node not found: %s" % node_path)

	var selection := EditorInterface.get_selection()
	selection.clear()
	selection.add_node(node)
	return _success({})
