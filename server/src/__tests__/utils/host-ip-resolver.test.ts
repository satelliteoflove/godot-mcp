import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getHostIpInWSL, _clearHostIpCache } from '../../utils/host-ip-resolver.js';
import * as wslDetection from '../../utils/wsl-detection.js';
import * as gatewayResolver from '../../utils/gateway-resolver.js';

vi.mock('../../utils/wsl-detection.js');
vi.mock('../../utils/gateway-resolver.js');
vi.mock('../../utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

describe('host-ip-resolver', () => {
  let originalGodotHost: string | undefined;

  beforeEach(() => {
    originalGodotHost = process.env.GODOT_HOST;
    delete process.env.GODOT_HOST;
    _clearHostIpCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalGodotHost !== undefined) {
      process.env.GODOT_HOST = originalGodotHost;
    } else {
      delete process.env.GODOT_HOST;
    }
    _clearHostIpCache();
    vi.clearAllMocks();
  });

  describe('getHostIpInWSL()', () => {
    it('returns GODOT_HOST env var if set', () => {
      process.env.GODOT_HOST = '192.168.1.100';
      expect(getHostIpInWSL()).toBe('192.168.1.100');
      expect(vi.mocked(gatewayResolver.resolveGateway)).not.toHaveBeenCalled();
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
      vi.mocked(gatewayResolver.resolveGateway).mockReturnValue({
        environment: 'wsl2',
        gatewayIp: '192.168.1.1',
      });

      expect(getHostIpInWSL()).toBe('192.168.1.1');
      expect(vi.mocked(gatewayResolver.resolveGateway)).toHaveBeenCalledTimes(1);

      expect(getHostIpInWSL()).toBe('192.168.1.1');
      expect(vi.mocked(gatewayResolver.resolveGateway)).toHaveBeenCalledTimes(1); // No additional call
    });

    it('returns null when gateway resolver returns null', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(gatewayResolver.resolveGateway).mockReturnValue({
        environment: 'wsl2',
        gatewayIp: null,
      });

      expect(getHostIpInWSL()).toBeNull();
    });

    it('returns gateway IP when available in WSL2', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(gatewayResolver.resolveGateway).mockReturnValue({
        environment: 'wsl2',
        gatewayIp: '192.168.1.1',
      });

      expect(getHostIpInWSL()).toBe('192.168.1.1');
    });

    it('returns null for WSL1 (no gateway IP)', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(gatewayResolver.resolveGateway).mockReturnValue({
        environment: 'wsl1',
        gatewayIp: null,
      });

      expect(getHostIpInWSL()).toBeNull();
    });

    it('handles gateway resolver errors gracefully', () => {
      delete process.env.GODOT_HOST;
      vi.mocked(wslDetection.isWSL).mockReturnValue(true);
      vi.mocked(gatewayResolver.resolveGateway).mockImplementation(() => {
        throw new Error('Resolution failed');
      });

      expect(getHostIpInWSL()).toBeNull();
    });

    it('supports various valid IPv4 addresses from gateway', () => {
      const validIPs = [
        '0.0.0.0',
        '127.0.0.1',
        '192.168.1.1',
        '255.255.255.255',
        '10.0.0.1',
      ];

      for (const ip of validIPs) {
        _clearHostIpCache();
        vi.mocked(wslDetection.isWSL).mockReturnValue(true);
        vi.mocked(gatewayResolver.resolveGateway).mockReturnValue({
          environment: 'wsl2',
          gatewayIp: ip,
        });
        expect(getHostIpInWSL()).toBe(ip);
      }
    });
  });
});
