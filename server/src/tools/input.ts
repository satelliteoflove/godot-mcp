import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { deriveTimeouts, INPUT_BUDGET_CAP_MS } from '../connection/timeouts.js';
import { staleAdvisory, type ProjectStaleness } from './project-staleness.js';
import type { AnyToolDefinition, ToolResult } from '../core/types.js';

const TimingFields = {
  start_ms: z.number().int().min(0).optional().default(0).describe('When to start the input (milliseconds from sequence start)'),
  duration_ms: z.number().int().min(0).optional().default(0).describe('How long to hold the input (0 = instant tap; axes return to 0 at the end)'),
};
const DeviceField = z
  .number()
  .int()
  .min(0)
  .optional()
  .default(0)
  .describe('Joypad device id (default 0). InputMap bindings use device -1 (all devices) by default, which any id matches.');

export const JOY_BUTTON_NAMES = [
  'a', 'b', 'x', 'y', 'back', 'guide', 'start', 'left_stick', 'right_stick',
  'left_shoulder', 'right_shoulder', 'dpad_up', 'dpad_down', 'dpad_left', 'dpad_right',
  'misc1', 'paddle1', 'paddle2', 'paddle3', 'paddle4', 'touchpad',
] as const;
export const JOY_AXIS_NAMES = ['left_x', 'left_y', 'right_x', 'right_y', 'trigger_left', 'trigger_right'] as const;

// The four input-entry shapes are discriminated by WHICH KEY is present
// (action_name / joy_button / axis / stick), so strictObject is load-bearing:
// a stripping z.object would silently match a mixed entry like
// {action_name, axis, value} to the action branch and drop the axis intent.
const ActionEntrySchema = z.strictObject({
  action_name: z.string().describe('The input action name from the project Input Map'),
  strength: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe(
      'Analog press strength (default 1.0). Drives Input.get_action_strength/get_vector even for ' +
      'actions with no joypad bindings, but BYPASSES the InputMap deadzone — use an axis entry when ' +
      'real deadzone behavior matters.'
    ),
  ...TimingFields,
});
const JoyButtonEntrySchema = z.strictObject({
  joy_button: z
    .union([z.enum(JOY_BUTTON_NAMES), z.number().int().min(0).max(20)])
    .describe('Joypad button by Godot JoyButton name (e.g. "a", "right_shoulder", "dpad_up") or raw index. Drives bound actions, raw _input handlers, and polled Input.is_joy_button_pressed.'),
  device: DeviceField,
  ...TimingFields,
});
const AxisEntrySchema = z
  .strictObject({
    axis: z
      .enum(JOY_AXIS_NAMES)
      .describe('Joypad axis by Godot JoyAxis name. Sticks range -1..1 and rest at 0; triggers range 0..1 and rest at 0.'),
    value: z
      .number()
      .min(-1)
      .max(1)
      .describe('Axis value held for duration_ms, then returned to 0. Drives axis-bound actions with REAL InputMap deadzone math, raw _input handlers, and polled Input.get_joy_axis.'),
    device: DeviceField,
    ...TimingFields,
  })
  .superRefine((e, ctx) => {
    if (e.axis.startsWith('trigger') && e.value < 0) {
      ctx.addIssue({ code: 'custom', message: `trigger axes range 0..1; got ${e.value}` });
    }
  });
const StickEntrySchema = z.strictObject({
  stick: z
    .enum(['left', 'right'])
    .describe('Stick vector shorthand: compiles into a paired _x/_y axis hold with the same timing.'),
  x: z.number().min(-1).max(1).describe('Stick x deflection: -1 = left, +1 = right.'),
  y: z
    .number()
    .min(-1)
    .max(1)
    .describe('Stick y deflection in Godot joypad convention: -1 = UP, +1 = down. Aim 30 degrees above horizontal-right = {x: 0.866, y: -0.5}; half-tilt right = {x: 0.5, y: 0}.'),
  device: DeviceField,
  ...TimingFields,
});

export const InputEntrySchema = z.union(
  [ActionEntrySchema, JoyButtonEntrySchema, AxisEntrySchema, StickEntrySchema],
  {
    // z.union reports a bare "Invalid input" for every structural miss; the
    // entries are key-discriminated, so name the four valid shapes to make the
    // most common authoring mistakes (missing value, typo'd key, no
    // discriminator) actionable.
    error: () =>
      'each input entry must be one of: {action_name, strength?}, {joy_button, device?}, ' +
      '{axis, value, device?}, or {stick, x, y, device?} (all with optional start_ms/duration_ms)',
  }
);
export type InputEntry = z.infer<typeof InputEntrySchema>;

