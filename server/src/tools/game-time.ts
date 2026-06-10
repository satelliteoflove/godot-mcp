import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import { deriveTimeouts, STEP_BUDGET_CAP_MS } from '../connection/timeouts.js';
import { InputEntrySchema, compileInputEntries, inputSkewWarning } from './input.js';
import type { AnyToolDefinition } from '../core/types.js';

// Published cap on game time advanced in one call. The server sizes its socket
// timeout from this budget and pushes the derived relay/wall budgets down to
// the bridge (see timeouts.ts / mcp_game_bridge.gd), so the cap is a real
// capability bound now, not a transport artifact.
const STEP_MAX_MS = STEP_BUDGET_CAP_MS;
const STEP_MAX_FRAMES = 1200;
// step_until's max_ms is a safety net, not an expectation, so its default is
// kept modest and decoupled from the cap: a forgotten or wrong predicate gives
// up in ~20s, while an explicit max_ms unlocks the full window up to STEP_MAX_MS.
const STEP_DEFAULT_MS = 20000;

// Game-time budget (ms) this call advances at most, used to size the timeout
// cascade. frames are converted at 60 fps (their wall cost at normal speed).
function stepBudgetMs(args: GameTimeArgs): number {
  if (args.action === 'step') {
    if (args.duration_ms !== undefined) return args.duration_ms;
    return Math.ceil(((args.frames ?? 0) * 1000) / 60);
  }
  if (args.action === 'step_until') {
    return args.max_ms ?? STEP_DEFAULT_MS;
  }
  return STEP_DEFAULT_MS; // not reached: only step/step_until size a budget
}

const GameTimeSchema = z
  .discriminatedUnion('action', [
    z.object({
      action: z
        .literal('freeze')
        .describe('Pause the game under agent control. All observation tools (screenshots, runtime state, find_nodes) keep working while frozen — take as long as you need.'),
    }),
    z.object({
      action: z
        .literal('step')
        .describe('Advance a bounded slice of game time, then re-freeze. Freezes first if the game is running, so step is always a safe first call.'),
      duration_ms: z
        .number()
        .int()
        .min(1)
        .max(STEP_MAX_MS)
        .optional()
        .describe(`Game time to advance in milliseconds (max ${STEP_MAX_MS}; loop steps for longer). Scaled by Engine.time_scale like normal play.`),
      frames: z
        .number()
        .int()
        .min(1)
        .max(STEP_MAX_FRAMES)
        .optional()
        .describe(`Frames to advance instead of a duration (max ${STEP_MAX_FRAMES}). frames: 1 is a single-frame advance.`),
      inputs: z
        .array(InputEntrySchema)
        .optional()
        .describe('Input timeline executed inside the window; start_ms is game time from window start. Entries share the godot_input sequence vocabulary: named actions (with analog strength), joypad buttons, axis holds, stick vectors, raw keys (with modifier combos), and relative mouse-look (look: [dx, dy], delivered as InputEventMouseMotion.relative inside the frozen step — the FPS-camera testing path). Inputs must ride inside the step — events injected while frozen miss their is_action_just_pressed edge. Holds are always released by window end.'),
    }),
    z.object({
      action: z
        .literal('step_until')
        .describe('Advance game time until a GDScript predicate becomes true (or a safety cap is hit), then re-freeze. Freezes first if the game is running, so it is a safe first call. Use this instead of step when you do not know how long to advance to reach the state worth observing.'),
      until: z
        .string()
        .min(1)
        .describe('A GDScript boolean expression, re-evaluated against the running game every frame; stepping stops the frame it is truthy. Autoloads are in scope by name (e.g. `G.wave > 1`, `GameState.tick_count % 12 == 11`), plus `tree` (the SceneTree) and `root` (the root Window) for tree queries (e.g. `tree.get_nodes_in_group("enemies").size() >= 1`). Must parse and evaluate without error against the current state or the call is rejected up front. Expressions do NOT short-circuit (`and`/`or` evaluate both operands), so to read a node that may not exist yet, do not guard with `arr.size() > 0 and arr[0].x` — sequence two calls instead: step_until the node exists (`tree.get_nodes_in_group("boss").size() >= 1`), then step_until reading it (`tree.get_nodes_in_group("boss")[0].state == 4`).'),
      max_ms: z
        .number()
        .int()
        .min(1)
        .max(STEP_MAX_MS)
        .optional()
        .describe(`Safety cap on game time to advance while waiting (max ${STEP_MAX_MS}, default ${STEP_DEFAULT_MS}). If the predicate never holds within this budget (or the wall-clock budget), the call returns with predicate_met: false instead of hanging.`),
      report: z
        .array(z.string().min(1))
        .optional()
        .describe('Optional GDScript expressions (same scope as `until`) evaluated when stepping stops and returned as a { expression: value } map — e.g. ["G.wave", "tree.get_nodes_in_group(\\"enemies\\").size()"]. Use this to read the state you care about in the same call instead of a separate observation round-trip. Each must parse and evaluate without error up front.'),
      inputs: z
        .array(InputEntrySchema)
        .optional()
        .describe('Optional input timeline driven inside the window, exactly like step (same vocabulary: actions, joypad buttons, axes, stick vectors, raw keys, relative mouse-look look:[dx,dy] — e.g. hold a stick deflection while waiting for an enemy to appear). Holds are released by window end.'),
    }),
    z.object({
      action: z
        .literal('thaw')
        .describe('Resume real-time play, restoring the game\'s own pause state (an open pause menu stays open).'),
    }),
    z.object({
      action: z
        .literal('status')
        .describe('Report the freeze state: `frozen` is authoritative for the current state; `frozen_wall_ms` is real wall-clock held (not game time); `launched_frozen` is a historical flag (this run booted frozen) and stays true after thaw. Also reports the game\'s own pause intent, time scale, and whether game code is contesting the freeze.'),
    }),
  ])
  // Constraint a discriminated union can't express on its own, so it lives here:
  .refine((data) => (data.action === 'step' ? (data.duration_ms !== undefined) !== (data.frames !== undefined) : true), {
    message: 'step requires exactly one of duration_ms or frames',
  });

