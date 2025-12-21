@tool
extends MCPBaseCommand
class_name MCPProjectCommands


func get_commands() -> Dictionary:
	return {
		"get_project_info": get_project_info,
		"get_project_settings": get_project_settings
	}


func get_project_info(_params: Dictionary) -> Dictionary:
	return _success({
		"name": ProjectSettings.get_setting("application/config/name", "Unknown"),
		"path": ProjectSettings.globalize_path("res://"),
		"godot_version": Engine.get_version_info()["string"],
		"main_scene": ProjectSettings.get_setting("application/run/main_scene", null)
	})


func get_project_settings(params: Dictionary) -> Dictionary:
	var category: String = params.get("category", "")
	var settings := {}
	var all_settings := ProjectSettings.get_property_list()

	for prop in all_settings:
		var name: String = prop["name"]
		if not category.is_empty() and not name.begins_with(category):
			continue
		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			settings[name] = ProjectSettings.get_setting(name)

	return _success({"settings": settings})
