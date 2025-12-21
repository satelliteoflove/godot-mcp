@tool
extends MCPBaseCommand
class_name MCPDebugCommands

var _debug_output: PackedStringArray = []


func get_commands() -> Dictionary:
	return {
		"run_project": run_project,
		"stop_project": stop_project,
		"get_debug_output": get_debug_output
	}


func run_project(params: Dictionary) -> Dictionary:
	var scene_path: String = params.get("scene_path", "")

	if scene_path.is_empty():
		EditorInterface.play_main_scene()
	else:
		EditorInterface.play_custom_scene(scene_path)

	return _success({})


func stop_project(_params: Dictionary) -> Dictionary:
	EditorInterface.stop_playing_scene()
	return _success({})


func get_debug_output(params: Dictionary) -> Dictionary:
	var clear: bool = params.get("clear", false)
	var output := "\n".join(_debug_output)

	if clear:
		_debug_output.clear()

	return _success({"output": output})
