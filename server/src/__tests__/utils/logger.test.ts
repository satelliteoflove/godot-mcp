import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, setMcpServer, _resetForTesting, _getQueueForTesting } from '../../utils/logger.js';

describe('logger', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('queue behavior', () => {
    it('queues messages when no server is bound and flushes on bind', () => {
      logger.info('queued message');
      logger.error('queued error', { code: 123 });

      const queue = _getQueueForTesting();
      expect(queue).toHaveLength(2);

      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledTimes(2);
      expect(_getQueueForTesting()).toHaveLength(0);
    });

    it('respects max queue size of 100', () => {
      for (let i = 0; i < 150; i++) {
        logger.info(`message ${i}`);
      }
      expect(_getQueueForTesting().length).toBeLessThanOrEqual(100);
    });
  });

  describe('log levels', () => {
    const levels = ['debug', 'info', 'notice', 'warning', 'error', 'critical'] as const;

    it.each(levels)('sends %s level correctly', (level) => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger[level](`${level} message`);

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level,
        logger: 'godot-mcp',
        data: `${level} message`,
      });
    });
  });

  describe('structured data', () => {
    it('formats message with additional data as object', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.error('Connection failed', { host: 'localhost', port: 6550 });

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'error',
        logger: 'godot-mcp',
        data: { message: 'Connection failed', host: 'localhost', port: 6550 },
      });
    });
  });

  describe('rate limiting', () => {
    it('limits messages per key and uses separate limits for different keys', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      for (let i = 0; i < 15; i++) {
        logger.warningRateLimited('key-a', `message a${i}`);
      }
      const callsAfterKeyA = mockServer.sendLoggingMessage.mock.calls.length;
      expect(callsAfterKeyA).toBeLessThanOrEqual(10);

      for (let i = 0; i < 5; i++) {
        logger.warningRateLimited('key-b', `message b${i}`);
      }
      expect(mockServer.sendLoggingMessage.mock.calls.length).toBe(callsAfterKeyA + 5);
    });
  });

  describe('stderr output', () => {
    it('writes warning/error/critical to stderr, not info/debug', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.debug('debug');
      logger.info('info');
      expect(consoleSpy).not.toHaveBeenCalled();

      logger.warning('warning');
      logger.error('error');
      logger.critical('critical');
      expect(consoleSpy).toHaveBeenCalledTimes(3);

      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('silently handles sendLoggingMessage failures', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockRejectedValue(new Error('send failed')),
      };
      setMcpServer(mockServer as never);

      expect(() => logger.info('this should not throw')).not.toThrow();
    });
  });
});
