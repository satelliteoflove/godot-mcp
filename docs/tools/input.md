# Input Tools

Input injection for testing running games: named actions, joypad buttons, analog axes and stick vectors, raw keyboard keys with modifier combos, and text typing (no mouse/coordinate input)

## Tools

- [godot_input](#godot_input)

---

## godot_input

Inject input into a running Godot game for testing: named actions (with analog strength), joypad buttons, analog axes, stick vectors, and raw keyboard keys (with modifier combos). Use get_map to discover available input actions and their bindings, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: mouse/coordinate input is not supported (see docs/design/mouse-input-spike.md).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get_map`, `sequence`, `type_text` | Yes |  |
| `inputs` | array | No | Array of inputs to execute. Each entry is one of: a named ACTION (action_name, optional analog strength), a joypad BUTTON (joy_button), an analog AXIS hold (axis + value), a STICK vector (stick + x/y), or a raw KEY (key, e.g. "ctrl+s") — mix freely on one timeline. Joypad events drive bound actions (with real deadzone math), raw _input handlers, and the polled Input singletons (get_joy_axis / is_joy_button_pressed); key events likewise drive bound actions, _input/_unhandled_input, and Input.is_key_pressed. No physical pad or keyboard is needed. Limitation: Input.get_connected_joypads() never reports a virtual pad, so games that gate controller mode on pad DETECTION cannot be switched into it. |
| `report` | string[] | No | Optional effect probe: GDScript expressions evaluated once before the first input and again after the last, to prove the inputs actually changed something (vs. falling into the void — player dead, UI focus elsewhere, wrong action). Reference autoloads by name (e.g. "G.shots", "G.wave") plus `tree`/`root` (e.g. "tree.get_nodes_in_group('enemies').size()"), same context as godot_game_time step_until. Each expression returns {before, after, changed}; the result also carries any_changed. Expressions do NOT short-circuit and a parse/eval error rejects the call. The after-reading is sampled a couple frames past the final input, so only near-immediate effects register — for slower effects use godot_game_time or runtime_state watch. |
| `screenshot_at_ms` | integer[] | No | Optional: millisecond offsets (from sequence start) at which to capture a lossless PNG frame DURING the real-time run. The bridge owns the sequence clock, so it grabs each frame at the right moment and returns them with the result — letting you catch transient visuals (muzzle flashes, explosions, kill banners) that fade long before a separate screenshot call could land. Up to 8 frames, each returned as an image labeled with its actual offset; an offset (like the whole sequence) must fall within the 40000ms single-call window. COST: each frame costs vision tokens by RESOLUTION (~width*height/750), independent of format, and persists in context on every following turn — so prefer a few frames at a modest screenshot_max_width over many large ones. For frozen/precise inspection prefer godot_game_time step + screenshot_game instead. |
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

