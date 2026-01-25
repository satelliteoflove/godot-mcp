# Input Tools

Input injection for testing running games (action-based, no mouse/coordinates yet)

## Tools

- [input](#input)

---

## input

Inject input into a running Godot game for testing. Use get_map to discover available input actions, sequence to execute inputs with precise timing, or type_text to type into UI elements. Note: Mouse/coordinate input not yet supported.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_map`, `sequence`, `type_text` | Yes | Action: get_map (list available input actions), sequence (execute input timeline), type_text (type text into focused UI element) |
| `inputs` | object[] | sequence | Array of inputs to execute |
| `text` | string | type_text | Text to type |
| `delay_ms` | integer | No | Delay between keystrokes in milliseconds (type_text only, default 50) |
| `submit` | boolean | No | Press Enter after typing to submit (type_text only, for LineEdit text_submitted) |

### Actions

#### `get_map`

#### `sequence`

Parameters: `inputs`*

#### `type_text`

Parameters: `text`*

### Examples

```json
// get_map
{
  "action": "get_map"
}
```

```json
// sequence
{
  "action": "sequence",
  "inputs": []
}
```

```json
// type_text
{
  "action": "type_text",
  "text": "example",
  "delay_ms": null,
  "submit": false
}
```

---

