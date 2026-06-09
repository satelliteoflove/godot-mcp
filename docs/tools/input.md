# Input Tools

Input injection for testing running games (action-based, no mouse/coordinates yet)

## Tools

- [godot_input](#godot_input)

---

## godot_input

Inject input into a running Godot game for testing. Use get_map to discover available input actions, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: Mouse/coordinate input not yet supported.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_map`, `sequence`, `type_text` | Yes |  |
| `inputs` | object[] | No | Array of inputs to execute |
| `report` | string[] | No | Optional effect probe: GDScript expressions evaluated once before the first input and again after the last, to prove the inputs actually changed something (vs. falling into the void — player dead, UI focus elsewhere, wrong action). Reference autoloads by name (e.g. "G.shots", "G.wave") plus `tree`/`root` (e.g. "tree.get_nodes_in_group('enemies').size()"), same context as godot_game_time step_until. Each expression returns {before, after, changed}; the result also carries any_changed. Expressions do NOT short-circuit and a parse/eval error rejects the call. The after-reading is sampled a couple frames past the final input, so only near-immediate effects register — for slower effects use godot_game_time or runtime_state watch. |
| `text` | string | No | Text to type |
| `delay_ms` | integer | No | Delay between keystrokes in milliseconds (default 50) |
| `submit` | boolean | No | Press Enter after typing to submit (for LineEdit text_submitted) |

### Actions

#### `get_map`

#### `sequence`

#### `type_text`

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
  "action": "sequence"
}
```

```json
// type_text
{
  "action": "type_text"
}
```

---

