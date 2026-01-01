@tool
extends MCPBaseCommand
class_name MCPSelectionCommands


func get_commands() -> Dictionary:
	return {
		"get_editor_state": get_editor_state,
		"get_selected_nodes": get_selected_nodes,
		"select_node": select_node
	}


func get_editor_state(_params: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	var open_scenes := EditorInterface.get_open_scenes()

	var main_screen := _get_current_main_screen()

	return _success({
		"current_scene": root.scene_file_path if root else null,
		"is_playing": EditorInterface.is_playing_scene(),
		"godot_version": Engine.get_version_info()["string"],
		"open_scenes": Array(open_scenes),
		"main_screen": main_screen
	})


func _get_current_main_screen() -> String:
	var main_screen := EditorInterface.get_editor_main_screen()
	if not main_screen:
		return "unknown"

	for child in main_screen.get_children():
		if child.visible and child is Control:
			var cls := child.get_class()
			var node_name := child.name

			if "CanvasItemEditor" in cls or "2D" in node_name:
				return "2D"
			elif "Node3DEditor" in cls or "3D" in node_name:
				return "3D"
			elif "ScriptEditor" in cls or "Script" in node_name:
				return "Script"
			elif "AssetLib" in cls or "Asset" in node_name:
				return "AssetLib"

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
