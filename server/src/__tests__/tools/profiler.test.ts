import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { profiler, computePercentiles, detectSpikes, computeMonitorTrends } from '../../tools/profiler.js';

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
      expect(profiler.schema.safeParse({ action: 'status' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'get_data' }).success).toBe(true);
      expect(profiler.schema.safeParse({ action: 'get_active_processes' }).success).toBe(true);
    });

    it('rejects node_path on non-signal actions', () => {
      expect(profiler.schema.safeParse({ action: 'snapshot', node_path: '/root/Test' }).success).toBe(false);
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
      expect(JSON.parse(result as string)).toEqual(metrics);
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

  describe('status', () => {
    it('returns profiler status JSON', async () => {
      const status = { active: true, frame_count: 50, total_frames_collected: 50, max_frames: 300 };
      mock.mockResponse(status);
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'status' }, ctx);
      expect(JSON.parse(result as string)).toEqual(status);
    });
  });

  describe('get_data', () => {
    it('returns message when no frames collected', async () => {
      mock.mockResponse({ active: false, frame_count: 0, total_frames_collected: 0, frames: [] });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_data' }, ctx);
      const parsed = JSON.parse(result as string);
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
      const parsed = JSON.parse(result as string);
      expect(parsed.statistics.frame_time).toBeDefined();
      expect(parsed.statistics.frame_time.avg).toBeGreaterThan(0);
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
      expect(stats.avg).toBe(0);
      expect(stats.min).toBe(0);
      expect(stats.max).toBe(0);
    });

    it('computes correct values for single element', () => {
      const stats = computePercentiles([5]);
      expect(stats.avg).toBe(5);
      expect(stats.min).toBe(5);
      expect(stats.max).toBe(5);
      expect(stats.p50).toBe(5);
    });

    it('computes correct percentiles for multiple values', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const stats = computePercentiles(values);
      expect(stats.avg).toBeCloseTo(50.5);
      expect(stats.min).toBe(1);
      expect(stats.max).toBe(100);
      expect(stats.p50).toBeCloseTo(50.5, 0);
      expect(stats.p95).toBeCloseTo(95.5, 0);
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

  describe('computeMonitorTrends', () => {
    it('returns empty for frames without monitors', () => {
      const frames = [{ ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0 }];
      expect(computeMonitorTrends(frames)).toEqual({});
    });

    it('computes start/end/avg/max for monitor values', () => {
      const frames = [
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 0, m: { fps: 60, node_count: 100 } },
        { ft: 0.016, pt: 0.008, pht: 0.004, pft: 0.004, i: 10, m: { fps: 30, node_count: 200 } },
      ];
      const trends = computeMonitorTrends(frames);
      expect(trends.fps.start).toBe(60);
      expect(trends.fps.end).toBe(30);
      expect(trends.fps.avg).toBe(45);
      expect(trends.fps.max).toBe(60);
      expect(trends.node_count.start).toBe(100);
      expect(trends.node_count.end).toBe(200);
    });
  });
});
