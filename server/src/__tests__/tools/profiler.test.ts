import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { profiler, computePercentiles, detectSpikes, computeMonitorTrends, computeFrameBudget } from '../../tools/profiler.js';

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
      expect(result.actual_fps).toBe(125);
      expect(result.budget_usage_percent).toBeCloseTo(47.9, 0);
    });

    it('handles 30fps target', () => {
      const frameTime = { avg_ms: 30, min_ms: 28, max_ms: 35, p50_ms: 30, p95_ms: 33, p99_ms: 35 };
      const result = computeFrameBudget(frameTime, 30);
      expect(result.target_fps).toBe(30);
      expect(result.frame_budget_ms).toBeCloseTo(33.3, 1);
      expect(result.actual_fps).toBe(33);
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
