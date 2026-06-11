# Node Tools

Node manipulation and script attachment tools

## Tools

- [godot_node](#godot_node)

---

## godot_node

Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts, connect signals

### Actions

#### `get_properties`

Get a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

#### `find`

Find nodes by name and/or type

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name_pattern` | string | No | Glob pattern to match node names, e.g. "*Spawner*", "Turret?" |
| `type` | string | No | Filter by node type, e.g. "CharacterBody2D", "Area2D" |
| `root_path` | string | No | Path to start search from (defaults to scene root) |

#### `create`

Create a node, or instantiate a scene as a node

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent_path` | string | Yes | Path to the parent node |
| `node_name` | string | Yes | Name for the new node |
| `node_type` | string | No | Type of node to create, e.g. "Sprite2D" (use this OR scene_path) |
| `scene_path` | string | No | Path to scene to instantiate, e.g. "res://enemies/goblin.tscn" (use this OR node_type) |
| `properties` | Record<string, unknown> | No | Properties to set on the node |

#### `update`

Update a node's properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `properties` | Record<string, unknown> | No | Properties to set on the node |

#### `delete`

Delete a node

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

#### `reparent`

Move a node to a new parent

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `new_parent_path` | string | Yes | Path to the new parent node |

#### `attach_script`

Attach a script to a node

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `script_path` | string | Yes | Path to the script file |

#### `detach_script`

Detach a node's script

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

#### `connect_signal`

Connect a signal to a target method

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node emitting the signal |
| `signal_name` | string | Yes | Name of the signal, e.g. "pressed", "body_entered" |
| `target_path` | string | Yes | Path to the target node that will receive the signal |
| `method_name` | string | Yes | Name of the method to call on the target node |

### Examples

```json
// get_properties
{
  "action": "get_properties",
  "node_path": "/root/Main/Player"
}
```

```json
// find
{
  "action": "find",
  "name_pattern": "*Enemy*"
}
```

```json
// create
{
  "action": "create",
  "parent_path": "/root/Main",
  "node_name": "NewNode",
  "node_type": "Sprite2D"
}
```

*6 more actions available: `update`, `delete`, `reparent`, `attach_script`, `detach_script`, `connect_signal`*

---

