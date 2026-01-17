import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

interface QueuedMessage {
  level: LogLevel;
  logger: string;
  data: unknown;
}

const LOGGER_NAME = 'godot-mcp';
const MAX_QUEUE_SIZE = 100;
const RATE_LIMIT_WINDOW_MS = 5000;
const MAX_MESSAGES_PER_WINDOW = 10;

let mcpServer: Server | null = null;
let messageQueue: QueuedMessage[] = [];
const rateLimitCounts = new Map<string, { count: number; windowStart: number }>();

export function setMcpServer(server: Server): void {
  mcpServer = server;
  flushQueue();
}

function flushQueue(): void {
  for (const msg of messageQueue) {
    sendToMcp(msg.level, msg.data, msg.logger);
  }
  messageQueue = [];
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

function sendToMcp(level: LogLevel, data: unknown, loggerName: string = LOGGER_NAME): void {
  if (mcpServer) {
    mcpServer.sendLoggingMessage({ level, logger: loggerName, data }).catch(() => {});
  }
}

function log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  const logData = data ? { message, ...data } : message;

  // Send to MCP (for compliant clients)
  if (mcpServer) {
    sendToMcp(level, logData);
  } else if (messageQueue.length < MAX_QUEUE_SIZE) {
    messageQueue.push({ level, logger: LOGGER_NAME, data: logData });
  }

  // Write errors/warnings to stderr (visible during development)
  if (level === 'error' || level === 'critical' || level === 'warning') {
    console.error(`[${LOGGER_NAME}] [${level}] ${message}`);
  }
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
  mcpServer = null;
  messageQueue = [];
  rateLimitCounts.clear();
}

export function _getQueueForTesting(): QueuedMessage[] {
  return messageQueue;
}
