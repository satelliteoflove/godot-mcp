import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, _resetForTesting } from '../../utils/logger.js';

describe('logger (stderr-only)', () => {
  beforeEach(() => {
    _resetForTesting();
    delete process.env.GODOT_MCP_VERBOSE;
  });

  afterEach(() => {
    delete process.env.GODOT_MCP_VERBOSE;
  });

  describe('level gating', () => {
    it('writes warning/error/critical to stderr, not info/debug/notice', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('debug');
      logger.info('info');
      logger.notice('notice');
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.warning('warning');
      logger.error('error');
      logger.critical('critical');
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });

    it('GODOT_MCP_VERBOSE enables debug/info/notice output', () => {
      process.env.GODOT_MCP_VERBOSE = '1';
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.debug('debug');
      logger.info('info');
      logger.notice('notice');
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe('structured data', () => {
    it('appends data as JSON after the message', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('Connection failed', { host: 'localhost', port: 6550 });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[godot-mcp] [error] Connection failed {"host":"localhost","port":6550}'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('rate limiting', () => {
    it('limits messages per key and uses separate limits for different keys', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      for (let i = 0; i < 15; i++) {
        logger.warningRateLimited('key-a', `message a${i}`);
      }
      const callsAfterKeyA = consoleSpy.mock.calls.length;
      // Exactly the per-window budget: not suppressed entirely, not unlimited.
      expect(callsAfterKeyA).toBe(10);

      for (let i = 0; i < 5; i++) {
        logger.warningRateLimited('key-b', `message b${i}`);
      }
      expect(consoleSpy.mock.calls.length).toBe(callsAfterKeyA + 5);

      consoleSpy.mockRestore();
    });
  });
});
