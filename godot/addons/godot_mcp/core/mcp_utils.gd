@tool
class_name MCPUtils
extends RefCounted


static func success(result: Dictionary) -> Dictionary:
	return {
		"status": "success",
		"result": result
	}


static func error(code: String, message: String) -> Dictionary:
	return {
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	}


static func get_node_from_path(path: String) -> Node:
	var root := EditorInterface.get_edited_scene_root()
	if not root:
		return null

	if path == "/root" or path == "/" or path == str(root.get_path()):
		return root

	if path.begins_with("/root/"):
		var parts := path.split("/")
		if parts.size() >= 3:
			if parts[2] == root.name:
				var relative_path := "/".join(parts.slice(3))
				if relative_path.is_empty():
					return root
				return root.get_node_or_null(relative_path)

	if path.begins_with("/"):
		path = path.substr(1)

	return root.get_node_or_null(path)


static func serialize_value(value: Variant) -> Variant:
	match typeof(value):
		TYPE_VECTOR2:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR2I:
			return {"x": value.x, "y": value.y}
		TYPE_VECTOR3:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_VECTOR3I:
			return {"x": value.x, "y": value.y, "z": value.z}
		TYPE_COLOR:
			return {"r": value.r, "g": value.g, "b": value.b, "a": value.a}
		TYPE_OBJECT:
			if value == null:
				return null
			if value is Resource:
				return value.resource_path if value.resource_path else str(value)
			return str(value)
		_:
			return value


static func deserialize_value(value: Variant) -> Variant:
	# uid:// references (written into .tscn by the editor since 4.4) resolve the
	# same way res:// does — load() accepts both. Without the uid:// arm, a uid
	# string handed to a resource-typed property silently fails to load and the
	# property keeps its old value.
	if value is String and (value.begins_with("res://") or value.begins_with("uid://")):
		var resource := load(value)
		if resource:
			return resource
	if value is Dictionary:
		if value.has("_resource"):
			return _create_resource(value)
		if value.has("x") and value.has("y"):
			if value.has("z"):
				return Vector3(value.x, value.y, value.z)
			return Vector2(value.x, value.y)
		if value.has("r") and value.has("g") and value.has("b"):
			return Color(value.r, value.g, value.b, value.get("a", 1.0))
	return value


static func _create_resource(spec: Dictionary) -> Resource:
	var resource_type: String = spec.get("_resource", "")
	if not ClassDB.class_exists(resource_type):
		MCPLog.error("Unknown resource type: %s" % resource_type)
		return null
	if not ClassDB.is_parent_class(resource_type, "Resource"):
		MCPLog.error("Type is not a Resource: %s" % resource_type)
		return null

	var resource: Resource = ClassDB.instantiate(resource_type)
	if not resource:
		MCPLog.error("Failed to create resource: %s" % resource_type)
		return null

	for key in spec:
		if key == "_resource":
			continue
		if key in resource:
			resource.set(key, deserialize_value(spec[key]))

	return resource


# ── project.godot staleness (#245) ────────────────────────────────────────────
# The editor caches ProjectSettings / InputMap in memory at load. An agent that
# edits project.godot as a file (batch-writing autoloads / input map) leaves the
# editor stale: its log fills with phantom "Identifier not found: <autoload>"
# errors that do not exist at runtime, and its input map is out of date — while
# spawned games (which read disk fresh at launch) work fine. We detect that by
# content-diffing the two sections that actually cause the trap, [autoload] and
# [input], disk vs the editor's in-memory state. Recovery is `godot_editor_edit
# restart` (#250). A content diff (not an mtime check) is used deliberately: it
# never false-positives when the editor itself saves project.godot (e.g. the
# plugin's own startup autoload write), because disk is then written FROM memory.


# Pure: diff already-read disk vs in-memory sets. No engine access, so this is
# unit-testable headless. Autoloads are symmetric (added/removed/value-changed,
# raw-string compare incl. the "*" singleton prefix). Input is additive-only
# (actions present on disk but not loaded — the trap); the reverse direction and
# event values are intentionally ignored (built-in ui_* noise / fragile compares).
static func diff_project_staleness(
		disk_autoloads: Dictionary, mem_autoloads: Dictionary,
		disk_input_keys: Array, mem_input_keys: Array) -> Dictionary:
	var autoload_added := []
	var autoload_removed := []
	var autoload_changed := []
	for key in disk_autoloads:
		if not mem_autoloads.has(key):
			autoload_added.append(key)
		elif str(disk_autoloads[key]) != str(mem_autoloads[key]):
			autoload_changed.append(key)
	for key in mem_autoloads:
		if not disk_autoloads.has(key):
			autoload_removed.append(key)

	var mem_input_set := {}
	for k in mem_input_keys:
		mem_input_set[k] = true
	var input_added := []
	for k in disk_input_keys:
		if not mem_input_set.has(k):
			input_added.append(k)

	autoload_added.sort()
	autoload_removed.sort()
	autoload_changed.sort()
	input_added.sort()

	var stale: bool = not (autoload_added.is_empty() and autoload_removed.is_empty()
		and autoload_changed.is_empty() and input_added.is_empty())

	return {
		"stale": stale,
		"autoload": {
			"added": autoload_added,
			"removed": autoload_removed,
			"changed": autoload_changed,
		},
		"input": {"added": input_added},
		"summary": _staleness_summary(autoload_added, autoload_removed, autoload_changed, input_added),
	}