// Compile schema entries into the wire vocabulary the game bridge consumes
// (action | joy_button | axis): stick sugar becomes a paired axis hold.
export function compileInputEntries(inputs: InputEntry[]): Record<string, unknown>[] {
  const wire: Record<string, unknown>[] = [];
  for (const e of inputs) {
    if ('stick' in e) {
      const base = { device: e.device ?? 0, start_ms: e.start_ms ?? 0, duration_ms: e.duration_ms ?? 0 };
      wire.push({ axis: `${e.stick}_x`, value: e.x, ...base });
      wire.push({ axis: `${e.stick}_y`, value: e.y, ...base });
    } else {
      wire.push(e);
    }
  }
  return wire;
}

// Short human label for one entry, for the result summary line.
export function entryLabel(e: InputEntry): string {
  if ('action_name' in e) return e.strength !== undefined ? `${e.action_name}@${e.strength}` : e.action_name;
  if ('joy_button' in e) return `joy:${e.joy_button}`;
  if ('axis' in e) return `${e.axis}=${e.value}`;
  return `${e.stick}_stick(${e.x},${e.y})`;
}

// Version-skew detection (#233, same honesty pattern as the watch timeline):
// an old bridge silently `continue`s entries without action_name (dropping
// joypad entries) and ignores the new `strength` field on action entries
// (injecting at 1.0) — both while the call "succeeds". A new bridge always
// echoes input_kinds; its ABSENCE when the request used either new capability
// means the running addon predates controller injection.
export function joypadSkewWarning(
  inputs: InputEntry[],
  inputKinds: Record<string, number> | undefined
): string | undefined {
  const usesNewCaps = inputs.some(
    (e) => !('action_name' in e) || ('strength' in e && e.strength !== undefined)
  );
  if (usesNewCaps && inputKinds === undefined) {
    return (
      'WARNING: joypad/axis entries or analog action strength were IGNORED — the running addon ' +
      'predates controller injection. Update the godot-mcp addon and restart the Godot editor.'
    );
  }
  return undefined;
}

const InputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('get_map').describe('List available input actions from the project Input Map'),
  }),
  z.object({
    action: z.literal('sequence').describe('Execute an input timeline'),
    inputs: z
      .array(InputEntrySchema)
      .min(1)
      .describe(
        'Array of inputs to execute. Each entry is one of: a named ACTION (action_name, optional ' +
        'analog strength), a joypad BUTTON (joy_button), an analog AXIS hold (axis + value), or a ' +
        'STICK vector (stick + x/y) — mix freely on one timeline. Joypad events drive bound actions ' +
        '(with real deadzone math), raw _input handlers, and the polled Input singletons ' +
        '(get_joy_axis / is_joy_button_pressed); no physical pad is needed. Limitation: ' +
        'Input.get_connected_joypads() never reports a virtual pad, so games that gate controller ' +
        'mode on pad DETECTION cannot be switched into it.'
      ),
    report: z
      .array(z.string())
      .optional()
      .describe(
        'Optional effect probe: GDScript expressions evaluated once before the first input and ' +
        'again after the last, to prove the inputs actually changed something (vs. falling into ' +
        'the void — player dead, UI focus elsewhere, wrong action). Reference autoloads by name ' +
        '(e.g. "G.shots", "G.wave") plus `tree`/`root` (e.g. ' +
        '"tree.get_nodes_in_group(\'enemies\').size()"), same context as godot_game_time step_until. ' +
        'Each expression returns {before, after, changed}; the result also carries any_changed. ' +
        'Expressions do NOT short-circuit and a parse/eval error rejects the call. The after-reading ' +
        'is sampled a couple frames past the final input, so only near-immediate effects register — ' +
        'for slower effects use godot_game_time or runtime_state watch.'
      ),
    screenshot_at_ms: z
      .array(z.number().int().min(0))
      .max(8)
      .optional()
      .describe(
        'Optional: millisecond offsets (from sequence start) at which to capture a lossless PNG ' +
        'frame DURING the real-time run. The bridge owns the sequence clock, so it grabs each frame ' +
        'at the right moment and returns them with the result — letting you catch transient visuals ' +
        '(muzzle flashes, explosions, kill banners) that fade long before a separate screenshot ' +
        'call could land. Up to 8 frames, each returned as an image labeled with its actual offset; ' +
        `an offset (like the whole sequence) must fall within the ${INPUT_BUDGET_CAP_MS}ms single-call window. ` +
        'COST: each frame costs vision tokens by RESOLUTION (~width*height/750), independent of ' +
        'format, and persists in context on every following turn — so prefer a few frames at a ' +
        'modest screenshot_max_width over many large ones. For frozen/precise inspection prefer ' +
        'godot_game_time step + screenshot_game instead.'
      ),
    screenshot_max_width: z
      .number()
      .int()
      .min(16)
      .max(1920)
      .optional()
      .describe(
        'Max width in px for captured frames (default 640). Resolution is the real vision-token ' +
        'lever (cost ~width*height/750 per frame); lower it to spend less context, raise it only ' +
        'when fine detail matters.'
      ),
  }),
  z.object({
    action: z.literal('type_text').describe('Type text into the focused UI element'),
    text: z
      .string()
      .min(1)
      .describe('Text to type'),
    delay_ms: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(50)
      .describe('Delay between keystrokes in milliseconds (default 50)'),
    submit: z
      .boolean()
      .optional()
      .default(false)
      .describe('Press Enter after typing to submit (for LineEdit text_submitted)'),
  }),
]);

