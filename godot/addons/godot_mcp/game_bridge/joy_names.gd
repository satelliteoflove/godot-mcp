@tool
class_name MCPJoyNames
extends RefCounted
## Canonical joypad name<->index tables, shared by the game bridge (event
## injection) and the editor input commands (get_input_map display) so the
## wire vocabulary and the displayed names can never drift apart.

const BUTTONS := {
	"a": JOY_BUTTON_A,
	"b": JOY_BUTTON_B,
	"x": JOY_BUTTON_X,
	"y": JOY_BUTTON_Y,
	"back": JOY_BUTTON_BACK,
	"guide": JOY_BUTTON_GUIDE,
	"start": JOY_BUTTON_START,
	"left_stick": JOY_BUTTON_LEFT_STICK,
	"right_stick": JOY_BUTTON_RIGHT_STICK,
	"left_shoulder": JOY_BUTTON_LEFT_SHOULDER,
	"right_shoulder": JOY_BUTTON_RIGHT_SHOULDER,
	"dpad_up": JOY_BUTTON_DPAD_UP,
	"dpad_down": JOY_BUTTON_DPAD_DOWN,
	"dpad_left": JOY_BUTTON_DPAD_LEFT,
	"dpad_right": JOY_BUTTON_DPAD_RIGHT,
	"misc1": JOY_BUTTON_MISC1,
	"paddle1": JOY_BUTTON_PADDLE1,
	"paddle2": JOY_BUTTON_PADDLE2,
	"paddle3": JOY_BUTTON_PADDLE3,
	"paddle4": JOY_BUTTON_PADDLE4,
	"touchpad": JOY_BUTTON_TOUCHPAD,
}

const AXES := {
	"left_x": JOY_AXIS_LEFT_X,
	"left_y": JOY_AXIS_LEFT_Y,
	"right_x": JOY_AXIS_RIGHT_X,
	"right_y": JOY_AXIS_RIGHT_Y,
	"trigger_left": JOY_AXIS_TRIGGER_LEFT,
	"trigger_right": JOY_AXIS_TRIGGER_RIGHT,
}


## Resolve a wire value (name string, or raw index as an escape hatch) to a
## JoyButton index. Returns -1 for anything unknown.
static func button_index(value: Variant) -> int:
	if value is int or value is float:
		var i := int(value)
		return i if i >= 0 and i < JOY_BUTTON_SDL_MAX else -1
	return int(BUTTONS.get(str(value), -1))


## Resolve a wire axis name to a JoyAxis index. Names only — the name itself
## is what tells an agent trigger (0..1) from stick (-1..1). Returns -1 if unknown.
static func axis_index(value: Variant) -> int:
	return int(AXES.get(str(value), -1))


static func button_name(idx: int) -> String:
	for n in BUTTONS:
		if int(BUTTONS[n]) == idx:
			return n
	return "button_%d" % idx


static func axis_name(idx: int) -> String:
	for n in AXES:
		if int(AXES[n]) == idx:
			return n
	return "axis_%d" % idx
