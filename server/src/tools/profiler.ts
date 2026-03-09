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
  frames: FrameEntry[];
}

interface ProfilerStatusResponse {
  active: boolean;
  frame_count: number;
  total_frames_collected: number;
  max_frames: number;
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
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export function computePercentiles(values: number[]): PercentileStats {
  if (values.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    avg: sum / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
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
  frame_time: number;
  monitors?: Record<string, number>;
}

export function detectSpikes(frames: FrameEntry[], medianFrameTime: number): SpikeInfo[] {
  const threshold = medianFrameTime * 2;
  const spikes: SpikeInfo[] = [];

  for (const frame of frames) {
    if (frame.ft > threshold) {
      const spike: SpikeInfo = {
        frame_index: frame.i,
        frame_time: frame.ft,
      };
      if (frame.m) {
        spike.monitors = frame.m;
      }
      spikes.push(spike);
    }
  }

  return spikes;
}

export function computeMonitorTrends(frames: FrameEntry[]): Record<string, { start: number; end: number; avg: number; max: number }> {
  const monitorFrames = frames.filter((f) => f.m);
  if (monitorFrames.length === 0) return {};

  const allKeys = new Set<string>();
  for (const f of monitorFrames) {
    for (const key of Object.keys(f.m!)) {
      allKeys.add(key);
    }
  }

  const trends: Record<string, { start: number; end: number; avg: number; max: number }> = {};

  for (const key of allKeys) {
    const values = monitorFrames.filter((f) => f.m![key] !== undefined).map((f) => f.m![key]);
    if (values.length === 0) continue;

    const sum = values.reduce((a, b) => a + b, 0);
    trends[key] = {
      start: values[0],
      end: values[values.length - 1],
      avg: sum / values.length,
      max: Math.max(...values),
    };
  }

  return trends;
}

const ProfilerSchema = z
  .object({
    action: z
      .enum([
        'snapshot',
        'start',
        'stop',
        'status',
        'get_data',
        'get_active_processes',
        'get_signal_connections',
      ])
      .describe('Action: snapshot (full perf snapshot), start/stop/status/get_data (time series profiling), get_active_processes, get_signal_connections'),
    node_path: z
      .string()
      .optional()
      .describe('Node path for get_signal_connections (optional, defaults to scene root)'),
  })
  .refine(
    (data) => {
      if (data.node_path !== undefined && data.action !== 'get_signal_connections') {
        return false;
      }
      return true;
    },
    { message: 'node_path is only valid with get_signal_connections action' }
  );

type ProfilerArgs = z.infer<typeof ProfilerSchema>;

export const profiler = defineTool({
  name: 'profiler',
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

      case 'status': {
        const result = await godot.sendCommand<ProfilerStatusResponse>('get_profiler_status');
        return JSON.stringify(result, null, 2);
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
        const physicsFrameTimeStats = computePercentiles(frames.map((f) => f.pft));

        const spikes = detectSpikes(frames, frameTimeStats.p50);
        const monitorTrends = computeMonitorTrends(frames);

        return JSON.stringify({
          active: result.active,
          frame_count: result.frame_count,
          total_frames_collected: result.total_frames_collected,
          statistics: {
            frame_time: frameTimeStats,
            process_time: processTimeStats,
            physics_time: physicsTimeStats,
            physics_frame_time: physicsFrameTimeStats,
          },
          spikes: {
            count: spikes.length,
            threshold_multiplier: 2,
            median_frame_time: frameTimeStats.p50,
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
