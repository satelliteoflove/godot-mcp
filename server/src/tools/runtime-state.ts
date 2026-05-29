import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import type { AnyToolDefinition } from '../core/types.js';

// ── Godot response shapes ────────────────────────────────────────────────────

interface EntitySnapshot {
  path: string;
  type: string;
  groups?: string[];
  pos?: { x: number; y: number } | { x: number; y: number; z: number };
  rot?: number | { x: number; y: number; z: number };
  scale?: { x: number; y: number } | { x: number; y: number; z: number };
  vel?: { x: number; y: number } | { x: number; y: number; z: number };
  angvel?: number | { x: number; y: number; z: number };
  anim?: string;
  anim_pos?: number;
  anim_frame?: number;
  playing?: boolean;
  camera?: boolean;
  zoom?: { x: number; y: number };
  onscreen?: boolean;
  state?: Record<string, unknown>;
}

interface DigestResponse {
  scene: string;
  selection: 'group' | 'method' | 'fallback';
  entity_count: number;
  camera?: EntitySnapshot;
  entities: EntitySnapshot[];
  hint?: string;
}

interface WatchRawSample {
  t_ms: number;
  value: number | string;
}

interface WatchRawResponse {
  window_ms: number;
  sample_count: number;
  fields: Record<string, WatchRawSample[]>;
}

// ── Server-side summarization helpers ───────────────────────────────────────

export interface NumericFieldSummary {
  start: number;
  end: number;
  min: number;
  max: number;
  mean: number;
  slope: number;
  events: Array<{ t_ms: number; from: number; to: number; kind: 'sign_change' | 'zero_cross' }>;
}

export interface StringFieldSummary {
  start: string;
  end: string;
  changes: Array<{ t_ms: number; from: string; to: string }>;
}

export function summarizeNumericField(
  samples: WatchRawSample[],
  windowMs: number
): NumericFieldSummary {
  if (samples.length === 0) {
    return { start: 0, end: 0, min: 0, max: 0, mean: 0, slope: 0, events: [] };
  }

  const values = samples.map((s) => s.value as number);
  const first = values[0];
  const last = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mean = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
  const slope = windowMs > 0 ? Math.round(((last - first) / (windowMs / 1000)) * 100) / 100 : 0;

  const events: NumericFieldSummary['events'] = [];
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1].value as number;
    const curr = samples[i].value as number;
    if (prev === 0 && curr !== 0) {
      events.push({ t_ms: samples[i].t_ms, from: prev, to: curr, kind: 'zero_cross' });
    } else if ((prev < 0 && curr > 0) || (prev > 0 && curr < 0)) {
      events.push({ t_ms: samples[i].t_ms, from: prev, to: curr, kind: 'sign_change' });
    }
  }

  return { start: first, end: last, min, max, mean, slope, events };
}

export function summarizeStringField(samples: WatchRawSample[]): StringFieldSummary {
  if (samples.length === 0) {
    return { start: '', end: '', changes: [] };
  }

  const first = samples[0].value as string;
  const last = samples[samples.length - 1].value as string;
  const changes: StringFieldSummary['changes'] = [];

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1].value as string;
    const curr = samples[i].value as string;
    if (prev !== curr) {
      changes.push({ t_ms: samples[i].t_ms, from: prev, to: curr });
    }
  }

  return { start: first, end: last, changes };
}

function summarizeWatchRaw(raw: WatchRawResponse): Record<string, NumericFieldSummary | StringFieldSummary> {
  const result: Record<string, NumericFieldSummary | StringFieldSummary> = {};
  for (const [key, samples] of Object.entries(raw.fields)) {
    if (samples.length === 0) continue;
    const isNumeric = typeof samples[0].value === 'number';
    result[key] = isNumeric
      ? summarizeNumericField(samples, raw.window_ms)
      : summarizeStringField(samples);
  }
  return result;
}

// ── Schema ───────────────────────────────────────────────────────────────────

const INCLUDE_VALUES = ['transform', 'velocity', 'anim', 'groups', 'onscreen', 'state'] as const;

