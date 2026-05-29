# Input Tools

Input injection for testing running games (action-based, no mouse/coordinates yet)

## Tools

- [godot_input](#godot_input)

---

## godot_input

Inject input into a running Godot game for testing. Use get_map to discover available input actions, sequence to execute inputs with precise timing, or type_text to type into UI elements. Note: Mouse/coordinate input not yet supported.

### Actions

#### `get_map`

*No parameters.*

#### `sequence`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `inputs` | object[] | Yes | Array of inputs to execute |

#### `type_text`

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to type |
| `delay_ms` | integer | Yes | Delay between keystrokes in milliseconds (default 50) |
| `submit` | boolean | Yes | Press Enter after typing to submit (for LineEdit text_submitted) |

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

