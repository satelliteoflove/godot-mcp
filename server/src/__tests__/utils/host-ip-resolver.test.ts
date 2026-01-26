import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getHostIpInWSL, _clearHostIpCache } from '../../utils/host-ip-resolver.js';
import * as wslDetection from '../../utils/wsl-detection.js';
import { execSync } from 'child_process';

vi.mock('child_process');
vi.mock('../../utils/wsl-detection.js');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('host-ip-resolver', () => {
  beforeEach(() => {
    _clearHostIpCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    _clearHostIpCache();
    vi.clearAllMocks();
  });

  describe('getHostIpInWSL()', () => {
    it('returns GODOT_HOST env var if set', () => {
      process.env.GODOT_HOST = '192.168.1.100';
      expect(getHostIpInWSL()).toBe('192.168.1.100');
      expect(vi.mocked(execSync)).not.toHaveBeenCalled();
    });

    it('returns null when not in WSL and no override set', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      expect(getHostIpInWSL()).toBeNull();
    });

    it('returns null on second call (uses cache)', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(false);

      expect(getHostIpInWSL()).toBeNull();
      expect(getHostIpInWSL()).toBeNull();
      expect(vi.mocked(wslDetection.isWSL)).toHaveBeenCalledTimes(1);
    });

    it('returns cached host IP on second call', () => {
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('192.168.1.1');

      expect(getHostIpInWSL()).toBe('192.168.1.1');
      expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1);

      expect(getHostIpInWSL()).toBe('192.168.1.1');
      expect(vi.mocked(execSync)).toHaveBeenCalledTimes(1); // No additional call
    });


    it('validates auto-detected IP and returns null if invalid', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('not-an-ip');

      expect(getHostIpInWSL()).toBeNull();
    });

    it('handles execSync errors gracefully', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('Command failed');
      });

      expect(getHostIpInWSL()).toBeNull();
    });

    it('parses valid ip route output correctly', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('192.168.1.1');

      expect(getHostIpInWSL()).toBe('192.168.1.1');
    });

    it('trims whitespace from ip route output', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('  192.168.1.1  \n');

      expect(getHostIpInWSL()).toBe('192.168.1.1');
    });

    it('validates IPv4 format correctly', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);

      const validIPs = [
        '0.0.0.0',
        '127.0.0.1',
        '192.168.1.1',
        '255.255.255.255',
        '10.0.0.1',
      ];

      for (const ip of validIPs) {
        _clearHostIpCache();
        vi.mocked(execSync).mockReturnValue(ip);
        expect(getHostIpInWSL()).toBe(ip);
      }
    });

    it('rejects invalid IPv4 addresses', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);

      const invalidIPs = [
        '256.0.0.1', // Out of range
        '192.168.1', // Missing octet
        '192.168.1.1.1', // Too many octets
        '192.168.a.1', // Non-numeric
        '192.168.1.', // Trailing dot
      ];

      for (const ip of invalidIPs) {
        _clearHostIpCache();
        vi.mocked(execSync).mockReturnValue(ip);
        expect(getHostIpInWSL()).toBeNull();
      }
    });


    it('execSync is called with correct command', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('192.168.1.1');

      getHostIpInWSL();

      expect(vi.mocked(execSync)).toHaveBeenCalledWith("ip route | awk '/default/ {print $3}'", {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
    });

    it('handles empty string from ip route', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(execSync).mockReturnValue('');

      expect(getHostIpInWSL()).toBeNull();
    });
  });
});
