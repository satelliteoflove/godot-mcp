import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logToolUsage, categorizeError } from '../../utils/usage-logger.js';
import {
  GodotCommandError,
  GodotConnectionError,
  GodotTimeoutError,
} from '../../utils/errors.js';
import { ZodError } from 'zod';

const LOG_DIR = path.join(os.homedir(), '.godot-mcp');
const LOG_FILE = path.join(LOG_DIR, 'usage.log');

describe('usage-logger', () => {
  describe('categorizeError', () => {
    it('returns "connection" for GodotConnectionError', () => {
      const error = new GodotConnectionError('connection failed');
      expect(categorizeError(error)).toBe('connection');
    });

    it('returns "timeout" for GodotTimeoutError', () => {
      const error = new GodotTimeoutError('test_command', 5000);
      expect(categorizeError(error)).toBe('timeout');
    });

    it('returns "command" for GodotCommandError', () => {
      const error = new GodotCommandError('ERR_CODE', 'command failed');
      expect(categorizeError(error)).toBe('command');
    });

    it('returns "validation" for ZodError', () => {
      const error = new ZodError([]);
      expect(categorizeError(error)).toBe('validation');
    });

    it('returns "error" for generic Error', () => {
      const error = new Error('generic error');
      expect(categorizeError(error)).toBe('error');
    });

    it('returns "unknown" for non-Error values', () => {
      expect(categorizeError(null)).toBe('unknown');
      expect(categorizeError('string')).toBe('unknown');
    });
  });

  describe('logToolUsage', () => {
    let originalEnv: string | undefined;
    let originalLogContent: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.GODOT_MCP_USAGE_LOG;
      if (fs.existsSync(LOG_FILE)) {
        originalLogContent = fs.readFileSync(LOG_FILE, 'utf-8');
      }
    });

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.GODOT_MCP_USAGE_LOG;
      } else {
        process.env.GODOT_MCP_USAGE_LOG = originalEnv;
      }
      if (originalLogContent !== undefined) {
        fs.writeFileSync(LOG_FILE, originalLogContent, 'utf-8');
      }
    });

    it('does not write when disabled via env var', () => {
      process.env.GODOT_MCP_USAGE_LOG = 'false';
      const sizeBefore = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;

      logToolUsage('test_tool_disabled', {}, true, 100, 500);

      const sizeAfter = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE).size : 0;
      expect(sizeAfter).toBe(sizeBefore);
    });

    it('writes valid JSON entry when enabled', () => {
      process.env.GODOT_MCP_USAGE_LOG = 'true';

      logToolUsage('test_tool', { action: 'test_action' }, true, 123, 456);

      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.trim().split('\n');
      const lastEntry = JSON.parse(lines[lines.length - 1]);

      expect(lastEntry.tool).toBe('test_tool');
      expect(lastEntry.ts).toBeDefined();
    });
  });
});
