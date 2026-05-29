import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

interface FrameEntry {
  ft: number;
  pt: number;
  pht: number;
  pft: number;
  i: number;
  m?: Record<string, number>;
}

interface ProfilerDataResponse {
  active: boolean;
  frame_count: number;
  total_frames_collected: number;
  max_fps: number;
  frames: FrameEntry[];
}

interface ProcessEntry {
  script_path: string;
  has_process: boolean;
  has_physics_process: boolean;
  instance_count: number;
  example_paths: string[];
}

interface SignalConnection {
  source_path: string;
  signal_name: string;
  target_path: string;
  method_name: string;
}

export interface PercentileStats {
  avg_ms: number;
  min_ms: number;
  max_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

function toMs(seconds: number): number {
  return Math.round(seconds * 100000) / 100;
}

export function computePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { avg_ms: 0, min_ms: 0, max_ms: 0, p50_ms: 0, p95_ms: 0, p99_ms: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avg_ms: toMs(sum / sorted.length),
    min_ms: toMs(sorted[0]),
    max_ms: toMs(sorted[sorted.length - 1]),
    p50_ms: toMs(percentile(sorted, 50)),
    p95_ms: toMs(percentile(sorted, 95)),
    p99_ms: toMs(percentile(sorted, 99)),
  };
}

function percentile(sorted: number[], p: number): number {
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export interface SpikeInfo {
  frame_index: number;
  frame_time_ms: number;
  monitors?: Record<string, number>;
}

export function detectSpikes(frames: FrameEntry[], medianFrameTime: number): SpikeInfo[] {
  const threshold = medianFrameTime * 2;
  const spikes: SpikeInfo[] = [];

  for (const frame of frames) {
    if (frame.ft > threshold) {
      const spike: SpikeInfo = {
        frame_index: frame.i,
        frame_time_ms: toMs(frame.ft),
      };
      if (frame.m) {
        spike.monitors = frame.m;
      }
      spikes.push(spike);
    }
  }

  return spikes;
}

export interface MonitorTrend {
  start: number;
  end: number;
  avg: number;
  max: number;
  change_percent: number;
}

export function computeMonitorTrends(frames: FrameEntry[]): Record<string, MonitorTrend> {
  const monitorFrames = frames.filter((f) => f.m);
  if (monitorFrames.length === 0) return {};

  const allKeys = new Set<string>();
  for (const f of monitorFrames) {
    for (const key of Object.keys(f.m!)) {
      allKeys.add(key);
    }
  }

  const trends: Record<string, MonitorTrend> = {};

  for (const key of allKeys) {
    const values = monitorFrames.filter((f) => f.m![key] !== undefined).map((f) => f.m![key]);
    if (values.length === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    const start = values[0];
    const end = values[values.length - 1];
    const changePct = start === 0 ? (end === 0 ? 0 : 100) : ((end - start) / start) * 100;

    trends[key] = {
      start,
      end,
      avg: sum / values.length,
      max: Math.max(...values),
      change_percent: Math.round(changePct * 10) / 10,
    };
  }

  return trends;
}

export interface FrameBudget {
  target_fps: number;
  actual_fps: number;
  frame_budget_ms: number;
  budget_usage_percent: number;
}

export function computeFrameBudget(
  frameTimeStats: PercentileStats,
  targetFps: number,
): FrameBudget {
  const budgetMs = 1000 / targetFps;
  const actualFps = frameTimeStats.avg_ms > 0 ? Math.round(1000 / frameTimeStats.avg_ms) : 0;
  const budgetUsage = Math.round((frameTimeStats.avg_ms / budgetMs) * 1000) / 10;

  return {
    target_fps: targetFps,
    actual_fps: actualFps,
    frame_budget_ms: Math.round(budgetMs * 10) / 10,
    budget_usage_percent: budgetUsage,
  };
}

const ProfilerSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('snapshot').describe('Full performance snapshot (all engine metrics)') }),
  z.object({ action: z.literal('start').describe('Start per-frame time-series profiling') }),
  z.object({ action: z.literal('stop').describe('Stop time-series profiling') }),
  z.object({ action: z.literal('get_data').describe('Get collected time-series data with spike detection') }),
  z.object({ action: z.literal('get_active_processes').describe('List active _process/_physics_process scripts') }),
  z.object({
    action: z.literal('get_signal_connections').describe('Inspect signal connections'),
    node_path: z.string().optional().describe('Node path (defaults to scene root)'),
  }),
]);

