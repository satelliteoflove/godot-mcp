@tool
extends Control

signal config_applied(config: Dictionary)


func _get_minimum_size() -> Vector2:
	return Vector2.ZERO

@onready var status_label: Label = $MarginContainer/VBoxContainer/StatusRow/StatusLabel
@onready var status_icon: ColorRect = $MarginContainer/VBoxContainer/StatusRow/StatusIcon
@onready var version_label: Label = $MarginContainer/VBoxContainer/StatusRow/VersionLabel
@onready var bind_mode_option: OptionButton = $MarginContainer/VBoxContainer/SettingsGrid/BindModeOption
@onready var custom_ip_label: Label = $MarginContainer/VBoxContainer/SettingsGrid/CustomIpLabel
@onready var custom_ip_edit: LineEdit = $MarginContainer/VBoxContainer/SettingsGrid/CustomIpEdit
@onready var port_override_label: Label = $MarginContainer/VBoxContainer/SettingsGrid/PortOverrideLabel
@onready var port_override_enabled: CheckBox = $MarginContainer/VBoxContainer/SettingsGrid/PortOverrideControls/PortOverrideEnabled
@onready var port_override_spin: SpinBox = $MarginContainer/VBoxContainer/SettingsGrid/PortOverrideControls/PortOverrideSpin
@onready var apply_button: Button = $MarginContainer/VBoxContainer/SettingsGrid/PortOverrideControls/ApplyButton

var _addon_version: String = ""

var _updating_ui := false


func _ready() -> void:
	if bind_mode_option:
		_updating_ui = true
		bind_mode_option.clear()
		bind_mode_option.add_item("Localhost", 0)
		bind_mode_option.add_item("WSL", 1)
		bind_mode_option.add_item("Custom", 2)
		bind_mode_option.selected = 0
		_updating_ui = false
		bind_mode_option.item_selected.connect(_on_bind_mode_selected)

	if apply_button:
		apply_button.pressed.connect(_on_apply_pressed)

	if port_override_enabled:
		port_override_enabled.toggled.connect(_on_port_override_toggled)
	if port_override_spin:
		port_override_spin.value = 6550

	# Keyboard navigation / focus
	_for_control_focus(bind_mode_option)
	_for_control_focus(custom_ip_edit)
	_for_control_focus(port_override_enabled)
	_for_control_focus(port_override_spin)
	_for_control_focus(apply_button)

	# Set up focus chain: each control points to the next in sequence
	if bind_mode_option and (custom_ip_edit or apply_button):
		bind_mode_option.focus_next = custom_ip_edit.get_path() if custom_ip_edit else apply_button.get_path()
	if custom_ip_edit and (port_override_enabled or apply_button):
		custom_ip_edit.focus_next = port_override_enabled.get_path() if port_override_enabled else apply_button.get_path()
	if port_override_enabled and (port_override_spin or apply_button):
		port_override_enabled.focus_next = port_override_spin.get_path() if port_override_spin else apply_button.get_path()
	if port_override_spin and (apply_button or bind_mode_option):
		port_override_spin.focus_next = apply_button.get_path() if apply_button else bind_mode_option.get_path()
	if apply_button and (bind_mode_option or apply_button):
		apply_button.focus_next = bind_mode_option.get_path() if bind_mode_option else apply_button.get_path()

	_update_controls_enabled()
	set_status("Initializing...")


func set_status(status: String) -> void:
	if status_label:
		status_label.text = status

	if status_icon:
		if status.begins_with("Connected"):
			status_icon.color = Color.GREEN
		elif status.begins_with("Disconnected") or status.begins_with("Waiting"):
			status_icon.color = Color.ORANGE
		else:
			status_icon.color = Color.GRAY


func set_bind_mode(mode: MCPEnums.BindMode) -> void:
	if not bind_mode_option:
		return
	_updating_ui = true
	match mode:
		MCPEnums.BindMode.WSL:
			bind_mode_option.select(1)
		MCPEnums.BindMode.CUSTOM:
			bind_mode_option.select(2)
		_:
			bind_mode_option.select(0)
	_updating_ui = false
	_update_controls_enabled()


