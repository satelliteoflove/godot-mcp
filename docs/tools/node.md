# Node Tools

Node manipulation and script attachment tools

## Tools

- [godot_node_read](#godot_node_read)
- [godot_node_edit](#godot_node_edit)

---

## godot_node_read

Inspect scene nodes in the editor: read a node's effective properties (including class defaults a .tscn read cannot show), view the full scene tree as the editor sees it (including children inside instanced sub-scenes), and find nodes by name or type. Use it to discover node paths and verify the live state of the open scene before or after making changes. It cannot modify anything; to update properties or reparent a node, use godot_node_edit.

### Actions

#### `get_properties`

Get a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

#### `get_scene_tree`

Full hierarchy of the open scene as the editor sees it, including children inside instanced sub-scenes (a .tscn file read cannot show those). Deep or wide scenes can be large — cap the result with max_depth and/or max_children; any node whose children are cut off carries "truncated_children": <count of omitted direct children> instead of (or alongside) "children".

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_depth` | integer | No | Cap recursion depth (root = depth 1). Omit for the full tree. |
| `max_children` | integer | No | Cap how many children are listed per node. Omit to list every child. |

#### `find`

Find nodes by name and/or type. Searches the RUNNING game's live tree when a game is playing (spawned entities included); otherwise searches the scene open in the editor.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name_pattern` | string | No | Glob pattern to match node names, e.g. "*Spawner*", "Turret?" |
| `type` | string | No | Filter by node type, e.g. "CharacterBody2D", "Area2D" |
| `root_path` | string | No | Path to start search from (defaults to scene root) |

### Examples

```json
// get_properties
{
  "action": "get_properties",
  "node_path": "/root/Main/Player"
}
```

```json
// get_scene_tree
{
  "action": "get_scene_tree"
}
```

```json
// find
{
  "action": "find",
  "name_pattern": "*Enemy*"
}
```

---

## godot_node_edit

Modify scene nodes in the editor: update a node's properties, or reparent it (the editor rewrites child paths and signal connections correctly; hand-editing .tscn for a reparent does not). Use it to change existing nodes in the open scene. To inspect properties, the scene tree, or search for nodes, use godot_node_read; to add or remove nodes, or attach scripts and connect signals, edit the .tscn file directly, then verify with godot_node_read's get_scene_tree.

### Actions

#### `update`

Update a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `properties` | Record<string, unknown> | Yes | Properties to set on the node |

#### `reparent`

Move a node to a new parent

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `new_parent_path` | string | Yes | Path to the new parent node |

### Examples

```json
// update
{
  "action": "update",
  "node_path": "/root/Main/Player",
  "properties": {}
}
```

```json
// reparent
{
  "action": "reparent",
  "node_path": "/root/Main/Player",
  "new_parent_path": "/root/UI"
}
```

---

