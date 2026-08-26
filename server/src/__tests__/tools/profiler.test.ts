import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { profiler, computePercentiles, detectSpikes, spikeThreshold, computeMonitorTrends, computeFrameBudget } from '../../tools/profiler.js';

describe('profiler tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('schema validation', () => {
    it('accepts valid actions', () => {
      expect(profiler.schema.safeParse({ action: 'snapshot' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'start' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'stop' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'get_data' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'get_active_processes' }).success).toBe(true);
    });

    it('strips node_path from non-signal actions (only get_signal_connections defines it)', () => {
      const parsed = profiler.schema.safeParse({ action: 'snapshot', node_path: '/root/Test' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect('node_path' in parsed.data).toBe(false);
      }
    });

    it('accepts node_path on get_signal_connections', () => {
      expect(profiler.schema.safeParse({ action: 'get_signal_connections', node_path: '/root/Test' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'get_signal_connections' }).success).toBe(true);
    });
  });

  describe('snapshot', () => {
    it('returns JSON with all performance metrics', async () => {
      const metrics = { fps: 60, frame_time_ms: 16.6, memory_static: 1024 };
      mock.mockResponse(metrics);
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'snapshot' }, ctx);
      expect(structuredOf(result)).toEqual(metrics);
      expect(mock.calls[0].command).toBe('get_performance_metrics');
    });
  });

  describe('start/stop', () => {
    it('returns confirmation messages', async () => {
      const ctx = createToolContext(mock);
      mock.mockResponse({ message: 'Frame profiler started' });
      expect(await profiler.execute({ action: 'start' }, ctx)).toBe('Frame profiler started');

      mock.mockResponse({ message: 'Frame profiler stopped' });
      expect(await profiler.execute({ action: 'stop' }, ctx)).toBe('Frame profiler stopped');
    });
  });

  describe('get_data', () => {
    it('returns message when no frames collected', async () => {
      mock.mockResponse({ active: false, frame_count: 0, total_frames_collected: 0, frames: [] });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_data' }, ctx);
      const parsed = structuredOf(result);
      expect(parsed.frame_count).toBe(0);
      expect(parsed.message).toContain('No frames collected');
    });

    it('computes statistics and spike detection from frame data', async () => {
      const frames = [
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0, m: { fps: 60 } },
        { ft: 0.017, pt: 0.009, pht: 0.004, pft: 0.004, i: 1 },
        { ft: 0.050, pt: 0.030, pht: 0.004, pft: 0.004, i: 2 },
      ];
      mock.mockResponse({ active: true, frame_count: 3, total_frames_collected: 3, frames });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_data' }, ctx);
      const parsed = structuredOf(result);
      expect(parsed.statistics.frame_time).toBeDefined();
      expect(parsed.statistics.frame_time.avg_ms).toBeGreaterThan(0);
      expect(parsed.frame_budget).toBeDefined();
      expect(parsed.frame_budget.target_fps).toBeGreaterThan(0);
      expect(parsed.frame_budget.budget_usage_percent).toBeGreaterThan(0);
      expect(parsed.physics_tick_ms).toBeDefined();
      expect(parsed.spikes).toBeDefined();
      expect(parsed.spikes.count).toBe(1);
      expect(parsed.monitor_trends).toBeDefined();
      expect(parsed.window).toContain('all 3 frames collected');
      expect(parsed.frame_budget.uncapped_fps).toBeGreaterThan(0);
      expect(parsed.frame_budget.measured_fps).toBe(60);
      expect(parsed.frame_budget.actual_fps).toBeUndefined();
    });

    it('says the ring window is partial and surfaces run aggregates (#370)', async () => {
      const frames = Array.from({ length: 3 }, (_, i) => ({ ft: 0.004, pt: 0.002, pht: 0.001, pft: 0.004, i: 7611 + i }));
      mock.mockResponse({
        active: true, frame_count: 3, total_frames_collected: 7614, max_fps: 240, frames,
        run: {
          frames: 7614, duration_s: 31.7, sum_ft: 31.0, max_ft: 0.02044, max_frame_index: 600,
          budget_sec: 1 / 240, over_budget: 5, over_half_budget: 9,
          histogram_ms: { '<=0.5ms': 7600, '<=1.0ms': 9, '>100ms': 0 },
        },
      });
      const ctx = createToolContext(mock);
      const parsed = structuredOf(await profiler.execute({ action: 'get_data' }, ctx));
      expect(parsed.window).toContain('last 3 of 7614 frames');
      expect(parsed.window).toContain('ONLY this window');
      expect(parsed.run.frames).toBe(7614);
      expect(parsed.run.max_ms).toBe(20.44);
      expect(parsed.run.max_frame_index).toBe(600);
      expect(parsed.run.over_budget).toBe(5);
      expect(parsed.run.histogram_ms['<=0.5ms']).toBe(7600);
    });

    it('floors the spike threshold at budget/4 on an idle game (#371)', async () => {
      // 240 fps cap, ~0.25 ms median, one 0.9 ms jitter frame, one real 20 ms stall.
      const frames = [
        ...Array.from({ length: 10 }, (_, i) => ({ ft: 0.00025, pt: 0.0001, pht: 0.0001, pft: 1 / 60, i })),
        { ft: 0.0009, pt: 0.0005, pht: 0.0001, pft: 1 / 60, i: 10 },
        { ft: 0.020, pt: 0.019, pht: 0.0001, pft: 1 / 60, i: 11 },
      ];
      mock.mockResponse({ active: true, frame_count: 12, total_frames_collected: 12, max_fps: 240, frames });
      const ctx = createToolContext(mock);
      const parsed = structuredOf(await profiler.execute({ action: 'get_data' }, ctx));
      expect(parsed.spikes.count).toBe(1);
      expect(parsed.spikes.frames[0].frame_index).toBe(11);
      expect(parsed.spikes.threshold).toContain('budget/4 floor');
      expect(parsed.spikes.threshold).toContain('2x median = 0.5ms');
    });
  });

  describe('get_active_processes', () => {
    it('shows where each script\'s instances live (#369)', async () => {
      mock.mockResponse({
        processes: [
          { script_path: 'res://conductor.gd', has_process: true, has_physics_process: false, instance_count: 1, example_paths: ['/root/Conductor'], locations: ['autoload'] },
          { script_path: 'res://hud.gd', has_process: true, has_physics_process: false, instance_count: 1, example_paths: ['/root/Main/HUD'], locations: ['scene'] },
        ],
      });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_active_processes' }, ctx);
      expect(result).toContain('res://conductor.gd [autoload]');
      expect(result).toContain('res://hud.gd [scene]');
      expect(result).toContain('Examples: /root/Conductor');
    });
  });
});