const RuntimeStateSchema = z.discriminatedUnion('action', [
  z.object({
    action: z
      .literal('digest')
      .describe(
        'Snapshot current game entity state as structured JSON — exact positions, velocities, ' +
        'animation state, and custom game data. Much cheaper than screenshot_game (no vision tokens). ' +
        'Works on any game with no setup; add nodes to the "mcp_watch" group or implement ' +
        '`func _mcp_state() -> Dictionary` on key nodes for richer, targeted data. ' +
        'WHAT TO PUT IN _mcp_state(): include BOTH (1) live runtime values that change during ' +
        'play (cursor position, health, score, fill counts) AND (2) static definition context ' +
        'an agent needs to interpret them — e.g. a puzzle node should expose its clue data, ' +
        'a level node its objective list, a shop its item catalog. Without definition context, ' +
        'an agent can observe state changes but cannot verify correctness. Also include layout ' +
        'geometry for renderable nodes (bounds, sizes, offsets) to enable programmatic layout ' +
        'checks without a screenshot.'
      ),
    select: z
      .enum(['group', 'method', 'auto'])
      .optional()
      .describe(
        'Selection tier: "group" = nodes in mcp_watch group, "method" = nodes with _mcp_state(), ' +
        '"auto" = best available (default: auto picks group → method → visible CanvasItems)'
      ),
    group: z
      .string()
      .optional()
      .describe('Group name to use when select="group" or "auto" (default: "mcp_watch")'),
    name: z.string().optional().describe('Glob filter on node name (e.g. "Player*")'),
    type: z.string().optional().describe('Class filter (e.g. "CharacterBody2D")'),
    max_nodes: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe('Maximum nodes in result (default: 40)'),
    include: z
      .array(z.enum(INCLUDE_VALUES))
      .optional()
      .describe('Subset of fields to include (default: all available)'),
  }),
  z.object({
    action: z
      .literal('watch_start')
      .describe(
        'Start an in-engine sampler that records specified node fields over a time window. ' +
        'Returns immediately; call watch_collect after duration_ms to get the summarized digest. ' +
        'Field keys: "pos.x", "pos.y", "vel.x", "vel.y" for built-in properties; ' +
        'any key from _mcp_state() for custom game state (e.g. "health", "ammo"). ' +
        'TIMING: watch_start and the action that drives state change (godot_input sequence, ' +
        'player input, etc.) must overlap within the watch window. Send both in the same ' +
        'parallel tool call batch, or use a duration_ms large enough (3000–4000ms) to cover ' +
        'the round-trip latency before the driving action is approved and sent. ' +
        'NODE PATHS: if a path in specs cannot be resolved, that spec is silently skipped; ' +
        'check resolved_fields in the response — 0 means all paths were invalid.'
      ),
    specs: z
      .array(
        z.object({
          path: z.string().describe('Full node path (e.g. "/root/Level/Player")'),
          fields: z
            .array(z.string())
            .describe('Field keys to sample (e.g. ["pos.x", "vel.x", "health"])'),
        })
      )
      .describe('Which nodes and fields to watch'),
    hz: z
      .number()
      .int()
      .min(1)
      .max(60)
      .optional()
      .describe('Sample rate in Hz (default: 20)'),
    duration_ms: z
      .number()
      .int()
      .min(100)
      .max(5000)
      .optional()
      .describe('Auto-stop after this many milliseconds (default: 1000)'),
  }),
  z.object({
    action: z
      .literal('watch_collect')
      .describe(
        'Collect the current sampler buffer and return a per-field summary: ' +
        'start/end/min/max/mean/slope for numeric fields; transition events for string fields. ' +
        'Safe to call before auto-stop — returns whatever has been sampled so far.'
      ),
  }),
  z.object({
    action: z
      .literal('watch_stop')
      .describe(
        'Stop the sampler early and return the final per-field summary. ' +
        'Equivalent to watch_collect + stopping the sampler.'
      ),
  }),
]);

type RuntimeStateArgs = z.infer<typeof RuntimeStateSchema>;

// ── Tool definition ──────────────────────────────────────────────────────────

export const runtimeState = defineTool({
  name: 'godot_runtime_state',
  annotations: {
    title: 'Runtime State',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'Observe live game state as structured data. ' +
    'Use digest for a one-shot entity snapshot (replaces most screenshot_game calls). ' +
    'Use watch_start → watch_collect for state-over-time without context blowup.',
  schema: RuntimeStateSchema,

  async execute(args: RuntimeStateArgs, { godot }) {
    switch (args.action) {
      case 'digest': {
        const params: Record<string, unknown> = {};
        if (args.select !== undefined) params.select = args.select;
        if (args.group !== undefined) params.group = args.group;
        if (args.name !== undefined) params.name = args.name;
        if (args.type !== undefined) params.type = args.type;
        if (args.max_nodes !== undefined) params.max_nodes = args.max_nodes;
        if (args.include !== undefined) params.include = args.include;

        const result = await godot.sendCommand<DigestResponse>('get_runtime_state', params);
        return structured(result);
      }

      case 'watch_start': {
        const watchResult = await godot.sendCommand<{ started: boolean; resolved_fields?: number }>('watch_start', {
          specs: args.specs,
          hz: args.hz ?? 20,
          duration_ms: args.duration_ms ?? 1000,
        });
        const base = `Sampler started. Call watch_collect after ~${args.duration_ms ?? 1000}ms to get results.`;
        if ((watchResult.resolved_fields ?? 1) === 0) {
          return base + ' Warning: 0 fields resolved — verify that all node paths in specs exist in the running scene.';
        }
        return `${base} Tracking ${watchResult.resolved_fields} field(s).`;
      }

      case 'watch_collect': {
        const raw = await godot.sendCommand<WatchRawResponse>('watch_collect');
        const fields = summarizeWatchRaw(raw);
        return structured({ window_ms: raw.window_ms, sample_count: raw.sample_count, fields });
      }

      case 'watch_stop': {
        const raw = await godot.sendCommand<WatchRawResponse>('watch_stop');
        const fields = summarizeWatchRaw(raw);
        return structured({ window_ms: raw.window_ms, sample_count: raw.sample_count, fields });
      }
    }
  },
});

export const runtimeStateTools = [runtimeState] as AnyToolDefinition[];
