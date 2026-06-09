# Setting Up Claude Code for Godot Development

Add a `CLAUDE.md` file to your Godot project root so Claude Code knows when to use MCP tools vs direct file editing.

While you're setting up, add [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp) to your MCP config alongside godot-mcp. The two are complementary: godot-mcp handles editor, scene, and runtime control; minimal-godot-mcp handles static GDScript diagnostics (LSP) and the running game's console output, with no addon. See [Works Well With](../README.md#works-well-with).

## Recommended CLAUDE.md Template

```markdown
# CLAUDE.md

## Godot MCP

This project uses godot-mcp for AI-assisted development.

### When to Use MCP Tools vs File Editing

**Use MCP tools for:**
- Runtime interaction: running/stopping the game, screenshots, debug output, input injection
- Inspecting or modifying nodes, scenes, animations, tilemaps, and GridMaps (complex formats that are easy to break by hand)
- Querying editor state, selection, project settings, 3D spatial data
- Fetching Godot documentation
- Inspecting resources like SpriteFrames, TileSets, and Materials

**Use direct file editing for:**
- GDScript (.gd) and shader (.gdshader) files - plain text, safe to edit directly
- Simple scene modifications when you know the exact structure
- Project settings (project.godot) when you know the key names

### Testing the Running Game

- **Make game time answer to your clock.** For anything timing-sensitive, prefer `godot_game_time` (freeze, observe, then `step` / `step_until`) over blind fixed-duration input. While frozen, screenshots and state digests still work; an `inputs` timeline rides inside the stepped window, and `step_until`'s `report` reads the state you care about in the same call.
- **Verify effects from state, not screenshots.** Read outcomes with `godot_runtime_state` `digest` - include autoload paths (`/root/...`) for global score/wave/cash. Use screenshots for layout and visual quality, not for "did it work?".
- **Keep full-speed input self-contained.** If you drive the game in real time with `godot_input` `sequence`, put the run-starting menu press and the gameplay inputs in ONE sequence - input split across two tool calls has seconds of game time between the halves.
- **Check the editor log after every change.** `godot_editor` `get_log_messages` with `severity: "error"` answers "did my edit break the editor?"; pass a prior `cursor` back as `since` to read only what is new. It is editor-side only - for errors from the running game, use the companion server's game console.
- **Respect pause hygiene.** Gameplay state must not advance while paused (a correct pause menu already requires this - gameplay `get_tree().create_timer()` should pass `false` for its `process_always` argument). Cosmetic, audio, and juice systems under `PROCESS_MODE_ALWAYS` are meant to run during pause - do not "fix" them.

### Companion Server

This project also uses [minimal-godot-mcp](https://github.com/ryanmazzolini/minimal-godot-mcp). Use it for static GDScript diagnostics (LSP) and the running game's console output and stderr; use godot-mcp for editor and scene control, runtime state, input injection, and editor-side errors.
```

Adjust to fit your project. The model already has access to tool descriptions and will figure out workflows on its own - this template just covers the non-obvious stuff.

## Testing a Running Game

Driving a game through an agent is not like driving it by hand: tens of seconds of model
latency can pass between two tool calls, and the game keeps running the whole time. Most
testing mistakes trace back to that gap. The rules in the template above reduce to one idea -
make the game observable on *your* clock, and verify from data rather than pixels (see
[Exposing Game State](#exposing-game-state) below for making that data rich).

### Let game time wait for you

`godot_game_time` is the main lever. `freeze` stops game time while leaving every observation
tool live, so you can screenshot and digest at leisure; `step` advances a bounded slice (a
duration or a frame count) and re-freezes; `step_until` advances until a GDScript predicate
holds, then re-freezes; `thaw` hands the game back to real-time play when you are done. An
`inputs` timeline runs *inside* the stepped window - events
injected while the game is frozen would miss their `is_action_just_pressed` edge, so they
have to ride the step. Prefer this over guessing a fixed `duration_ms` for anything
timing-sensitive: a wait that depends on the game's clock should be expressed against the
game's clock, not your wall clock.

`step_until`'s `report` (a list of GDScript expressions read at the stop frame) folds the
follow-up observation into the same call. One gotcha: predicate and report expressions do
**not** short-circuit - `and` / `or` evaluate both operands - so you cannot guard a
maybe-absent node with `arr.size() > 0 and arr[0].state == 4`. Sequence two calls instead:
`step_until` the node exists (`tree.get_nodes_in_group("boss").size() >= 1`), then `step_until`
the thing you actually wanted to read.

### Two error channels, not one

`godot_editor` `get_log_messages` reports the *editor* process - @tool script errors, import
and addon failures, and anything an editor-side mutation broke. Errors from the *running game*
never appear there. Run it (filtered to `severity: "error"`) after every edit to confirm you
did not break the editor; read game-side runtime errors through the companion server's game
console. Game runtime spam is invisible in screenshots, so a check that only looks at the
picture will miss it - a per-frame runtime error can fire for an entire session unnoticed.

### Pause hygiene without overreach

Freeze-based testing leans on Godot's pause semantics being correct, which is the same bar a
shipped pause menu sets: gameplay state should not advance while paused. That is established
Godot practice, not a new constraint - and it is the *only* constraint here. Cosmetic, audio,
and juice systems that legitimately run during pause (`PROCESS_MODE_ALWAYS` music, a
real-clock hitstop manager) are working as intended. Do not "fix" them to satisfy a test;
that breaks the game to please the harness.

## Exposing Game State

To let agents read live game state as structured data (instead of inferring it from
screenshots), tag the entities that matter into the `mcp_watch` group and optionally
implement `func _mcp_state() -> Dictionary` on them. See the
[Runtime State Guide](runtime-state-guide.md) for the conventions, the `_mcp_state()`
contract, and examples.
