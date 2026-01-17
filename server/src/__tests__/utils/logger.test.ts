import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger, setMcpServer, _resetForTesting, _getQueueForTesting } from '../../utils/logger.js';

describe('logger', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('queue behavior before server binding', () => {
    it('queues messages when no server is bound', () => {
      logger.info('test message');

      const queue = _getQueueForTesting();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toEqual({
        level: 'info',
        logger: 'godot-mcp',
        data: 'test message',
      });
    });

    it('queues messages with structured data', () => {
      logger.error('test error', { code: 123 });

      const queue = _getQueueForTesting();
      expect(queue).toHaveLength(1);
      expect(queue[0]).toEqual({
        level: 'error',
        logger: 'godot-mcp',
        data: { message: 'test error', code: 123 },
      });
    });

    it('respects max queue size', () => {
      for (let i = 0; i < 150; i++) {
        logger.info(`message ${i}`);
      }

      const queue = _getQueueForTesting();
      expect(queue.length).toBeLessThanOrEqual(100);
    });
  });

  describe('queue flush on server binding', () => {
    it('flushes queued messages when server is bound', () => {
      logger.info('queued message 1');
      logger.warning('queued message 2');

      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };

      setMcpServer(mockServer as never);

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledTimes(2);
      expect(mockServer.sendLoggingMessage).toHaveBeenNthCalledWith(1, {
        level: 'info',
        logger: 'godot-mcp',
        data: 'queued message 1',
      });
      expect(mockServer.sendLoggingMessage).toHaveBeenNthCalledWith(2, {
        level: 'warning',
        logger: 'godot-mcp',
        data: 'queued message 2',
      });

      const queue = _getQueueForTesting();
      expect(queue).toHaveLength(0);
    });
  });

  describe('log levels', () => {
    it('sends debug level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.debug('debug message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'debug',
        logger: 'godot-mcp',
        data: 'debug message',
      });
    });

    it('sends info level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.info('info message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'info',
        logger: 'godot-mcp',
        data: 'info message',
      });
    });

    it('sends notice level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.notice('notice message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'notice',
        logger: 'godot-mcp',
        data: 'notice message',
      });
    });

    it('sends warning level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.warning('warning message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'warning',
        logger: 'godot-mcp',
        data: 'warning message',
      });
    });

    it('sends error level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.error('error message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'error',
        logger: 'godot-mcp',
        data: 'error message',
      });
    });

    it('sends critical level correctly', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.critical('critical message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'critical',
        logger: 'godot-mcp',
        data: 'critical message',
      });
    });
  });

  describe('structured data formatting', () => {
    it('formats message with additional data', () => {
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

    it('handles nested objects in data', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.info('Diagnostics', {
        connection: { state: 'disconnected', attempts: 3 },
      });

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledWith({
        level: 'info',
        logger: 'godot-mcp',
        data: {
          message: 'Diagnostics',
          connection: { state: 'disconnected', attempts: 3 },
        },
      });
    });
  });

  describe('rate limiting', () => {
    it('allows first message through', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.warningRateLimited('test-key', 'rate limited message');

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledTimes(1);
    });

    it('blocks messages after limit exceeded', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      for (let i = 0; i < 15; i++) {
        logger.warningRateLimited('same-key', `message ${i}`);
      }

      expect(mockServer.sendLoggingMessage.mock.calls.length).toBeLessThanOrEqual(10);
    });

    it('uses separate limits for different keys', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      for (let i = 0; i < 5; i++) {
        logger.warningRateLimited('key-a', `message a${i}`);
        logger.warningRateLimited('key-b', `message b${i}`);
      }

      expect(mockServer.sendLoggingMessage).toHaveBeenCalledTimes(10);
    });
  });

  describe('error handling', () => {
    it('silently handles sendLoggingMessage failures', () => {
      const mockServer = {
        sendLoggingMessage: vi.fn().mockRejectedValue(new Error('send failed')),
      };
      setMcpServer(mockServer as never);

      expect(() => {
        logger.info('this should not throw');
      }).not.toThrow();
    });
  });

  describe('stderr output', () => {
    it('writes error level to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.error('test error');

      expect(consoleSpy).toHaveBeenCalledWith('[godot-mcp] [error] test error');
      consoleSpy.mockRestore();
    });

    it('writes warning level to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.warning('test warning');

      expect(consoleSpy).toHaveBeenCalledWith('[godot-mcp] [warning] test warning');
      consoleSpy.mockRestore();
    });

    it('writes critical level to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.critical('test critical');

      expect(consoleSpy).toHaveBeenCalledWith('[godot-mcp] [critical] test critical');
      consoleSpy.mockRestore();
    });

    it('does not write info level to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.info('test info');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('does not write debug level to stderr', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockServer = {
        sendLoggingMessage: vi.fn().mockResolvedValue(undefined),
      };
      setMcpServer(mockServer as never);

      logger.debug('test debug');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('writes to stderr even when no server is bound', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      logger.error('error without server');

      expect(consoleSpy).toHaveBeenCalledWith('[godot-mcp] [error] error without server');
      consoleSpy.mockRestore();
    });
  });
});
