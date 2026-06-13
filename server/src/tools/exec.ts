import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import { deriveTimeouts, EXEC_BUDGET_CAP_MS } from '../connection/timeouts.js';
import type { AnyToolDefinition } from '../core/types.js';

// Generous for a script, tiny for the transport: the editor websocket moves
// multi-megabyte screenshots, so this cap is about keeping exec calls
// reviewable, not about what the wire can carry.
const EXEC_SOURCE_MAX_CHARS = 16_384;

const EXEC_DEFAULT_BUDGET_MS = 10_000;

const ExecSchema = z.discriminatedUnion('action', [
  z.object({
    action: z
      .literal('run')
      .describe('Run one-shot GDScript inside the running game and return its value'),
    source: z
      .string()
      .min(1)
      .max(EXEC_SOURCE_MAX_CHARS)
      .describe(
        'GDScript statements, compiled as a function body. In scope: every autoload by its own ' +
        'name (e.g. `G.wave = 5`), `tree` (SceneTree), `root` (root Window) — the same context as ' +
        'step_until predicates — plus `holder`, a Node that survives scene reloads: attach nodes ' +
        'under it for behavior that persists between tool calls (a Timer-driven guard, an autofire ' +
        'bot), then manage them with list/remove/clear. Holder children pause with the tree, so a ' +
        'bot armed under a freeze acts only after thaw/step. Use an explicit `return` to get a ' +
        'value back (there is no implicit return): primitives (bool/int/float/String) come back ' +
        'intact; any other type (Array/Dictionary/Object/Vector2) comes back as a str() preview ' +
        'TRUNCATED to 200 chars — return JSON.stringify(...) yourself when you need structure. ' +
        'print() output is not returned — use return values (or, when the minimal-godot-mcp ' +
        'companion server is installed, its get_console_output). Function bodies cannot declare top-level func/class — use lambdas ' +
        'for callbacks, or build a sub-script with GDScript.new() and set_script() it onto a ' +
        'holder child for _process-driven behavior. No `await` (synchronous-only; compose with ' +
        'godot_game_time to wait). A runtime error or failed assert() breaks the game into the ' +
        'editor debugger mid-call; the relay auto-resumes it and the error comes back in ' +
        'runtime_errors (any debugger break in the call window is resumed, including a breakpoint ' +
        'hit by unrelated game code).'
      ),
    budget_ms: z
      .number()
      .int()
      .min(1)
      .max(EXEC_BUDGET_CAP_MS)
      .optional()
      .describe(
        `Wall-clock patience for the call, used to size the timeout cascade (default ${EXEC_DEFAULT_BUDGET_MS}, ` +
        `max ${EXEC_BUDGET_CAP_MS}). NOT enforcement: a synchronous script cannot be preempted, so an ` +
        'infinite loop hangs the game past any budget — recover with godot_editor_edit stop.'
      ),
  }),
  z.object({
    action: z
      .literal('list')
      .describe('List the nodes currently attached under the exec holder (name, class, age, processing state)'),
  }),
  z.object({
    action: z.literal('remove').describe('Remove one exec holder child by name (queue_free)'),
    name: z.string().min(1).describe('Node name as reported by list'),
  }),
  z.object({
    action: z.literal('clear').describe('Remove every exec holder child (queue_free all)'),
  }),
]);

type ExecArgs = z.infer<typeof ExecSchema>;

interface ExecRunResult {
  completed: boolean;
  result: unknown;
  duration_ms: number;
  holder_children: number;
  // Error lines the game logged during the call (a runtime error aborts the
  // script but the call still completes — the editor relay auto-resumes the
  // debugger break a script error triggers). Window is process-wide, so a
  // concurrent game error can ride along.
  runtime_errors?: string[];
}

export const exec = defineTool({
  name: 'godot_exec',
  annotations: { title: 'Game Script Execution', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  description:
    'Execute GDScript inside the RUNNING game process — the scenario-setup primitive: grant ' +
    'weapons, skip waves, spawn entities, arm persistent test bots, without baking debug hooks ' +
    'into game code. Errors when no game is running. For launch-time setup, compose: ' +
    'godot_editor_edit run frozen=true -> godot_exec run (mutate state, attach bots under `holder`) -> ' +
    'godot_game_time thaw. A static denylist rejects accidental process/file-write escape ' +
    '(OS.execute, DirAccess, write-mode FileAccess, ResourceSaver, ProjectSettings.save, ...) and ' +
    'names the offending token — an accident guard, NOT a security boundary. Compile errors ' +
    'reject the call with the parser message; runtime errors come back in runtime_errors with the ' +
    'call still completing.',
  schema: ExecSchema,
  async execute(args: ExecArgs, { godot }) {
    switch (args.action) {
      case 'run': {
        // Same cascade class as game_time (no bridge-ready wait), but no
        // wall_budget_ms is pushed: the bridge cannot abort a synchronous
        // script mid-flight, and pretending it enforces a wall would be
        // dishonest. The stagger still holds — the relay and this socket
        // simply wait budget-long before declaring the script hung.
        const t = deriveTimeouts(args.budget_ms ?? EXEC_DEFAULT_BUDGET_MS);
        const result = await godot.sendCommand<ExecRunResult>(
          'exec_run',
          { source: args.source, relay_timeout_ms: t.relayMs },
          { timeoutMs: t.serverMs }
        );
        return structured(result);
      }

      case 'list': {
        const result = await godot.sendCommand<{
          nodes: Array<{ name: string; class: string; script_chars: number; age_ms: number; processing: boolean }>;
          count: number;
        }>('exec_list');
        // Structured in both branches: a result whose SHAPE depends on runtime
        // data would make the empty case unparseable for structured readers.
        return structured(result);
      }

      case 'remove': {
        const result = await godot.sendCommand<{ removed: boolean; name: string; remaining: number }>(
          'exec_remove',
          { name: args.name }
        );
        return structured(result);
      }

      case 'clear': {
        const result = await godot.sendCommand<{ removed_count: number }>('exec_clear');
        return `Removed ${result.removed_count} exec node(s).`;
      }
    }
  },
});

export const execTools = [exec] as AnyToolDefinition[];
