@tool
extends MCPBaseCommand
class_name MCPScreenshotCommands

const DEFAULT_MAX_WIDTH := 900
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
		var payload := {
			"image_base64": image_base64,
			"width": width,
			"height": height
		}
		# Mesh-integrity warnings ride the same game message (no extra
		# round-trip, no version-skew timeout); pass them through so the
		# server can attach the advisory to the image.
		var dp = _plugin.get_debugger_plugin() if _plugin else null
		if dp != null and not (dp.last_screenshot_warnings as Array).is_empty():
			payload["mesh_warnings"] = dp.last_screenshot_warnings
		_screenshot_result = _success(payload)
	else:
		_screenshot_result = _error("CAPTURE_FAILED", error)


func capture_editor_screenshot(params: Dictionary) -> Dictionary:
	var viewport_type: String = params.get("viewport", "")
	var max_width: int = params.get("max_width", DEFAULT_MAX_WIDTH)

	var viewport: SubViewport = null

	match viewport_type:
		"2d":
			viewport = EditorInterface.get_editor_viewport_2d()
		"3d":
			viewport = EditorInterface.get_editor_viewport_3d(0)
		_:
			viewport = _find_active_viewport()

	if viewport == null:
		return _error("NO_VIEWPORT", "Could not find editor viewport")

	var image := viewport.get_texture().get_image()
	return _process_and_encode_image(image, max_width)


# Lossless PNG, not JPEG: vision-token cost is set by resolution, not codec, so
# JPEG only added compression artifacts. max_width bounds the resolution cost.
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


# Returns the SubViewport of whichever main-screen tab (2D or 3D) is currently
# active. EditorInterface always hands back both viewports regardless of the
# active tab, so we pick the one whose editor panel is actually on screen. When
# neither is active (e.g. the Script or AssetLib tab is selected) we fall back to
# the 2D canvas so the call still returns an image rather than erroring.
func _find_active_viewport() -> SubViewport:
	var v2d := EditorInterface.get_editor_viewport_2d()
	if v2d and _viewport_on_active_tab(v2d):
		return v2d

	var v3d := EditorInterface.get_editor_viewport_3d(0)
	if v3d and _viewport_on_active_tab(v3d):
		return v3d

	return v2d if v2d else v3d


# A main-screen editor panel (and the viewport nested inside it) is hidden when
# its tab is not the selected one. is_visible_in_tree() on the viewport's
# container is true only when every ancestor is visible, i.e. this is the active
# tab.
func _viewport_on_active_tab(viewport: SubViewport) -> bool:
	var container := viewport.get_parent()
	if container is CanvasItem:
		return (container as CanvasItem).is_visible_in_tree()
	return true
