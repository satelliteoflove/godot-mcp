import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const LOG_DIR = path.join(os.homedir(), '.godot-mcp');
const LOG_FILE = path.join(LOG_DIR, 'usage.log');

interface UsageEntry {
  ts: string;
  tool: string;
  action?: string;
  success: boolean;
  duration_ms: number;
  response_bytes: number;
  error_type?: string;
}

function isEnabled(): boolean {
  const envValue = process.env.GODOT_MCP_USAGE_LOG;
  if (envValue === undefined) return true; // default on
  return envValue === '1' || envValue.toLowerCase() === 'true';
}

function getMaxSizeBytes(): number {
  const envValue = process.env.GODOT_MCP_USAGE_LOG_MAX_SIZE;
  if (!envValue) return DEFAULT_MAX_SIZE_BYTES;
  const parsed = parseInt(envValue, 10);
  return isNaN(parsed) ? DEFAULT_MAX_SIZE_BYTES : parsed;
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function rotateIfNeeded(): void {
  if (!fs.existsSync(LOG_FILE)) return;

  const stats = fs.statSync(LOG_FILE);
  if (stats.size < getMaxSizeBytes()) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rotatedPath = path.join(LOG_DIR, `usage-${timestamp}.log`);
  fs.renameSync(LOG_FILE, rotatedPath);
}

function writeEntry(entry: UsageEntry): void {
  try {
    ensureLogDir();
    rotateIfNeeded();
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {
    // Silently fail - usage logging should never break the tool
  }
}

export function logToolUsage(
  tool: string,
  args: Record<string, unknown>,
  success: boolean,
  durationMs: number,
  responseBytes: number,
  errorType?: string
): void {
  if (!isEnabled()) return;

  const entry: UsageEntry = {
    ts: new Date().toISOString(),
    tool,
    success,
    duration_ms: Math.round(durationMs),
    response_bytes: responseBytes,
  };

  if (typeof args.action === 'string') {
    entry.action = args.action;
  }

  if (errorType) {
    entry.error_type = errorType;
  }

  writeEntry(entry);
}

export function categorizeError(error: unknown): string {
  if (!error) return 'unknown';

  if (error instanceof Error) {
    const name = error.name;
    if (name === 'GodotConnectionError') return 'connection';
    if (name === 'GodotTimeoutError') return 'timeout';
    if (name === 'GodotCommandError') return 'command';
    if (name === 'ZodError') return 'validation';
    return 'error';
  }

  return 'unknown';
}
