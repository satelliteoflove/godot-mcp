# godot-mcp evals

Realistic agent tasks run through headless Claude Code (`claude -p`) against a
real Godot project, scored on the tool calls the agent actually made. Unit
tests can't validate what this server exists for — multi-step agent workflows —
so this harness is the quality bar above them: it measures whether an agent
given a plain-language task reaches for the right tools, in a sensible order,
without wasted calls or validation errors.

## Safety

**This harness never starts Godot.** The preflight probes whether the bridge
addon is already listening (`127.0.0.1:6550` by default; `GODOT_HOST` /
`GODOT_PORT` to override) and exits with instructions if it is not. You open
the editor; the harness only talks to it.

Tasks marked `requires_game` instruct the *agent* to run the project inside
the editor you opened (via `godot_editor_edit run`). Skip them with
`--skip-game` when that is not acceptable — for example when you are working
in that editor yourself.

The editor serves one godot-mcp client at a time, so close other MCP sessions
(an interactive Claude Code session, for instance) before running evals, or
the eval server will queue behind them.

## Running

```bash
npm run build                 # the harness runs the built dist/cli.js
npm run eval -- --project ~/Documents/Godot/<project>

# One task only
npm run eval -- --project ~/Documents/Godot/<project> --task animation-authoring

# Without the game-running tasks
npm run eval -- --project ~/Documents/Godot/<project> --skip-game
```

Requires the `claude` CLI on PATH and an authenticated session (or
`ANTHROPIC_API_KEY`). Each task is a real agent run and costs real tokens; the
per-task cost is printed and totaled. This is deliberately not wired into CI.

## Scoring

Each task in `tasks.json` declares:

- `required_calls` — `tool` or `tool.action` entries that must each appear at
  least once in the transcript.
- `forbidden_calls` — entries that must never appear (e.g. the agent should
  not reach for `godot_exec` to read a property).

A task passes when every required call happened and no forbidden call did.
The transcript (every tool call with its action, errors, token usage, cost,
turns) lands in `evals/results/<task>.json` for inspection.

## Feeding results back

The methodology is Anthropic's: run realistic tasks, look at where the agent
hesitated, picked the wrong tool, or burned calls on validation errors, then
fix the *tool descriptions and schemas* — not the prompt — and re-run. The
`animation-authoring` task is also the standing gate for any future decision
about removing the animation authoring actions: removal is only on the table
if agents complete equivalent work via file edits as reliably.

## Adding tasks

Add an entry to `tasks.json`. Keep prompts project-agnostic (they run against
any of the live-linked test projects), state the verification step in the
prompt, and have the task clean up anything it creates.
