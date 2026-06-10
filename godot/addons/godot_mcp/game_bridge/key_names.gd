@tool
class_name MCPKeyNames
extends RefCounted
## Canonical keyboard name<->keycode parsing/formatting (#290), shared by the
## game bridge (raw InputEventKey injection) and the editor input commands
## (get_input_map display) so the wire vocabulary and the displayed names can
## never drift apart.
##
## Why this exists rather than calling OS.find_keycode_from_string directly:
## that engine helper parses Ctrl/Shift/Alt prefixes but SILENTLY DROPS Meta/Cmd
## (verified Godot 4.6 — "Meta+Q" returns a bare KEY_Q). We split modifiers here
## ourselves so meta round-trips, and only hand the base token to the engine.

## Modifier token -> key mask. Case-insensitive (callers lowercase first).
## Aliases cover the common cross-platform spellings agents reach for.
const MODIFIERS := {
	"ctrl": KEY_MASK_CTRL,
	"control": KEY_MASK_CTRL,
	"shift": KEY_MASK_SHIFT,
	"alt": KEY_MASK_ALT,
	"option": KEY_MASK_ALT,
	"opt": KEY_MASK_ALT,
	"meta": KEY_MASK_META,
	"cmd": KEY_MASK_META,
	"command": KEY_MASK_META,
	"super": KEY_MASK_META,
	"win": KEY_MASK_META,
}

## Key mask -> the modifier's own keycode, so a combo can press each modifier as
## a real key (the only way is_key_pressed(KEY_CTRL) ever reads true — the
## modifier FLAG on another event does not update the polled singleton).
const MODIFIER_KEYCODES := {
	KEY_MASK_CTRL: KEY_CTRL,
	KEY_MASK_SHIFT: KEY_SHIFT,
	KEY_MASK_ALT: KEY_ALT,
	KEY_MASK_META: KEY_META,
}

# The four modifier masks, in canonical display/iteration order.
const _MOD_ORDER: Array = [KEY_MASK_CTRL, KEY_MASK_SHIFT, KEY_MASK_ALT, KEY_MASK_META]
const _MOD_TOKENS := {
	KEY_MASK_CTRL: "Ctrl",
	KEY_MASK_SHIFT: "Shift",
	KEY_MASK_ALT: "Alt",
	KEY_MASK_META: "Meta",
}


## Parse a wire key value into {code:int, mask:int}. Accepts a string with
## optional modifier prefixes ("a", "Escape", "ctrl+s", "shift+alt+f1") or a raw
## Godot Key enum int (which may carry modifier mask bits). Returns code = KEY_NONE
## (0) for anything that does not resolve to a base key, which the caller turns
## into an "Unknown key" error.
static func parse(value: Variant) -> Dictionary:
	if value is int or value is float:
		var raw := int(value)
		return {"code": raw & ~int(KEY_MODIFIER_MASK), "mask": raw & int(KEY_MODIFIER_MASK)}

	var s := str(value).strip_edges()
	if s.is_empty():
		return {"code": KEY_NONE, "mask": 0}

	var mask := 0
	var base := ""
	for part in s.split("+", false):
		var token := String(part).strip_edges()
		if token.is_empty():
			continue
		var lower := token.to_lower()
		if MODIFIERS.has(lower):
			mask |= int(MODIFIERS[lower])
		else:
			# The last non-modifier token wins as the base (a stray extra base
			# would just overwrite, which is fine — a malformed combo resolves to
			# whatever its final base token is, or KEY_NONE if none resolves).
			base = token

	if base.is_empty():
		# A lone modifier name ("shift", "ctrl", "cmd") means the modifier KEY
		# itself — e.g. a game binding bare Shift, or polling is_key_pressed(KEY_CTRL).
		# Exactly one modifier resolves to its keycode; a baseless multi-modifier
		# combo ("ctrl+shift") is ambiguous and stays unknown.
		for m in _MOD_ORDER:
			if mask == int(m):
				return {"code": int(MODIFIER_KEYCODES[m]), "mask": 0}
		return {"code": KEY_NONE, "mask": mask}

	# find_keycode_from_string handles Ctrl/Shift/Alt itself; strip any mask bits
	# it folded in so `code` is always a bare base keycode.
	var resolved := int(OS.find_keycode_from_string(base))
	mask |= resolved & int(KEY_MODIFIER_MASK)
	var code := resolved & ~int(KEY_MODIFIER_MASK)
	return {"code": code, "mask": mask}


## The modifier keycodes (KEY_CTRL, ...) present in a mask, in canonical order,
## so a combo can press each one as its own key event.
static func modifier_key_indices(mask: int) -> Array:
	var out: Array = []
	for m in _MOD_ORDER:
		if mask & int(m):
			out.append(int(MODIFIER_KEYCODES[m]))
	return out


## Canonical display for a key binding (get_input_map). Modifier prefixes come
## from the event's own flags with fixed tokens (platform-stable, and re-parseable
## by parse() — unlike OS.get_keycode_string's mask spelling, which
## find_keycode_from_string cannot read back for Meta). A logical key + modifier
## combo round-trips through parse(); a physical-only binding (keycode unset)
## renders from physical_keycode with a "(physical)" marker that tells an agent to
## inject with physical:true — that marker is display-only, not re-parseable.
static func event_string(event: InputEventKey) -> String:
	var prefix := ""
	if event.ctrl_pressed:
		prefix += _MOD_TOKENS[KEY_MASK_CTRL] + "+"
	if event.shift_pressed:
		prefix += _MOD_TOKENS[KEY_MASK_SHIFT] + "+"
	if event.alt_pressed:
		prefix += _MOD_TOKENS[KEY_MASK_ALT] + "+"
	if event.meta_pressed:
		prefix += _MOD_TOKENS[KEY_MASK_META] + "+"

	if event.keycode != KEY_NONE:
		var base := OS.get_keycode_string(event.keycode)
		return prefix + (base if not base.is_empty() else "Key %d" % int(event.keycode))
	if event.physical_keycode != KEY_NONE:
		var pbase := OS.get_keycode_string(event.physical_keycode)
		return prefix + (pbase if not pbase.is_empty() else "Key %d" % int(event.physical_keycode)) + " (physical)"
	# Last resort: an event with neither keycode set (e.g. unicode-only).
	var label := prefix.trim_suffix("+")
	return label if not label.is_empty() else "(unset)"
