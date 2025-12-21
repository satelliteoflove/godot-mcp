@tool
extends MCPBaseCommand
class_name MCPScreenshotCommands

const DEFAULT_MAX_WIDTH := 1920
const SCREENSHOT_TIMEOUT := 5.0

var _screenshot_result: Dictionary = {}
var _screenshot_pending: bool = false


func get_commands() -> Dictionary:
	return {
		"capture_game_screenshot": capture_game_screenshot,
		"capture_editor_screenshot": capture_editor_screenshot
	}


func capture_game_screenshot(params: Dictionary) -> Dictionary:
	if not EditorInterface.is_playing_scene():
		return _error("NOT_RUNNING", "No game is currently running. Use run_project first.")

	var max_width: int = params.get("max_width", DEFAULT_MAX_WIDTH)

	var debugger_plugin = _plugin.get_debugger_plugin() if _plugin else null
	if debugger_plugin == null:
		return _error("NO_DEBUGGER", "Debugger plugin not available")

	if not debugger_plugin.has_active_session():
		return _error("NO_SESSION", "No active debug session. Game may not have MCPGameBridge autoload.")

	_screenshot_pending = true
	_screenshot_result = {}

	debugger_plugin.screenshot_received.connect(_on_screenshot_received, CONNECT_ONE_SHOT)
	debugger_plugin.request_screenshot(max_width)

	var start_time := Time.get_ticks_msec()
	while _screenshot_pending:
		await Engine.get_main_loop().process_frame
		if (Time.get_ticks_msec() - start_time) / 1000.0 > SCREENSHOT_TIMEOUT:
			_screenshot_pending = false
			if debugger_plugin.screenshot_received.is_connected(_on_screenshot_received):
				debugger_plugin.screenshot_received.disconnect(_on_screenshot_received)
			return _error("TIMEOUT", "Screenshot request timed out")

	return _screenshot_result


func _on_screenshot_received(success: bool, image_base64: String, width: int, height: int, error: String) -> void:
	_screenshot_pending = false
	if success:
		_screenshot_result = _success({
			"image_base64": image_base64,
			"width": width,
			"height": height
		})
	else:
		_screenshot_result = _error("CAPTURE_FAILED", error)


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
	return _process_and_encode_image(image, max_width)


func _process_and_encode_image(image: Image, max_width: int) -> Dictionary:
	if image == null:
		return _error("CAPTURE_FAILED", "Failed to capture image from viewport")

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
