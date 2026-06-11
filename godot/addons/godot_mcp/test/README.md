# godot_mcp addon — on-demand GDScript tests

These are `SceneTree` scripts (TAP-ish output, exit 0 = pass) that validate engine
behaviour the addon relies on. **They are not wired into CI** (CI has no Godot).
Run them on demand against any project that has the addon copied in:

```pwsh
& "<godot.exe>" [--headless] --path "<project-with-addon>" `
    --script "res://addons/godot_mcp/test/<file>.gd"
```

`ObjectDB instances leaked / resources still in use at exit` warnings appear only
when the host project has autoloads — they come from the host, not the tests, and
don't affect the pass/fail result. Run against a minimal project for clean output.

Everything in this directory is stripped from the shipped npm addon
(`server/scripts/copy-addon.ts` drops `test/`), so these are dev-only.

## Mouse-injection spike — retained evidence (godot-mcp #228)

A 2026 research spike asked whether `godot_input` could add comprehensive
mouse/coordinate input. **It was decided no-go** — injection cannot drive the
*polled* mouse cursor on a real window without `warp_mouse` (which hijacks the
developer's physical pointer). The full reasoning, genre support matrix, and
rationale are in **[`docs/design/mouse-input-spike.md`](../../../../docs/design/mouse-input-spike.md)**
(the decision) and **[`docs/design/mouse-injection-spike.md`](../../../../docs/design/mouse-injection-spike.md)**
(the build-oriented writeup).

The spike produced 13 probe scripts. A **keystone subset is retained here** as
runnable evidence for the load-bearing findings; the rest are recorded as findings
in the two docs above rather than kept as files. What remains:

| File | What it proves | Run mode |
|---|---|---|
| `mouse_polled_position_test.gd` | **The keystone.** Headless, injection drives polled `get_mouse_position()`; on a real window it does **not** (the poll reflects the physical OS cursor). The single fact the no-go decision rests on. | both |
| `mouse_unfocused_poll_test.gd` | That keystone is **focus-independent**: even with the game window unfocused (the real MCP topology), injected motion that provably reaches the event path still doesn't move the polled cursor. Rules out "it only bites while focused." | windowed |
| `mouse_transform_completeness_test.gd` | Targeting was never the blocker: `get_final_transform() * C` round-trips to canvas pixel `C` under every stretch config (scale, `content_scale_factor`, `aspect=KEEP` letterbox, `mode=VIEWPORT`). | windowed (headless runs the scale-only subset) |
| `mouse_queue_engine_test.gd` | The per-frame sequencing/lifecycle engine a real bridge needs: exactly one step drains per frame, press and release land on different ordered frames, `process_mode = ALWAYS` keeps draining while paused. Exercises the archived `mcp_input_queue.gd` prototype. | both (one Button check reported windowed only) |

`mcp_input_queue.gd` in this directory is the archived reference engine that
`mouse_queue_engine_test.gd` exercises — a prototype that was never wired into the
bridge (see its header).

### The shipped bug this spike found

One real fix shipped from the investigation (PR #231) and is guarded by a test
that lives here permanently, independent of the mouse decision:

| File | What it guards | Run mode |
|---|---|---|
| `input_sequence_stuck_held_test.gd` | A stuck-held bug in the shipped `MCPGameBridge.execute_input_sequence`: clearing the queue mid-flight dropped already-pressed actions' releases, latching them. Drives the real bridge node; fails pre-fix, passes post-fix. | both |
