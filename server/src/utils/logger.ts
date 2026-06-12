type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical';

const LOGGER_NAME = 'godot-mcp';
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_MESSAGES_PER_WINDOW = 10;

// stdio servers log to stderr (spec 2025-11-25 blesses this explicitly); the
// MCP logging capability is not declared, so no notifications/message is sent.
// debug/info/notice are gated behind GODOT_MCP_VERBOSE to keep stderr quiet in
// normal operation — warnings and errors always print.
const VERBOSE_LEVELS: ReadonlySet<LogLevel> = new Set(['debug', 'info', 'notice']);

const rateLimitCounts = new Map<string, { count: number; windowStart: number }>();

function isVerboseEnabled(): boolean {
  const envValue = process.env.GODOT_MCP_VERBOSE;
  return envValue === '1' || envValue?.toLowerCase() === 'true';
}

function shouldRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitCounts.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitCounts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_MESSAGES_PER_WINDOW;
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (VERBOSE_LEVELS.has(level) && !isVerboseEnabled()) return;
  const suffix = data ? ` ${JSON.stringify(data)}` : '';
  console.error(`[${LOGGER_NAME}] [${level}] ${message}${suffix}`);
}

function logRateLimited(level: LogLevel, key: string, message: string, data?: Record<string, unknown>): void {
  if (!shouldRateLimit(key)) {
    log(level, message, data);
  }
}

export const logger = {
  debug: (message: string, data?: Record<string, unknown>) => log('debug', message, data),
  info: (message: string, data?: Record<string, unknown>) => log('info', message, data),
  notice: (message: string, data?: Record<string, unknown>) => log('notice', message, data),
  warning: (message: string, data?: Record<string, unknown>) => log('warning', message, data),
  error: (message: string, data?: Record<string, unknown>) => log('error', message, data),
  critical: (message: string, data?: Record<string, unknown>) => log('critical', message, data),
  warningRateLimited: (key: string, message: string, data?: Record<string, unknown>) =>
    logRateLimited('warning', key, message, data),
};

export function _resetForTesting(): void {
  rateLimitCounts.clear();
}
