# Script Tools

GDScript management tools

## Tools

- [get_script](#get_script)
- [create_script](#create_script)
- [edit_script](#edit_script)
- [attach_script](#attach_script)
- [detach_script](#detach_script)

---

## get_script

Get the content of a GDScript file

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `script_path` | string | Yes | Path to the script file (e.g., "res://scripts/player.gd") |

---

## create_script

Create a new GDScript file

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `script_path` | string | Yes | Path for the new script (e.g., "res://scripts/enemy.gd") |
| `content` | string | Yes | Content of the script |
| `attach_to` | string | No | Optional node path to attach the script to |

---

## edit_script

Replace the content of an existing GDScript file

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `script_path` | string | Yes | Path to the script file |
| `content` | string | Yes | New content for the script |

---

## attach_script

Attach an existing script to a node

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |
| `script_path` | string | Yes | Path to the script file |

---

## detach_script

Remove the script from a node

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node |

---

