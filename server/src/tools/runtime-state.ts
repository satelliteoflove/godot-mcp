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
  unresolved_paths?: string[];
  available_autoloads?: string[];
}

interface WatchRawSample {
  t_ms: number;
  value: number | string;
}

interface WatchRawEvent {
  t_ms: number;
  source: string;
  signal: string;
  args?: string;
}

interface WatchRawResponse {
  window_ms: number;
  sample_count: number;
  fields: Record<string, WatchRawSample[]>;
  // Absent from pre-timeline addon versions.
  events?: WatchRawEvent[];
  events_truncated?: boolean;
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

export type TimelineEntry =
  | { t_ms: number; kind: 'signal'; source: string; name: string; args?: string }
  | { t_ms: number; kind: 'anim_transition'; source: string; from: string; to: string }
  | { t_ms: number; kind: 'field_change'; source: string; field: string; from: string; to: string };

const TIMELINE_KIND_RANK: Record<TimelineEntry['kind'], number> = {
  // PRESENTATION order for same-t_ms entries, not chronology: cross-kind order
  // at a tie is unknowable (signal t_ms is emission time, sampled t_ms is
  // detection time — the change may have happened earlier). Any fixed choice
  // is fine; what matters is determinism.
  signal: 0,
  anim_transition: 1,
  field_change: 2,
};

export function buildTimeline(
  events: WatchRawEvent[],
  fields: Record<string, NumericFieldSummary | StringFieldSummary>
): TimelineEntry[] {
  const timeline: TimelineEntry[] = [];

  for (const e of events) {
    timeline.push({
      t_ms: e.t_ms,
      kind: 'signal',
      source: e.source,
      name: e.signal,
      ...(e.args !== undefined && { args: e.args }),
    });
  }

  for (const [key, summary] of Object.entries(fields)) {
    if (!('changes' in summary)) continue; // numeric events stay per-field only
    // full_key is node_path + ":" + field_key; lastIndexOf guards colons in paths.
    const sep = key.lastIndexOf(':');
    const source = sep >= 0 ? key.slice(0, sep) : key;
    const field = sep >= 0 ? key.slice(sep + 1) : key;
    for (const change of summary.changes) {
      timeline.push(
        field === 'anim'
          ? { t_ms: change.t_ms, kind: 'anim_transition', source, from: change.from, to: change.to }
          : { t_ms: change.t_ms, kind: 'field_change', source, field, from: change.from, to: change.to }
      );
    }
  }

  // No further tiebreakers on purpose: sort() is spec-stable (ES2019), so
  // same-t_ms same-kind entries keep buffer order — which for signals IS
  // emission order, real information a name/source tiebreak would destroy
  // (sub-ms bursts land on one t_ms).
  timeline.sort((a, b) => {
    if (a.t_ms !== b.t_ms) return a.t_ms - b.t_ms;
    return TIMELINE_KIND_RANK[a.kind] - TIMELINE_KIND_RANK[b.kind];
  });

  return timeline;
}

function summarizeWatchResponse(raw: WatchRawResponse) {
  const fields = summarizeWatchRaw(raw);
  return structured({
    window_ms: raw.window_ms,
    sample_count: raw.sample_count,
    fields,
    // Always present (empty array included) so the shape is stable for
    // structured readers; `?? []` degrades gracefully against older addons.
    timeline: buildTimeline(raw.events ?? [], fields),
    timeline_truncated: raw.events_truncated ?? false,
  });
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
      .enum(['group', 'method', 'auto', 'none'])
      .optional()
      .describe(
        'Selection tier: "group" = nodes in mcp_watch group, "method" = nodes with _mcp_state(), ' +
        '"auto" = best available (default: auto picks group → method → a visibility fallback that ' +
        'surfaces visible 2D nodes (CanvasItems) AND 3D world nodes — meshes, gridmaps, cameras, ' +
        'lights, physics bodies and areas), "none" = no automatic selection; return only the nodes named in paths'
      ),
    group: z
      .string()
      .optional()
      .describe('Group name to use when select="group" or "auto" (default: "mcp_watch")'),
    paths: z
      .array(z.string())
      .optional()
      .describe(
        'Explicit absolute node paths to include in addition to tier selection, e.g. ' +
        '["/root/GameState"]. The digest walks the current scene only, so autoload ' +
        'singletons — where global game state often lives (cash, score, settings) — are ' +
        'otherwise unreachable. Each path returns _mcp_state() if present, else a snapshot ' +
        'of the node\'s script variables (scalars/arrays, ~1 KB cap). Paths that do not ' +
        'resolve are returned in unresolved_paths.'
      ),
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
      .optional()
      .describe('Which nodes and fields to watch. Optional when signals is provided.'),
    signals: z
      .array(
        z.object({
          path: z
            .string()
            .min(1)
            .describe('Node path; absolute /root/... paths reach autoloads (e.g. "/root/G")'),
          signal: z
            .string()
            .min(1)
            .describe('Signal name on that node — script or built-in (e.g. "body_entered")'),
        })
      )
      .max(16)
      .optional()
      .describe(
        'Signals to record as discrete timeline events during the window. Each emission is ' +
        'buffered as {t_ms, source, signal, args} (max 200 events/window, then truncated with a ' +
        'flag; args stringified to ~100 chars). watch_collect merges these with string-field ' +
        'transitions into a time-sorted `timeline`. Signals with more than 5 parameters are ' +
        'skipped and reported in unresolved_signals, as are bad paths/names. Connections stay ' +
        'live until duration_ms elapses or watch_stop. Signals must be emitted on the main ' +
        'thread (worker-thread emissions are unsupported). At least one of specs/signals is ' +
        'required.'
      ),
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
  }).refine((v) => (v.specs?.length ?? 0) > 0 || (v.signals?.length ?? 0) > 0, {
    message: 'watch_start requires at least one of specs or signals',
  }),
  z.object({
    action: z
      .literal('watch_collect')
      .describe(
        'Collect the current sampler buffer and return a per-field summary ' +
        '(start/end/min/max/mean/slope for numeric fields; transition events for string fields) ' +
        'plus a time-sorted `timeline` merging watched signal emissions with string-field ' +
        'transitions (kinds: signal, anim_transition, field_change). TIMESTAMPS: signal t_ms is ' +
        'emission time (ms resolution); anim/field t_ms is DETECTION time at the sample rate — ' +
        'the change happened up to one sample interval earlier, so do not infer cross-kind ' +
        'ordering from nearby timestamps. ' +
        'Safe to call before auto-stop — returns whatever has been recorded so far; ' +
        'signal connections stay live until the window ends.'
      ),
  }),
  z.object({
    action: z
      .literal('watch_stop')
      .describe(
        'Stop the sampler early (disconnecting watched signals) and return the final ' +
        'per-field summary and merged `timeline`. Equivalent to watch_collect + stopping the sampler.'
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
        if (args.paths !== undefined) params.paths = args.paths;
        if (args.name !== undefined) params.name = args.name;
        if (args.type !== undefined) params.type = args.type;
        if (args.max_nodes !== undefined) params.max_nodes = args.max_nodes;
        if (args.include !== undefined) params.include = args.include;

        const result = await godot.sendCommand<DigestResponse>('get_runtime_state', params);
        return structured(result);
      }

      case 'watch_start': {
        const watchResult = await godot.sendCommand<{
          started: boolean;
          resolved_fields?: number;
          connected_signals?: number;
          unresolved_signals?: Array<{ path: string; signal: string; reason: string }>;
        }>('watch_start', {
          specs: args.specs ?? [],
          hz: args.hz ?? 20,
          duration_ms: args.duration_ms ?? 1000,
          signals: args.signals ?? [],
        });
        const wantFields = (args.specs?.length ?? 0) > 0;
        const requestedSignals = args.signals?.length ?? 0;
        const unresolved = watchResult.unresolved_signals ?? [];
        const warnings: string[] = [];
        if (wantFields && (watchResult.resolved_fields ?? 0) === 0) {
          warnings.push('0 fields resolved — verify that all node paths in specs exist in the running scene.');
        }
        if (requestedSignals > 0) {
          // Version-skew detection: without it, dropped signal specs read as
          // "Connected 0 signal(s)" + an empty timeline, and the agent
          // concludes the signals never fired — a confident lie about game
          // behavior. Both stale layers are precisely distinguishable here.
          if (watchResult.connected_signals === undefined) {
            warnings.push(
              'signals were IGNORED: the running addon predates the signal timeline feature — update the godot-mcp addon.'
            );
          } else if (watchResult.connected_signals + unresolved.length < requestedSignals) {
            warnings.push(
              `${requestedSignals - watchResult.connected_signals - unresolved.length} signal spec(s) were dropped in ` +
              'transit: the addon on disk is newer than what the editor has loaded — restart the Godot editor.'
            );
          }
          if (unresolved.length > 0) {
            warnings.push(`unresolved signals: ${unresolved.map((u) => `${u.path}:${u.signal} (${u.reason})`).join(', ')}.`);
          }
        }
        // Structured with a stable shape (unresolved_signals/warnings always
        // arrays): an agent must branch on unresolved reasons to retry
        // correctly, which prose can't carry reliably.
        return structured({
          started: watchResult.started,
          note: `Sampler started. Call watch_collect after ~${args.duration_ms ?? 1000}ms to get results.`,
          resolved_fields: watchResult.resolved_fields ?? 0,
          connected_signals: watchResult.connected_signals ?? 0,
          unresolved_signals: unresolved,
          warnings,
        });
      }

      case 'watch_collect': {
        return summarizeWatchResponse(await godot.sendCommand<WatchRawResponse>('watch_collect'));
      }

      case 'watch_stop': {
        return summarizeWatchResponse(await godot.sendCommand<WatchRawResponse>('watch_stop'));
      }
    }
  },
});

export const runtimeStateTools = [runtimeState] as AnyToolDefinition[];
