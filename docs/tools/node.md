# Node Tools

Node manipulation and script attachment tools

## Tools

- [godot_node](#godot_node)

---

## godot_node

Inspect and modify scene nodes in the editor: read effective properties (including class defaults a .tscn read cannot show), view the full scene tree, find nodes, update properties, and reparent (the editor rewrites child paths and signal connections correctly; hand-editing .tscn for a reparent does not). To add or remove nodes, or attach scripts and connect signals, edit the .tscn file directly, then verify with get_scene_tree.

### Actions

#### `get_properties`

Get a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

#### `get_scene_tree`

Full hierarchy of the open scene as the editor sees it, including children inside instanced sub-scenes (a .tscn file read cannot show those)

*No parameters.*

#### `find`

Find nodes by name and/or type

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name_pattern` | string | No | Glob pattern to match node names, e.g. "*Spawner*", "Turret?" |
| `type` | string | No | Filter by node type, e.g. "CharacterBody2D", "Area2D" |
| `root_path` | string | No | Path to start search from (defaults to scene root) |

#### `update`

Update a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `properties` | Record<string, unknown> | No | Properties to set on the node |

#### `reparent`

Move a node to a new parent

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `new_parent_path` | string | Yes | Path to the new parent node |

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

*2 more actions available: `update`, `reparent`*

---

