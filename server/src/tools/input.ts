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
      .enum(['get_map', 'sequence'])
      .describe('Action: get_map (list available input actions), sequence (execute input timeline)'),
    inputs: z
      .array(InputActionSchema)
      .min(1)
      .optional()
      .describe('Array of inputs to execute (sequence only)'),
  })
  .refine(
    (data) => {
      if (data.action === 'sequence') {
        return data.inputs && data.inputs.length > 0;
      }
      return true;
    },
    { message: 'sequence action requires inputs array with at least one input' }
  );

type InputArgs = z.infer<typeof InputSchema>;

interface InputMapAction {
  name: string;
  events: string[];
}

export const input = defineTool({
  name: 'input',
  description:
    'Inject input into a running Godot game for testing. Use get_map to discover available input actions, then sequence to execute inputs with precise timing. Supports parallel inputs (same start_ms) and sequential choreography (different start_ms values). Note: Mouse/coordinate input not yet supported.',
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
    }
  },
});

export const inputTools = [input] as AnyToolDefinition[];