func get_bind_mode() -> MCPEnums.BindMode:
	if not bind_mode_option:
		return MCPEnums.BindMode.LOCALHOST
	match bind_mode_option.selected:
		1:
			return MCPEnums.BindMode.WSL
		2:
			return MCPEnums.BindMode.CUSTOM
		_:
			return MCPEnums.BindMode.LOCALHOST


func set_custom_ip(ip: String) -> void:
	if not custom_ip_edit:
		return
	_updating_ui = true
	custom_ip_edit.text = ip
	_updating_ui = false


func get_custom_ip() -> String:
	return custom_ip_edit.text if custom_ip_edit else ""


func _on_bind_mode_selected(_idx: int) -> void:
	if _updating_ui:
		return
	_update_controls_enabled()


func _on_port_override_toggled(_enabled: bool) -> void:
	if _updating_ui:
		return
	_update_controls_enabled()


func _on_apply_pressed() -> void:
	config_applied.emit(get_config())


func get_config() -> Dictionary:
	return {
		"bind_mode": get_bind_mode(),
		"custom_ip": get_custom_ip(),
		"port_override_enabled": port_override_enabled.button_pressed if port_override_enabled else false,
		"port_override": int(port_override_spin.value) if port_override_spin else 6550,
	}


func set_config(bind_mode: MCPEnums.BindMode, custom_ip: String, port_enabled: bool, port_value: int) -> void:
	set_bind_mode(bind_mode)
	set_custom_ip(custom_ip)
	if port_override_enabled:
		_updating_ui = true
		port_override_enabled.button_pressed = port_enabled
		_updating_ui = false
	if port_override_spin:
		_updating_ui = true
		port_override_spin.value = clamp(port_value, 1, 65535)
		_updating_ui = false
	_update_controls_enabled()


func _for_control_focus(c: Control) -> void:
	if not c:
		return
	c.focus_mode = Control.FOCUS_ALL


func _unhandled_key_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var e := event as InputEventKey
	if not e.pressed or e.echo:
		return
	if e.keycode == KEY_ENTER or e.keycode == KEY_KP_ENTER:
		if apply_button:
			_on_apply_pressed()
			get_viewport().set_input_as_handled()


func _update_controls_enabled() -> void:
	# Custom IP only editable in Custom mode
	var custom_ip_enabled := get_bind_mode() == MCPEnums.BindMode.CUSTOM
	if custom_ip_edit:
		custom_ip_edit.editable = custom_ip_enabled
		custom_ip_edit.modulate.a = 1.0 if custom_ip_enabled else 0.5
	if custom_ip_label:
		custom_ip_label.modulate.a = 1.0 if custom_ip_enabled else 0.5

	# Port override controls
	var port_enabled := port_override_enabled and port_override_enabled.button_pressed
	if port_override_spin:
		port_override_spin.editable = port_enabled
		port_override_spin.modulate.a = 1.0 if port_enabled else 0.5
	if port_override_label:
		port_override_label.modulate.a = 1.0 if port_enabled else 0.5


func set_addon_version(version: String) -> void:
	_addon_version = version
	_update_version_label()


func set_server_version(version: String) -> void:
	if not version_label:
		return
	if version.is_empty():
		_update_version_label()
	elif _addon_version.is_empty():
		version_label.text = "Server: %s" % version
	elif version == _addon_version:
		version_label.text = "v%s" % version
	else:
		version_label.text = "Addon: %s | Server: %s" % [_addon_version, version]
		version_label.add_theme_color_override("font_color", Color.ORANGE)


func clear_server_version() -> void:
	_update_version_label()
	if version_label:
		version_label.remove_theme_color_override("font_color")


func _update_version_label() -> void:
	if not version_label:
		return
	if _addon_version.is_empty():
		version_label.text = ""
	else:
		version_label.text = "v%s" % _addon_version
