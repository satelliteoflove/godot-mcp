import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getTargetHost, getConnectionStrategy } from '../../utils/connection-strategy.js';
import * as wslDetection from '../../utils/wsl-detection.js';
import * as hostIpResolver from '../../utils/host-ip-resolver.js';

vi.mock('../../utils/wsl-detection.js');
vi.mock('../../utils/host-ip-resolver.js');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('connection-strategy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GODOT_HOST;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getTargetHost()', () => {
    it('returns GODOT_HOST if set', () => {
      process.env.GODOT_HOST = '192.168.1.100';
      expect(getTargetHost()).toBe('192.168.1.100');
    });

    it('returns auto-detected IP when in WSL and available', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(hostIpResolver.getHostIpInWSL).mockReturnValue('192.168.1.1');

      expect(getTargetHost()).toBe('192.168.1.1');
    });

    it('returns 127.0.0.1 as fallback when in WSL but no IP detected', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(hostIpResolver.getHostIpInWSL).mockReturnValue(null);

      expect(getTargetHost()).toBe('127.0.0.1');
    });

    it('returns 127.0.0.1 when not in WSL', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      expect(getTargetHost()).toBe('127.0.0.1');
    });

    it('prioritizes GODOT_HOST over auto-detection', () => {
      process.env.GODOT_HOST = '10.0.0.1';
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(hostIpResolver.getHostIpInWSL).mockReturnValue('192.168.1.1');

      expect(getTargetHost()).toBe('10.0.0.1');
    });

    it('prioritizes auto-detected IP over getHostIpInWSL calls', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(hostIpResolver.getHostIpInWSL).mockReturnValue('192.168.1.1');

      expect(getTargetHost()).toBe('192.168.1.1');
      expect(vi.mocked(hostIpResolver.getHostIpInWSL)).toHaveBeenCalled();
    });

    it('trims whitespace from GODOT_HOST', () => {
      process.env.GODOT_HOST = '  192.168.1.100  ';
      expect(getTargetHost()).toBe('192.168.1.100');
    });

    it('accepts hostnames as well as IP addresses', () => {
      process.env.GODOT_HOST = 'localhost';
      expect(getTargetHost()).toBe('localhost');

      process.env.GODOT_HOST = 'godot.local';
      expect(getTargetHost()).toBe('godot.local');
    });
  });

  describe('getConnectionStrategy()', () => {
    it('returns WSL environment info when in WSL', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(hostIpResolver.getHostIpInWSL).mockReturnValue('192.168.1.1');

      const strategy = getConnectionStrategy(6550);

      expect(strategy.environment).toBe('wsl');
      expect(strategy.targetHost).toBe('192.168.1.1');
      expect(strategy.wsUrl).toBe('ws://192.168.1.1:6550');
    });

    it('returns native environment info when not in WSL', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      const strategy = getConnectionStrategy(6550);

      expect(strategy.environment).toBe('native');
      expect(strategy.targetHost).toBe('127.0.0.1');
      expect(strategy.wsUrl).toBe('ws://127.0.0.1:6550');
    });

    it('includes correct port in wsUrl', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      const strategy = getConnectionStrategy(9999);
      expect(strategy.wsUrl).toBe('ws://127.0.0.1:9999');
    });

    it('uses targetHost for wsUrl', () => {
      process.env.GODOT_HOST = '10.0.0.1';

      const strategy = getConnectionStrategy(6550);

      expect(strategy.targetHost).toBe('10.0.0.1');
      expect(strategy.wsUrl).toBe('ws://10.0.0.1:6550');
    });

    it('respects GODOT_HOST override', () => {
      process.env.GODOT_HOST = '192.168.1.2';
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);

      const strategy = getConnectionStrategy(6550);

      expect(strategy.targetHost).toBe('192.168.1.2');
    });

    it('handles custom ports in URL', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      for (const port of [80, 3000, 6550, 65535]) {
        const strategy = getConnectionStrategy(port);
        expect(strategy.wsUrl).toBe(`ws://127.0.0.1:${port}`);
      }
    });
  });
});
