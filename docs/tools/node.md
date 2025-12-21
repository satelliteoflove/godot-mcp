# Node Tools

Node manipulation tools

## Tools

- [get_node_properties](#get_node_properties)
- [create_node](#create_node)
- [update_node](#update_node)
- [delete_node](#delete_node)
- [reparent_node](#reparent_node)

---

## get_node_properties

Get all properties of a node at the specified path

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node (e.g., "/root/Main/Player") |

---

## create_node

Create a new node as a child of an existing node

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `parent_path` | string | Yes | Path to the parent node |
| `node_type` | string | Yes | Type of node to create (e.g., "Sprite2D", "CharacterBody2D") |
| `node_name` | string | Yes | Name for the new node |
| `properties` | object | No | Optional properties to set on the node |

---

## update_node

Update properties of an existing node

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node to update |
| `properties` | object | Yes | Properties to update (key-value pairs) |

---

## delete_node

Delete a node from the scene

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node to delete |

---

## reparent_node

Move a node to a new parent

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the node to move |
| `new_parent_path` | string | Yes | Path to the new parent node |

---

