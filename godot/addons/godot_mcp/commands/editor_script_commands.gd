@tool
extends MCPBaseCommand
class_name MCPEditorScriptCommands

## Allows running arbitrary GDScript in the editor context via an EditorScript.
## This is the equivalent of opening a script in the Script editor and pressing
## Ctrl+Shift+X ("Run"). Useful for one-off resource assignments, batch node
## edits, or any operation the MCP node/resource tools cannot express directly.


func get_commands() -> Dictionary:
	return {
		"run_editor_script": run_editor_script,
	}


## Run a snippet of GDScript code inside an EditorScript.
##
## The code string is the *body* of the _run() function — do not include the
## class declaration or _run() header, just the statements you want to execute.
##
## Example params:
##   {"code": "print(EditorInterface.get_edited_scene_root().name)"}
##
## Returns {"output": "..."} on success (captured from print statements via the
## output array pattern) or an error dict.
func run_editor_script(params: Dictionary) -> Dictionary:
	var scene_check := _require_scene_open()
	if not scene_check.is_empty():
		return scene_check

	var code: String = params.get("code", "")
	if code.is_empty():
		return _error("INVALID_PARAMS", "code is required")

	var indented_lines: PackedStringArray = []
	for line in code.split("\n"):
		indented_lines.append("\t" + line)
	var full_source := "@tool\nextends EditorScript\n\nfunc _run() -> void:\n" \
		+ "\n".join(indented_lines) + "\n"

	var script := GDScript.new()
	script.source_code = full_source

	var reload_err := script.reload()
	if reload_err != OK:
		return _error("SCRIPT_ERROR", "GDScript compile error (code %d). Check syntax." % reload_err)

	var instance = script.new()
	if not instance or not instance is EditorScript:
		return _error("INSTANTIATE_FAILED", "Could not instantiate EditorScript")

	instance._run()

	return _success({"message": "Script executed successfully"})
