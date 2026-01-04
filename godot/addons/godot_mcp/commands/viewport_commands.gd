@tool
extends MCPBaseCommand
class_name MCPViewportCommands


func get_commands() -> Dictionary:
	return {
		"get_editor_camera": get_editor_camera,
		"get_viewport_info": get_viewport_info,
	}


func get_editor_camera(params: Dictionary) -> Dictionary:
	var viewport_index: int = params.get("viewport_index", 0)

	if viewport_index < 0 or viewport_index > 3:
		return _error("INVALID_INDEX", "viewport_index must be 0-3")

	var viewport := EditorInterface.get_editor_viewport_3d(viewport_index)
	if not viewport:
		return _error("NO_VIEWPORT", "Could not access editor viewport %d" % viewport_index)

	var camera := viewport.get_camera_3d()
	if not camera:
		return _error("NO_CAMERA", "No camera in viewport %d" % viewport_index)

	var pos: Vector3 = camera.global_position
	var rot: Vector3 = camera.global_rotation

	var camera_data := {
		"viewport_index": viewport_index,
		"global_position": {"x": pos.x, "y": pos.y, "z": pos.z},
		"global_rotation": {"x": rot.x, "y": rot.y, "z": rot.z},
		"fov": camera.fov,
		"near": camera.near,
		"far": camera.far,
		"projection": "orthogonal" if camera.projection == Camera3D.PROJECTION_ORTHOGONAL else "perspective",
	}

	if camera.projection == Camera3D.PROJECTION_ORTHOGONAL:
		camera_data["size"] = camera.size

	return _success(camera_data)


func get_viewport_info(_params: Dictionary) -> Dictionary:
	var viewports: Array[Dictionary] = []
	var active_count := 0

	for i in range(4):
		var viewport := EditorInterface.get_editor_viewport_3d(i)
		if not viewport:
			continue

		var size := viewport.get_size()
		if size.x <= 0 or size.y <= 0:
			continue

		active_count += 1
		var viewport_data := {
			"index": i,
			"size": {"width": int(size.x), "height": int(size.y)},
		}

		var camera := viewport.get_camera_3d()
		if camera:
			var pos: Vector3 = camera.global_position
			var forward: Vector3 = -camera.global_transform.basis.z
			viewport_data["camera"] = {
				"position": {"x": pos.x, "y": pos.y, "z": pos.z},
				"forward": {"x": forward.x, "y": forward.y, "z": forward.z},
				"projection": "orthogonal" if camera.projection == Camera3D.PROJECTION_ORTHOGONAL else "perspective",
			}

		viewports.append(viewport_data)

	return _success({
		"viewport_count": active_count,
		"viewports": viewports,
	})
