# Game Script Execution Tools

Run GDScript inside the running game for test scenario setup: one-shot state mutations plus persistent holder-managed nodes, behind a denylist accident guard.

## Tools

- [godot_exec](#godot_exec)

---

## godot_exec

Execute GDScript inside the RUNNING game process — the scenario-setup primitive: grant weapons, skip waves, spawn entities, arm persistent test bots, without baking debug hooks into game code. Errors when no game is running. For launch-time setup, compose: godot_editor run frozen=true -> godot_exec run (mutate state, attach bots under `holder`) -> godot_game_time thaw. A static denylist rejects accidental process/file-write escape (OS.execute, DirAccess, write-mode FileAccess, ResourceSaver, ProjectSettings.save, ...) and names the offending token — an accident guard, NOT a security boundary. Compile errors reject the call with the parser message; runtime errors come back in runtime_errors with the call still completing.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `run`, `list`, `remove`, `clear` | Yes |  |
| `source` | string | No | GDScript statements, compiled as a function body. In scope: every autoload by its own name (e.g. `G.wave = 5`), `tree` (SceneTree), `root` (root Window) — the same context as step_until predicates — plus `holder`, a Node that survives scene reloads: attach nodes under it for behavior that persists between tool calls (a Timer-driven guard, an autofire bot), then manage them with list/remove/clear. Holder children pause with the tree, so a bot armed under a freeze acts only after thaw/step. Use an explicit `return` to get a value back (there is no implicit return): primitives (bool/int/float/String) come back intact; any other type (Array/Dictionary/Object/Vector2) comes back as a str() preview TRUNCATED to 200 chars — return JSON.stringify(...) yourself when you need structure. print() output is not returned — use return values, or minimal-godot-mcp get_console_output. Function bodies cannot declare top-level func/class — use lambdas for callbacks, or build a sub-script with GDScript.new() and set_script() it onto a holder child for _process-driven behavior. No `await` (synchronous-only; compose with godot_game_time to wait). A runtime error or failed assert() breaks the game into the editor debugger mid-call; the relay auto-resumes it and the error comes back in runtime_errors (any debugger break in the call window is resumed, including a breakpoint hit by unrelated game code). |
| `budget_ms` | integer | No | Wall-clock patience for the call, used to size the timeout cascade (default 10000, max 30000). NOT enforcement: a synchronous script cannot be preempted, so an infinite loop hangs the game past any budget — recover with godot_editor stop. |
| `name` | string | No | Node name as reported by list |

### Actions

#### `run`

#### `list`

#### `remove`

#### `clear`

### Examples

```json
// run
{
  "action": "run"
}
```

```json
// list
{
  "action": "list"
}
```

```json
// remove
{
  "action": "remove"
}
```

*1 more actions available: `clear`*

---

