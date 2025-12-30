# Node Tools

Node manipulation and script attachment tools

## Tools

- [node](#node)

---

## node

Manage scene nodes: get properties, find, create, update, delete, reparent, attach/detach scripts

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_properties`, `find`, `create`, `update`, `delete`, `reparent`, `attach_script`, `detach_script` | Yes | Action: get_properties, find, create, update, delete, reparent, attach_script, detach_script |
| `node_path` | string | get_properties, update, delete, reparent, attach_script, detach_script | Path to the node |
| `name_pattern` | string | find | Glob pattern to match node names, e.g. "*Spawner*", "Turret?" |
| `type` | string | find | Filter by node type, e.g. "CharacterBody2D", "Area2D" |
| `root_path` | string | No | Path to start search from (find only, defaults to scene root) |
| `parent_path` | string | create | Path to the parent node |
| `node_type` | string | No | Type of node to create, e.g. "Sprite2D" (create only, use this OR scene_path) |
| `scene_path` | string | No | Path to scene to instantiate, e.g. "res://enemies/goblin.tscn" (create only, use this OR node_type) |
| `node_name` | string | create | Name for the new node |
| `properties` | Record<string, unknown> | create, update | Properties to set |
| `new_parent_path` | string | reparent | Path to the new parent node |
| `script_path` | string | attach_script | Path to the script file |

### Actions

#### `get_properties`

Parameters: `node_path`*

#### `find`

Parameters: `name_pattern`*, `type`*

#### `create`

Parameters: `parent_path`*, `node_name`*, `properties`

#### `update`

Parameters: `node_path`*, `properties`

#### `delete`

Parameters: `node_path`*

#### `reparent`

Parameters: `node_path`*, `new_parent_path`*

#### `attach_script`

Parameters: `node_path`*, `script_path`*

#### `detach_script`

Parameters: `node_path`*

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
  "name_pattern": "*Enemy*",
  "type": "CharacterBody2D",
  "root_path": "/root/Main"
}
```

```json
// create
{
  "action": "create",
  "parent_path": "/root/Main",
  "node_type": "Sprite2D",
  "node_name": "NewNode"
}
```

*5 more actions available: `update`, `delete`, `reparent`, `attach_script`, `detach_script`*

---

