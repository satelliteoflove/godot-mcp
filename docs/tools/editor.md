# Editor Tools

Editor control and debugging tools

## Tools

- [get_editor_state](#get_editor_state)
- [get_selected_nodes](#get_selected_nodes)
- [select_node](#select_node)
- [run_project](#run_project)
- [stop_project](#stop_project)
- [get_debug_output](#get_debug_output)

---

## get_editor_state

Get the current state of the Godot editor

### Parameters

*No parameters required.*

---

## get_selected_nodes

Get the currently selected nodes in the editor

### Parameters

*No parameters required.*

---

## select_node

Select a node in the editor

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node to select |

---

## run_project

Run the current Godot project

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `scene_path` | string | No | Optional specific scene to run (defaults to main scene) |

---

## stop_project

Stop the running Godot project

### Parameters

*No parameters required.*

---

## get_debug_output

Get debug output/print statements from the running project

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clear` | boolean | No | Whether to clear the output buffer after reading |

---

