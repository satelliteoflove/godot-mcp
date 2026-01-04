@tool
extends Control

@onready var status_label: Label = $MarginContainer/HBoxContainer/StatusLabel
@onready var status_icon: ColorRect = $MarginContainer/HBoxContainer/StatusIcon


func _ready() -> void:
	set_status("Initializing...")


func set_status(status: String) -> void:
	if status_label:
		status_label.text = status

	if status_icon:
		match status:
			"Connected":
				status_icon.color = Color.GREEN
			"Disconnected", "Waiting for connection...":
				status_icon.color = Color.ORANGE
			_:
				status_icon.color = Color.GRAY