type GameTimeArgs = z.infer<typeof GameTimeSchema>;

interface StepResult {
  completed: boolean;
  frozen: boolean;
  elapsed_ms: number;
  gameplay_ms: number;
  frames: number;
  physics_ticks: number;
  game_paused: boolean;
  events_fired?: number;
  forced_releases?: number;
  events_dropped?: number;
  pause_transitions?: Array<{ at_ms: number; paused: boolean }>;
  wall_budget_exceeded?: boolean;
  input_kinds?: Record<string, number>;
  // step_until only:
  predicate_met?: boolean;
  report?: Record<string, unknown>;
  predicate_error?: string;
}

export const gameTime = defineTool({
  name: 'godot_game_time',
  annotations: { title: 'Game Time Control', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Make game time answer to your clock instead of racing ahead between tool calls: freeze the running game, observe it at leisure (screenshots and state digests work while frozen), then step forward a bounded slice of game time (step) — or until a condition you specify holds (step_until) — with inputs riding inside the window. The game\'s own pause menu is layered correctly: freezing over it, stepping under it, and thawing back to it all preserve the game\'s pause intent.',
  schema: GameTimeSchema,
  async execute(args: GameTimeArgs, { godot }) {
    switch (args.action) {
      case 'freeze': {
        const result = await godot.sendCommand<{
          frozen: boolean;
          was_frozen: boolean;
          game_paused: boolean;
        }>('game_time_freeze');
        const note = result.was_frozen ? ' (was already frozen)' : '';
        const paused = result.game_paused ? ' Game\'s own pause menu is open; step will not advance gameplay until it is dismissed.' : '';
        return `Frozen${note}. Game time is stopped; observe freely, then step or thaw.${paused}`;
      }

      case 'step': {
        const t = deriveTimeouts(stepBudgetMs(args));
        const result = await godot.sendCommand<StepResult>('game_time_step', {
          duration_ms: args.duration_ms,
          frames: args.frames,
          inputs: compileInputEntries(args.inputs ?? []),
          relay_timeout_ms: t.relayMs,
          wall_budget_ms: t.bridgeWallMs,
        }, { timeoutMs: t.serverMs });
        // Stable shape, matching the runtime-state watch precedent (#198):
        // `warnings` is always an array so callers can read it unconditionally.
        const skew = inputSkewWarning(args.inputs ?? [], result.input_kinds);
        return structured({ ...result, warnings: skew ? [skew] : [] });
      }

      case 'step_until': {
        const t = deriveTimeouts(stepBudgetMs(args));
        const result = await godot.sendCommand<StepResult>('game_time_step_until', {
          until: args.until,
          max_ms: args.max_ms ?? STEP_DEFAULT_MS,
          report: args.report,
          inputs: compileInputEntries(args.inputs ?? []),
          relay_timeout_ms: t.relayMs,
          wall_budget_ms: t.bridgeWallMs,
        }, { timeoutMs: t.serverMs });
        const skew = inputSkewWarning(args.inputs ?? [], result.input_kinds);
        return structured({ ...result, warnings: skew ? [skew] : [] });
      }

      case 'thaw': {
        const result = await godot.sendCommand<{
          frozen: boolean;
          was_frozen: boolean;
          game_paused: boolean;
          frozen_wall_ms?: number;
        }>('game_time_thaw');
        if (!result.was_frozen) {
          return 'Was not frozen; game continues in real time.';
        }
        const pausedNote = result.game_paused ? ' (game\'s own pause menu still open)' : '';
        return `Thawed after ${result.frozen_wall_ms}ms (wall-clock) frozen. Real-time play resumed${pausedNote}.`;
      }

      case 'status': {
        const result = await godot.sendCommand<Record<string, unknown>>('game_time_status');
        return structured(result);
      }
    }
  },
});

export const gameTimeTools = [gameTime] as AnyToolDefinition[];