describe('profiler statistics', () => {
  describe('computePercentiles', () => {
    it('returns zeros for empty array', () => {
      const stats = computePercentiles([]);
      expect(stats.avg_ms).toBe(0);
      expect(stats.min_ms).toBe(0);
      expect(stats.max_ms).toBe(0);
    });

    it('computes correct values for single element', () => {
      const stats = computePercentiles([0.016]);
      expect(stats.avg_ms).toBe(16);
      expect(stats.min_ms).toBe(16);
      expect(stats.max_ms).toBe(16);
      expect(stats.p50_ms).toBe(16);
    });

    it('computes correct percentiles for multiple values', () => {
      const values = [0.010, 0.016, 0.017, 0.020, 0.050];
      const stats = computePercentiles(values);
      expect(stats.avg_ms).toBeGreaterThan(0);
      expect(stats.min_ms).toBe(10);
      expect(stats.max_ms).toBe(50);
      expect(stats.p50_ms).toBe(17);
    });
  });

  describe('detectSpikes', () => {
    it('returns empty array when no spikes', () => {
      const frames = [
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0 },
        { ft: 0.017, pt: 0.009, pht: 0.004, pft: 0.004, i: 1 },
      ];
      expect(detectSpikes(frames, 0.0165)).toEqual([]);
    });

    it('spikeThreshold picks whichever of 2x median and budget/4 is larger', () => {
      expect(spikeThreshold(0.008, 1 / 60)).toEqual({ threshold: 0.016, rule: '2x median' });
      const floored = spikeThreshold(0.00025, 1 / 240);
      expect(floored.rule).toBe('budget/4 floor');
      expect(floored.threshold).toBeCloseTo(1 / 960, 6);
    });

    it('detects frames exceeding 2x median', () => {
      const frames = [
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0 },
        { ft: 0.050, pt: 0.030, pht: 0.004, pft: 0.004, i: 1, m: { fps: 20 } },
      ];
      const spikes = detectSpikes(frames, 0.016);
      expect(spikes.length).toBe(1);
      expect(spikes[0].frame_index).toBe(1);
      expect(spikes[0].monitors).toEqual({ fps: 20 });
    });
  });

  describe('computeFrameBudget', () => {
    it('computes budget stats for 60fps target', () => {
      const frameTime = { avg_ms: 8, min_ms: 7, max_ms: 10, p50_ms: 8, p95_ms: 9, p99_ms: 10 };
      const result = computeFrameBudget(frameTime, 60);
      expect(result.target_fps).toBe(60);
      expect(result.frame_budget_ms).toBeCloseTo(16.7, 1);
      expect(result.uncapped_fps).toBe(125);
      expect(result.measured_fps).toBeUndefined();
      expect(result.budget_usage_percent).toBeCloseTo(47.9, 0);
    });

    it('handles 30fps target', () => {
      const frameTime = { avg_ms: 30, min_ms: 28, max_ms: 35, p50_ms: 30, p95_ms: 33, p99_ms: 35 };
      const result = computeFrameBudget(frameTime, 30);
      expect(result.target_fps).toBe(30);
      expect(result.frame_budget_ms).toBeCloseTo(33.3, 1);
      expect(result.uncapped_fps).toBe(33);
    });

    it('handles 120fps target', () => {
      const frameTime = { avg_ms: 7, min_ms: 6, max_ms: 9, p50_ms: 7, p95_ms: 8, p99_ms: 9 };
      const result = computeFrameBudget(frameTime, 120);
      expect(result.target_fps).toBe(120);
      expect(result.frame_budget_ms).toBeCloseTo(8.3, 1);
    });
  });

  describe('computeMonitorTrends', () => {
    it('returns empty for frames without monitors', () => {
      const frames = [{ ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0 }];
      expect(computeMonitorTrends(frames)).toEqual({});
    });

    it('computes start/end/avg/max/change_percent for monitor values', () => {
      const frames = [
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0, m: { fps: 60, node_count: 100 } },
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 10, m: { fps: 30, node_count: 200 } },
      ];
      const trends = computeMonitorTrends(frames);
      expect(trends.fps.start).toBe(60);
      expect(trends.fps.end).toBe(30);
      expect(trends.fps.avg).toBe(45);
      expect(trends.fps.max).toBe(60);
      expect(trends.fps.change_percent).toBe(-50);
      expect(trends.node_count.start).toBe(100);
      expect(trends.node_count.end).toBe(200);
      expect(trends.node_count.change_percent).toBe(100);
    });
  });
});
