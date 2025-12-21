@tool
extends MCPBaseCommand
class_name MCPScreenshotCommands

const DEFAULT_MAX_WIDTH := 1920


func get_commands() -> Dictionary:
	return {
		"capture_game_screenshot": capture_game_screenshot,
		"capture_editor_screenshot": capture_editor_screenshot
	}


func capture_game_screenshot(params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running. Use run_project first.")

	var max_width: int = params.get("max_width", DEFAULT_MAX_WIDTH)

	var main_window := EditorInterface.get_base_control().get_window()
	var image := main_window.get_viewport().get_texture().get_image()

	if max_width > 0 and image.get_width() > max_width:
		var scale_factor := float(max_width) / float(image.get_width())
		var new_height := int(image.get_height() * scale_factor)
		image.resize(max_width, new_height, Image.INTERPOLATE_LANCZOS)

	var png_buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_buffer)

	return _success({
		"image_base64": base64,
		"width": image.get_width(),
		"height": image.get_height()
	})


func capture_editor_screenshot(params: Dictionary) -> Dictionary:
	var viewport_type: String = params.get("viewport", "")
	var max_width: int = params.get("max_width", DEFAULT_MAX_WIDTH)

	var viewport: SubViewport = null

	if viewport_type == "2d":
		viewport = _find_2d_viewport()
	elif viewport_type == "3d":
		viewport = _find_3d_viewport()
	else:
		viewport = _find_active_viewport()

	if viewport == null:
		return _error("NO_VIEWPORT", "Could not find editor viewport")

	var image := viewport.get_texture().get_image()

	if max_width > 0 and image.get_width() > max_width:
		var scale_factor := float(max_width) / float(image.get_width())
		var new_height := int(image.get_height() * scale_factor)
		image.resize(max_width, new_height, Image.INTERPOLATE_LANCZOS)

	var png_buffer := image.save_png_to_buffer()
	var base64 := Marshalls.raw_to_base64(png_buffer)

	return _success({
		"image_base64": base64,
		"width": image.get_width(),
		"height": image.get_height()
	})


func _find_active_viewport() -> SubViewport:
	var viewport := _find_3d_viewport()
	if viewport:
		return viewport
	return _find_2d_viewport()


func _find_2d_viewport() -> SubViewport:
	var editor_main := EditorInterface.get_editor_main_screen()
	return _find_viewport_in_tree(editor_main, "2D")


func _find_3d_viewport() -> SubViewport:
	var editor_main := EditorInterface.get_editor_main_screen()
	return _find_viewport_in_tree(editor_main, "3D")


func _find_viewport_in_tree(node: Node, hint: String) -> SubViewport:
	if node is SubViewportContainer:
		var container := node as SubViewportContainer
		for child in container.get_children():
			if child is SubViewport:
				return child as SubViewport

	for child in node.get_children():
		var result := _find_viewport_in_tree(child, hint)
		if result:
			return result

	return null