type ProfilerArgs = z.infer<typeof ProfilerSchema>;

export const profiler = defineTool({
  name: 'godot_profiler',
  annotations: { title: 'Profiler', readOnlyHint: true, openWorldHint: false },
  description:
    'Performance profiling and analysis: snapshot all engine metrics, collect per-frame time series data with spike detection, list active _process/_physics_process scripts, inspect signal connections',
  schema: ProfilerSchema,
  async execute(args: ProfilerArgs, { godot }) {
    switch (args.action) {
      case 'snapshot': {
        const result = await godot.sendCommand<Record<string, number | string>>(
          'get_performance_metrics'
        );
        return JSON.stringify(result, null, 2);
      }

      case 'start': {
        const result = await godot.sendCommand<{ message: string }>('start_profiler');
        return result.message;
      }

      case 'stop': {
        const result = await godot.sendCommand<{ message: string }>('stop_profiler');
        return result.message;
      }

      case 'get_data': {
        const result = await godot.sendCommand<ProfilerDataResponse>('get_profiler_data');
        const { frames } = result;

        if (frames.length === 0) {
          return JSON.stringify({
            active: result.active,
            frame_count: 0,
            message: 'No frames collected. Start the profiler first with action: start',
          }, null, 2);
        }

        const frameTimeStats = computePercentiles(frames.map((f) => f.ft));
        const processTimeStats = computePercentiles(frames.map((f) => f.pt));
        const physicsTimeStats = computePercentiles(frames.map((f) => f.pht));

        const spikes = detectSpikes(frames, frameTimeStats.p50_ms / 1000);
        const monitorTrends = computeMonitorTrends(frames);

        const physicsTickMs = frames.length > 0 ? toMs(frames[0].pft) : 16.67;
        const maxFps = result.max_fps || 0;
        const targetFps = maxFps > 0 ? maxFps : Math.round(1000 / physicsTickMs);

        const frameBudget = computeFrameBudget(frameTimeStats, targetFps);

        return JSON.stringify({
          active: result.active,
          frame_count: result.frame_count,
          total_frames_collected: result.total_frames_collected,
          frame_budget: frameBudget,
          statistics: {
            frame_time: frameTimeStats,
            process_time: processTimeStats,
            physics_time: physicsTimeStats,
          },
          physics_tick_ms: physicsTickMs,
          spikes: {
            count: spikes.length,
            threshold: `>${Math.round(frameTimeStats.p50_ms * 2 * 10) / 10}ms (2x median)`,
            frames: spikes.slice(0, 20),
          },
          monitor_trends: monitorTrends,
        }, null, 2);
      }

      case 'get_active_processes': {
        const result = await godot.sendCommand<{ processes: ProcessEntry[] }>(
          'get_active_processes'
        );
        const { processes } = result;

        if (processes.length === 0) {
          return 'No active _process or _physics_process functions found';
        }

        const lines: string[] = [`Active processing scripts (${processes.length} scripts):\n`];

        for (const entry of processes) {
          const funcs: string[] = [];
          if (entry.has_process) funcs.push('_process');
          if (entry.has_physics_process) funcs.push('_physics_process');

          lines.push(`  ${entry.script_path}`);
          lines.push(`    Functions: ${funcs.join(', ')}`);
          lines.push(`    Instances: ${entry.instance_count}`);
          if (entry.example_paths.length > 0) {
            lines.push(`    Examples: ${entry.example_paths.join(', ')}`);
          }
          lines.push('');
        }

        return lines.join('\n');
      }

      case 'get_signal_connections': {
        const result = await godot.sendCommand<{ connections: SignalConnection[] }>(
          'get_signal_connections',
          { node_path: args.node_path ?? '' }
        );
        const { connections } = result;

        if (connections.length === 0) {
          return 'No signal connections found';
        }

        const lines: string[] = [`Signal connections (${connections.length}):\n`];

        for (const conn of connections) {
          lines.push(`  ${conn.source_path}.${conn.signal_name} -> ${conn.target_path}.${conn.method_name}`);
        }

        return lines.join('\n');
      }
    }
  },
});

export const profilerTools = [profiler] as AnyToolDefinition[];