static func _staleness_summary(a_added: Array, a_removed: Array, a_changed: Array, i_added: Array) -> String:
	var parts := []
	if not a_added.is_empty():
		parts.append("%d autoload(s) added on disk (%s)" % [a_added.size(), ", ".join(a_added)])
	if not a_removed.is_empty():
		parts.append("%d autoload(s) removed on disk (%s)" % [a_removed.size(), ", ".join(a_removed)])
	if not a_changed.is_empty():
		parts.append("%d autoload(s) changed on disk (%s)" % [a_changed.size(), ", ".join(a_changed)])
	if not i_added.is_empty():
		parts.append("%d input action(s) added on disk (%s)" % [i_added.size(), ", ".join(i_added)])
	if parts.is_empty():
		return "project.godot on disk matches the editor's loaded settings."
	return ("project.godot was edited on disk after the editor loaded it: %s. The editor's in-memory "
		+ "settings are stale (its log may show phantom \"Identifier not found\" errors that do not "
		+ "exist at runtime). Run `godot_editor_edit restart` to reload project.godot (save:false to discard "
		+ "unsaved editor changes).") % "; ".join(parts)


# Editor-context orchestrator. Reads project.godot from disk (a plain text scan,
# NOT ConfigFile — which would eagerly instantiate the [input] InputEvent
# sub-objects) and the in-memory ProjectSettings, then diffs. Never throws: any
# read failure returns {stale=false, note=...} so a transient I/O hiccup can
# never produce a false "stale" (recovery is disruptive — silence beats crying
# wolf). The {stale, autoload, input, summary} shape mirrors diff_project_staleness.
static func detect_project_staleness() -> Dictionary:
	var disk := _read_disk_project_sections()
	if disk.is_empty():
		return {"stale": false, "note": "Could not read res://project.godot to check staleness."}

	var mem := _read_mem_sections()
	var mem_autoloads: Dictionary = mem["autoload"]
	var disk_autoloads: Dictionary = disk.get("autoload", {})
	# A project with autoloads always writes the [autoload] section (the addon
	# writes its own bridge autoload at startup). If the section is absent, treat
	# it as "nothing to compare" rather than "everything removed".
	if not disk.get("has_autoload_section", false):
		disk_autoloads = mem_autoloads.duplicate()

	return diff_project_staleness(
		disk_autoloads, mem_autoloads,
		disk.get("input_keys", []), mem["input_keys"])


# Scan project.godot once, section-aware. Returns
#   { autoload: {Name: "value"}, input_keys: [action,...], has_autoload_section }
# or {} if the file can't be read. Only [autoload] (name + unquoted value) and
# [input] (action NAMES only — the InputEvent dicts are never parsed) are read.
static func _read_disk_project_sections() -> Dictionary:
	if not FileAccess.file_exists("res://project.godot"):
		MCPLog.warn("project.godot not found; skipping staleness check")
		return {}
	var text := FileAccess.get_file_as_string("res://project.godot")
	if text.is_empty():
		MCPLog.warn("Could not read project.godot for staleness check")
		return {}

	var autoloads := {}
	var input_keys := []
	var has_autoload := false
	var section := ""
	# A top-level key line: identifier `=` value, at column 0. Dict-body lines of
	# an [input] action start with `"`/`}`/`]` (or are indented), so they never match.
	var key_re := RegEx.new()
	key_re.compile("^([A-Za-z_][A-Za-z0-9_]*)=(.*)$")

	for raw in text.split("\n"):
		var line := raw.strip_edges(false, true)  # trailing only (drops CR / spaces)
		if line.begins_with("[") and line.ends_with("]"):
			section = line.substr(1, line.length() - 2)
			if section == "autoload":
				has_autoload = true
			continue
		if section != "autoload" and section != "input":
			continue
		var m := key_re.search(line)
		if m == null:
			continue
		var key := m.get_string(1)
		if section == "autoload":
			autoloads[key] = _unquote(m.get_string(2))
		elif not key.begins_with("ui_"):
			input_keys.append(key)

	return {"autoload": autoloads, "input_keys": input_keys, "has_autoload_section": has_autoload}


# Single pass over ProjectSettings (it carries hundreds of entries) collecting
# both the in-memory autoloads ({Name: value}) and the non-builtin input action
# names. Returns { autoload: Dictionary, input_keys: Array }.
static func _read_mem_sections() -> Dictionary:
	var autoloads := {}
	var input_keys := []
	for prop in ProjectSettings.get_property_list():
		var pname: String = prop["name"]
		if pname.begins_with("autoload/"):
			autoloads[pname.substr(9)] = str(ProjectSettings.get_setting(pname, ""))
		elif pname.begins_with("input/"):
			var action := pname.substr(6)
			if not action.begins_with("ui_"):
				input_keys.append(action)
	return {"autoload": autoloads, "input_keys": input_keys}


static func _unquote(s: String) -> String:
	var t := s.strip_edges()
	if t.length() >= 2 and t.begins_with("\"") and t.ends_with("\""):
		return t.substr(1, t.length() - 2)
	return t
