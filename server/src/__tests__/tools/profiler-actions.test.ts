import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { profiler } from '../../tools/profiler.js';

describe('profiler tool actions', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('get_active_processes', () => {
    it('returns message when no processes found', async () => {
      mock.mockResponse({ processes: [] });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_active_processes' }, ctx);
      expect(result).toBe('No active _process or _physics_process functions found');
    });

    it('formats process list with script paths and instance counts', async () => {
      mock.mockResponse({
        processes: [
          {
            script_path: 'res://enemy.gd',
            has_process: true,
            has_physics_process: true,
            instance_count: 5,
            example_paths: ['/root/Main/Enemy1', '/root/Main/Enemy2'],
          },
          {
            script_path: 'res://player.gd',
            has_process: true,
            has_physics_process: false,
            instance_count: 1,
            example_paths: ['/root/Main/Player'],
          },
        ],
      });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_active_processes' }, ctx);
      expect(result).toContain('res://enemy.gd');
      expect(result).toContain('_process');
      expect(result).toContain('_physics_process');
      expect(result).toContain('Instances: 5');
      expect(result).toContain('res://player.gd');
      expect(result).toContain('Instances: 1');
    });

    it('sends correct command to Godot', async () => {
      mock.mockResponse({ processes: [] });
      const ctx = createToolContext(mock);
      await profiler.execute({ action: 'get_active_processes' }, ctx);
      expect(mock.calls[0].command).toBe('get_active_processes');
    });
  });

  describe('get_signal_connections', () => {
    it('returns message when no connections found', async () => {
      mock.mockResponse({ connections: [] });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_signal_connections' }, ctx);
      expect(result).toBe('No signal connections found');
    });

    it('formats signal connection graph', async () => {
      mock.mockResponse({
        connections: [
          {
            source_path: '/root/Main/Button',
            signal_name: 'pressed',
            target_path: '/root/Main/Player',
            method_name: '_on_button_pressed',
          },
          {
            source_path: '/root/Main/Timer',
            signal_name: 'timeout',
            target_path: '/root/Main/Spawner',
            method_name: '_on_timer_timeout',
          },
        ],
      });
      const ctx = createToolContext(mock);
      const result = await profiler.execute({ action: 'get_signal_connections' }, ctx);
      expect(result).toContain('Signal connections (2)');
      expect(result).toContain('/root/Main/Button.pressed -> /root/Main/Player._on_button_pressed');
      expect(result).toContain('/root/Main/Timer.timeout -> /root/Main/Spawner._on_timer_timeout');
    });

    it('passes node_path parameter to Godot', async () => {
      mock.mockResponse({ connections: [] });
      const ctx = createToolContext(mock);
      await profiler.execute({ action: 'get_signal_connections', node_path: '/root/Main/UI' }, ctx);
      expect(mock.calls[0].params.node_path).toBe('/root/Main/UI');
    });

    it('sends empty string when node_path not provided', async () => {
      mock.mockResponse({ connections: [] });
      const ctx = createToolContext(mock);
      await profiler.execute({ action: 'get_signal_connections' }, ctx);
      expect(mock.calls[0].params.node_path).toBe('');
    });
  });
});
