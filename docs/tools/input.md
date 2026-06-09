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
| `screenshot_at_ms` | integer[] | No | Optional: millisecond offsets (from sequence start) at which to capture a lossless PNG frame DURING the real-time run. The bridge owns the sequence clock, so it grabs each frame at the right moment and returns them with the result — letting you catch transient visuals (muzzle flashes, explosions, kill banners) that fade long before a separate screenshot call could land. Up to 8 frames, each returned as an image labeled with its actual offset. COST: each frame costs vision tokens by RESOLUTION (~width*height/750), independent of format, and persists in context on every following turn — so prefer a few frames at a modest screenshot_max_width over many large ones. For frozen/precise inspection prefer godot_game_time step + screenshot_game instead. |
| `screenshot_max_width` | integer | No | Max width in px for captured frames (default 640). Resolution is the real vision-token lever (cost ~width*height/750 per frame); lower it to spend less context, raise it only when fine detail matters. |
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

