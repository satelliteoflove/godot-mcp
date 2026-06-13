# Game Time Control Tools

Deterministic game-clock control: freeze the running game, step a bounded slice of game time (or step until a condition holds) with inputs riding inside the window, then thaw — so observation is not racing ahead between tool calls.

## Tools

- [godot_game_time](#godot_game_time)

---

## godot_game_time

Make game time answer to your clock instead of racing ahead between tool calls: freeze the running game, observe it at leisure (screenshots and state digests work while frozen), then step forward a bounded slice of game time (step) — or until a condition you specify holds (step_until) — with inputs riding inside the window. The game's own pause menu is layered correctly: freezing over it, stepping under it, and thawing back to it all preserve the game's pause intent.

### Actions

#### `freeze`

Pause the game under agent control. All observation tools (screenshots, runtime state, godot_node_read find) keep working while frozen — take as long as you need.

*No parameters.*

#### `step`

Advance a bounded slice of game time, then re-freeze. Freezes first if the game is running, so step is always a safe first call. Pass exactly one of duration_ms or frames.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `duration_ms` | integer | No | Game time to advance in milliseconds (max 50000; loop steps for longer). Scaled by Engine.time_scale like normal play. Mutually exclusive with frames. |
| `frames` | integer | No | Frames to advance instead of a duration (max 1200). frames: 1 is a single-frame advance. Mutually exclusive with duration_ms. |
| `inputs` | array | No | Input timeline executed inside the window; start_ms is game time from window start. Entries share the godot_input sequence vocabulary: named actions (with analog strength), joypad buttons, axis holds, stick vectors, raw keys (with modifier combos), and relative mouse-look (look: [dx, dy], delivered as InputEventMouseMotion.relative inside the frozen step — the FPS-camera testing path). Inputs must ride inside the step — events injected while frozen miss their is_action_just_pressed edge. Holds are always released by window end. |

#### `step_until`

Advance game time until a GDScript predicate becomes true (or a safety cap is hit), then re-freeze. Freezes first if the game is running, so it is a safe first call. Use this instead of step when you do not know how long to advance to reach the state worth observing.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `until` | string | Yes | A GDScript boolean expression, re-evaluated against the running game every frame; stepping stops the frame it is truthy. Autoloads are in scope by name (e.g. `G.wave > 1`, `GameState.tick_count % 12 == 11`), plus `tree` (the SceneTree) and `root` (the root Window) for tree queries (e.g. `tree.get_nodes_in_group("enemies").size() >= 1`). Must parse and evaluate without error against the current state or the call is rejected up front. Expressions do NOT short-circuit (`and`/`or` evaluate both operands), so to read a node that may not exist yet, do not guard with `arr.size() > 0 and arr[0].x` — sequence two calls instead: step_until the node exists (`tree.get_nodes_in_group("boss").size() >= 1`), then step_until reading it (`tree.get_nodes_in_group("boss")[0].state == 4`). |
| `max_ms` | integer | No | Safety cap on game time to advance while waiting (max 50000, default 20000). If the predicate never holds within this budget (or the wall-clock budget), the call returns with predicate_met: false instead of hanging. |
| `report` | string[] | No | Optional GDScript expressions (same scope as `until`) evaluated when stepping stops and returned as a { expression: value } map — e.g. ["G.wave", "tree.get_nodes_in_group(\"enemies\").size()"]. Use this to read the state you care about in the same call instead of a separate observation round-trip. Each must parse and evaluate without error up front. |
| `inputs` | array | No | Optional input timeline driven inside the window, exactly like step (same vocabulary: actions, joypad buttons, axes, stick vectors, raw keys, relative mouse-look look:[dx,dy] — e.g. hold a stick deflection while waiting for an enemy to appear). Holds are released by window end. |

#### `thaw`

Resume real-time play, restoring the game's own pause state (an open pause menu stays open).

*No parameters.*

#### `status`

Report the freeze state: `frozen` is authoritative for the current state; `frozen_wall_ms` is real wall-clock held (not game time); `launched_frozen` is a historical flag (this run booted frozen) and stays true after thaw. Also reports the game's own pause intent, time scale, and whether game code is contesting the freeze.

*No parameters.*

### Examples

```json
// freeze
{
  "action": "freeze"
}
```

```json
// step
{
  "action": "step",
  "duration_ms": 1
}
```

```json
// step_until
{
  "action": "step_until",
  "until": "example"
}
```

*2 more actions available: `thaw`, `status`*

---