type InputArgs = z.infer<typeof InputSchema>;

interface InputMapAction {
  name: string;
  events: string[];
}

export const input = defineTool({
  name: 'godot_input',
  annotations: { title: 'Input Injection', readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  description:
    'Inject input into a running Godot game for testing: named actions (with analog strength), joypad buttons, analog axes, and stick vectors. Use get_map to discover available input actions and their bindings, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: mouse/coordinate input is not supported (see docs/design/mouse-input-spike.md).',
  schema: InputSchema,
  async execute(args: InputArgs, { godot }) {
    switch (args.action) {
      case 'get_map': {
        const result = await godot.sendCommand<{
          actions: InputMapAction[];
          source: string;
          // Editor-sourced maps carry this when project.godot's [input] section was
          // edited on disk after load (#245), so the map below may be incomplete.
          // The game-sourced path reads fresh from the bridge and never sets it.
          staleness?: ProjectStaleness;
        }>('get_input_map');
        const advisory = staleAdvisory(result.staleness);

        if (result.actions.length === 0) {
          const base = 'No custom input actions defined. Games should define actions in Project Settings > Input Map.';
          return advisory ? `${base}\n${advisory}` : base;
        }

        const lines = [`Input actions (source: ${result.source}):`];
        for (const action of result.actions) {
          const events = action.events.length > 0 ? action.events.join(', ') : 'no bindings';
          lines.push(`  ${action.name}: ${events}`);
        }
        if (advisory) lines.push(advisory);
        return lines.join('\n');
      }

      case 'sequence': {
        const inputs = args.inputs!;

        // Size the timeout cascade from how long the sequence actually runs:
        // the last input's end, or a later capture offset. The bridge-ready
        // wait precedes this call, so it is folded into the budget (readyWait).
        const lastInputEnd = inputs.reduce((m, i) => Math.max(m, (i.start_ms ?? 0) + (i.duration_ms ?? 0)), 0);
        const lastShot = (args.screenshot_at_ms ?? []).reduce((m, o) => Math.max(m, o), 0);
        const budget = Math.max(lastInputEnd, lastShot);
        const cap = INPUT_BUDGET_CAP_MS;
        if (budget > cap) {
          throw new Error(
            `Input sequence spans ${budget}ms but a single call can cover at most ${cap}ms ` +
            `(the transport ceiling). Split it into multiple sequences, or use godot_game_time to drive a longer window.`
          );
        }
        const t = deriveTimeouts(budget, { readyWait: true });

        const result = await godot.sendCommand<{
          completed: boolean;
          actions_executed: number;
          scene?: string;
          tree_paused?: boolean;
          frozen?: boolean;
          gameplay_ms?: number;
          wall_ms?: number;
          report?: Record<string, { before: unknown; after: unknown; changed: boolean }>;
          any_changed?: boolean;
          captures?: Array<{
            requested_ms: number;
            actual_ms: number;
            ok: boolean;
            image_base64: string;
            width: number;
            height: number;
            error: string;
          }>;
          input_kinds?: Record<string, number>;
          error?: string;
        }>('execute_input_sequence', {
          inputs: compileInputEntries(inputs),
          report: args.report,
          screenshot_at_ms: args.screenshot_at_ms,
          screenshot_max_width: args.screenshot_max_width,
          // The bridge's sequence path has no wall guard (the editor relay is its
          // effective deadline), so only the relay budget is pushed; sizing the
          // server socket from it is enough. wall_budget_ms is a step-only concept.
          relay_timeout_ms: t.relayMs,
        }, { timeoutMs: t.serverMs });

        if (result.error) {
          throw new Error(result.error);
        }

        const totalDuration = Math.max(...inputs.map((i) => (i.start_ms ?? 0) + (i.duration_ms ?? 0)));
        const labels = [...new Set(inputs.map(entryLabel))].join(', ');

        const lines = [
          `Input sequence completed: ${result.actions_executed} input(s) executed [${labels}] over ${totalDuration}ms.`,
        ];

        const skew = joypadSkewWarning(inputs, result.input_kinds);
        if (skew) lines.push(skew);

        // Always-on context: a sequence that ran under a pause/freeze advanced no
        // gameplay, so its inputs almost certainly did nothing — surface that
        // without the caller having to ask.
        const ctx: string[] = [];
        if (result.scene !== undefined) ctx.push(`scene ${result.scene || '(none)'}`);
        if (result.gameplay_ms !== undefined && result.wall_ms !== undefined) {
          ctx.push(`gameplay ${result.gameplay_ms}ms / wall ${result.wall_ms}ms`);
        }
        if (ctx.length > 0) lines.push(`Context: ${ctx.join(', ')}.`);
        if (result.tree_paused) {
          lines.push(
            `WARNING: the scene tree was PAUSED at completion${result.frozen ? ' (godot_game_time freeze active)' : ''} — ` +
            `gameplay did not advance, so these inputs likely had no effect. Thaw/unpause first, or drive a paused ` +
            `tree with godot_game_time step inputs.`
          );
        }

        // Effect probe (#240): the headline "did it do anything" signal.
        if (result.report) {
          lines.push('Effect probe (before -> after):');
          for (const [expr, d] of Object.entries(result.report)) {
            const tag = d.changed ? 'changed' : 'no change';
            lines.push(`  ${expr}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}  (${tag})`);
          }
          if (result.any_changed === false) {
            lines.push(
              'No probed expression changed — the inputs may have had no effect (player dead/disabled, ' +
              'UI focus elsewhere, wrong action, or the effect is slower than the probe window).'
            );
          }
        }

        // Mid-sequence frame captures (#239): if none were requested, keep the
        // plain-text result; otherwise return a summary plus one labeled image
        // block per captured frame (a failed capture becomes a note, not an image).
        if (!result.captures || result.captures.length === 0) {
          return lines.join('\n');
        }

        const ok = result.captures.filter((c) => c.ok);
        lines.push(
          `Captured ${ok.length}/${result.captures.length} frame(s) at offsets ` +
          `[${result.captures.map((c) => c.actual_ms).join(', ')}]ms ` +
          `(requested [${result.captures.map((c) => c.requested_ms).join(', ')}]ms).`
        );

        const content: ToolResult[] = [{ type: 'text', text: lines.join('\n') }];
        for (const c of result.captures) {
          if (c.ok && c.image_base64) {
            content.push({ type: 'text', text: `Frame @${c.actual_ms}ms (requested ${c.requested_ms}ms), ${c.width}x${c.height}:` });
            content.push({ type: 'image', data: c.image_base64, mimeType: 'image/png' });
          } else {
            content.push({ type: 'text', text: `Frame @${c.requested_ms}ms: capture failed (${c.error || 'unknown error'}).` });
          }
        }
        return content;
      }

      case 'type_text': {
        // Keystrokes are spaced by delay_ms; size the timeout from the total
        // span (and the bridge-ready wait that precedes typing) so a long type
        // can't hit the quick default and get killed mid-stream.
        const budget = args.text.length * (args.delay_ms ?? 50);
        const cap = INPUT_BUDGET_CAP_MS;
        if (budget > cap) {
          throw new Error(
            `Typing ${args.text.length} chars at ${args.delay_ms ?? 50}ms each spans ${budget}ms, over the ` +
            `${cap}ms single-call ceiling. Type in smaller chunks or lower delay_ms.`
          );
        }
        const t = deriveTimeouts(budget, { readyWait: true });

        const result = await godot.sendCommand<{
          completed: boolean;
          chars_typed: number;
          submitted: boolean;
          error?: string;
        }>('type_text', { text: args.text, delay_ms: args.delay_ms, submit: args.submit, relay_timeout_ms: t.relayMs }, { timeoutMs: t.serverMs });

        if (result.error) {
          throw new Error(result.error);
        }

        const submitMsg = result.submitted ? ' and submitted' : '';
        return `Typed ${result.chars_typed} character(s)${submitMsg}`;
      }
    }
  },
});

export const inputTools = [input] as AnyToolDefinition[];
