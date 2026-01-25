import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const InputActionSchema = z.object({
  action_name: z.string().describe('The input action name from the project Input Map'),
  start_ms: z.number().int().min(0).optional().default(0).describe('When to start the input (milliseconds from sequence start)'),
  duration_ms: z.number().int().min(0).optional().default(0).describe('How long to hold the input (0 = instant tap)'),
});

const InputSchema = z
  .object({
    action: z
      .enum(['get_map', 'sequence', 'type_text'])
      .describe('Action: get_map (list available input actions), sequence (execute input timeline), type_text (type text into focused UI element)'),
    inputs: z
      .array(InputActionSchema)
      .min(1)
      .optional()
      .describe('Array of inputs to execute (sequence only)'),
    text: z
      .string()
      .min(1)
      .optional()
      .describe('Text to type (type_text only)'),
    delay_ms: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(50)
      .describe('Delay between keystrokes in milliseconds (type_text only, default 50)'),
    submit: z
      .boolean()
      .optional()
      .default(false)
      .describe('Press Enter after typing to submit (type_text only, for LineEdit text_submitted)'),
  })
  .refine(
    (data) => {
      if (data.action === 'sequence') {
        return data.inputs && data.inputs.length > 0;
      }
      if (data.action === 'type_text') {
        return data.text && data.text.length > 0;
      }
      return true;
    },
    { message: 'sequence requires inputs array; type_text requires text string' }
  );

type InputArgs = z.infer<typeof InputSchema>;

interface InputMapAction {
  name: string;
  events: string[];
}

export const input = defineTool({
  name: 'input',
  description:
    'Inject input into a running Godot game for testing. Use get_map to discover available input actions, sequence to execute inputs with precise timing, or type_text to type into UI elements. Note: Mouse/coordinate input not yet supported.',
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
          error?: string;
        }>('execute_input_sequence', { inputs });

        if (result.error) {
          throw new Error(result.error);
        }

        const totalDuration = Math.max(...inputs.map((i) => (i.start_ms ?? 0) + (i.duration_ms ?? 0)));
        const actionNames = [...new Set(inputs.map((i) => i.action_name))].join(', ');

        return `Input sequence completed: ${result.actions_executed} action(s) executed [${actionNames}] over ${totalDuration}ms`;
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
