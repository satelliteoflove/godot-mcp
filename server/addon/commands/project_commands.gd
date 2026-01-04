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

	if category == "input":
		return _get_input_mappings(params)

	var settings := {}
	var all_settings := ProjectSettings.get_property_list()

	for prop in all_settings:
		var name: String = prop["name"]
		if not category.is_empty() and not name.begins_with(category):
			continue
		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			settings[name] = _serialize_value(ProjectSettings.get_setting(name))

	return _success({"settings": settings})


func _get_input_mappings(params: Dictionary) -> Dictionary:
	var include_builtin: bool = params.get("include_builtin", false)
	var actions := {}

	# Read from ProjectSettings instead of InputMap
	# InputMap in editor context only has editor actions, not game inputs
	# Game inputs are stored as "input/<action_name>" in ProjectSettings
	var all_settings := ProjectSettings.get_property_list()

	for prop in all_settings:
		var name: String = prop["name"]
		if not name.begins_with("input/"):
			continue

		var action_name := name.substr(6)  # Remove "input/" prefix

		if not include_builtin and action_name.begins_with("ui_"):
			continue

		var action_data = ProjectSettings.get_setting(name)
		if action_data is Dictionary:
			var events := []
			var raw_events = action_data.get("events", [])
			for event in raw_events:
				if event is InputEvent:
					events.append(_serialize_input_event(event))

			actions[action_name] = {
				"deadzone": action_data.get("deadzone", 0.5),
				"events": events
			}

	return _success({"settings": actions})


func _serialize_input_event(event: InputEvent) -> Dictionary:
	if event is InputEventKey:
		var keycode: int = event.keycode if event.keycode else event.physical_keycode
		return {
			"type": "key",
			"keycode": event.keycode,
			"physical_keycode": event.physical_keycode,
			"key_label": OS.get_keycode_string(keycode),
			"modifiers": _get_modifiers(event)
		}
	elif event is InputEventMouseButton:
		return {
			"type": "mouse_button",
			"button_index": event.button_index,
			"modifiers": _get_modifiers(event)
		}
	elif event is InputEventJoypadButton:
		return {
			"type": "joypad_button",
			"button_index": event.button_index,
			"device": event.device
		}
	elif event is InputEventJoypadMotion:
		return {
			"type": "joypad_motion",
			"axis": event.axis,
			"axis_value": event.axis_value,
			"device": event.device
		}
	return {"type": "unknown", "event": str(event)}


func _get_modifiers(event: InputEventWithModifiers) -> Dictionary:
	return {
		"shift": event.shift_pressed,
		"ctrl": event.ctrl_pressed,
		"alt": event.alt_pressed,
		"meta": event.meta_pressed
	}
