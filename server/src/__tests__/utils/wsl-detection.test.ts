import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isWSL } from '../../utils/wsl-detection.js';
import fs from 'fs';
import os from 'os';

vi.mock('fs');
vi.mock('os');

describe('wsl-detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.WSL_DISTRO_NAME;
    delete process.env.WSL_INTEROP;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('isWSL()', () => {
    it('returns false on non-Linux platforms', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      try {
        expect(isWSL()).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', originalPlatform || {});
      }
    });

    it('returns false on macOS', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      try {
        expect(isWSL()).toBe(false);
      } finally {
        Object.defineProperty(process, 'platform', originalPlatform || {});
      }
    });

    describe('on Linux platform', () => {
      let originalPlatform: PropertyDescriptor | undefined;

      beforeEach(() => {
        originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
        Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      });

      afterEach(() => {
        if (originalPlatform) {
          Object.defineProperty(process, 'platform', originalPlatform);
        }
      });

      it('returns true when WSL_DISTRO_NAME env var is set', () => {
        process.env.WSL_DISTRO_NAME = 'Ubuntu';
        expect(isWSL()).toBe(true);
      });

      it('returns true when WSL_INTEROP env var is set', () => {
        process.env.WSL_INTEROP = '1';
        expect(isWSL()).toBe(true);
      });

      it('returns true when /proc/version contains "microsoft"', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
          'Linux version 4.19.128-microsoft (oe-user@oe-host) (gcc version 9.3.0 (GCC))'
        );
        expect(isWSL()).toBe(true);
      });

      it('returns true when /proc/version contains "Microsoft" (case-insensitive)', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
          'Linux version 4.19.128-Microsoft (oe-user@oe-host) (gcc version 9.3.0 (GCC))'
        );
        expect(isWSL()).toBe(true);
      });

      it('returns true when os.release() contains "microsoft"', () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('File not found');
        });
        vi.mocked(os.release).mockReturnValue('4.19.128-microsoft');
        expect(isWSL()).toBe(true);
      });

      it('returns false on native Linux with no WSL indicators', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
          'Linux version 5.15.0-1234-generic (buildd@lcy02-amd64-001)'
        );
        vi.mocked(os.release).mockReturnValue('5.15.0-1234-generic');
        expect(isWSL()).toBe(false);
      });

      it('returns false when /proc/version throws error and os.release() has no microsoft', () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('Permission denied');
        });
        vi.mocked(os.release).mockReturnValue('5.15.0-generic');
        expect(isWSL()).toBe(false);
      });

      it('uses env var as fast path and skips file checks', () => {
        process.env.WSL_DISTRO_NAME = 'Ubuntu';
        expect(isWSL()).toBe(true);
        expect(vi.mocked(fs.readFileSync)).not.toHaveBeenCalled();
      });

      it('falls back to /proc/version when env vars not set', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
          'Linux version 4.19.128-microsoft (oe-user@oe-host)'
        );
        expect(isWSL()).toBe(true);
        expect(vi.mocked(fs.readFileSync)).toHaveBeenCalledWith('/proc/version', 'utf8');
      });

      it('falls back to os.release() when /proc/version not readable', () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('File not found');
        });
        vi.mocked(os.release).mockReturnValue('4.19.128-microsoft');
        expect(isWSL()).toBe(true);
        expect(vi.mocked(os.release)).toHaveBeenCalled();
      });

      it('handles case-insensitive matching for /proc/version', () => {
        vi.mocked(fs.readFileSync).mockReturnValue(
          'Linux version 4.19.128-MICROSOFT (oe-user@oe-host)'
        );
        expect(isWSL()).toBe(true);
      });

      it('handles case-insensitive matching for os.release()', () => {
        vi.mocked(fs.readFileSync).mockImplementation(() => {
          throw new Error('File not found');
        });
        vi.mocked(os.release).mockReturnValue('5.10.16.3-MICROSOFT-standard');
        expect(isWSL()).toBe(true);
      });
    });
  });
});
