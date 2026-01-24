# Input Tools

Input injection for testing running games (action-based, no mouse/coordinates yet)

## Tools

- [input](#input)

---

## input

Inject input into a running Godot game for testing. Use get_map to discover available input actions, then sequence to execute inputs with precise timing. Supports parallel inputs (same start_ms) and sequential choreography (different start_ms values). Note: Mouse/coordinate input not yet supported.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_map`, `sequence` | Yes | Action: get_map (list available input actions), sequence (execute input timeline) |
| `inputs` | object[] | sequence | Array of inputs to execute |

### Actions

#### `get_map`

#### `sequence`

Parameters: `inputs`*

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

---

