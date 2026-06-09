import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const InputActionSchema = z.object({
  action_name: z.string().describe('The input action name from the project Input Map'),
  start_ms: z.number().int().min(0).optional().default(0).describe('When to start the input (milliseconds from sequence start)'),
  duration_ms: z.number().int().min(0).optional().default(0).describe('How long to hold the input (0 = instant tap)'),
});

const InputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('get_map').describe('List available input actions from the project Input Map'),
  }),
  z.object({
    action: z.literal('sequence').describe('Execute an input timeline'),
    inputs: z
      .array(InputActionSchema)
      .min(1)
      .describe('Array of inputs to execute'),
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
    'Inject input into a running Godot game for testing. Use get_map to discover available input actions, sequence to execute inputs with precise timing (optionally with an effect probe that proves the inputs changed game state), or type_text to type into UI elements. Note: Mouse/coordinate input not yet supported.',
  schema: InputSchema,
  async execute(args: InputArgs, { godot }) {
    switch (args.action) {
      case 'get_map': {
        const result = await godot.sendCommand<{
          actions: InputMapAction[];
          source: string;
        }>('get_input_map');

        if (result.actions.length === 0) {
          return 'No custom input actions defined. Games should define actions in Project Settings > Input Map.';
        }

        const lines = [`Input actions (source: ${result.source}):`];
        for (const action of result.actions) {
          const events = action.events.length > 0 ? action.events.join(', ') : 'no bindings';
          lines.push(`  ${action.name}: ${events}`);
        }
        return lines.join('\n');
      }

      case 'sequence': {
        const inputs = args.inputs!;
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
          error?: string;
        }>('execute_input_sequence', { inputs, report: args.report });

        if (result.error) {
          throw new Error(result.error);
        }

        const totalDuration = Math.max(...inputs.map((i) => (i.start_ms ?? 0) + (i.duration_ms ?? 0)));
        const actionNames = [...new Set(inputs.map((i) => i.action_name))].join(', ');

        const lines = [
          `Input sequence completed: ${result.actions_executed} action(s) executed [${actionNames}] over ${totalDuration}ms.`,
        ];

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

        return lines.join('\n');
      }

      case 'type_text': {
        const result = await godot.sendCommand<{
          completed: boolean;
          chars_typed: number;
          submitted: boolean;
          error?: string;
        }>('type_text', { text: args.text, delay_ms: args.delay_ms, submit: args.submit });

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
