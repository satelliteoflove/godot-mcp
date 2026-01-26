import { execSync } from 'child_process';
import { isWSL } from './wsl-detection.js';
import { logger } from './logger.js';

/**
 * Regex to match valid IPv4 addresses
 */
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Validates if a string is a valid IPv4 address
 */
function isValidIPv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false;
  const parts = ip.split('.').map(Number);
  return parts.every((part) => part >= 0 && part <= 255);
}

/**
 * Cache for resolved Windows host IP (resolved during session)
 */
let cachedHostIp: string | null | undefined;

/**
 * Retrieves the Windows host IP when running in WSL.
 * In WSL, the Windows host can be reached via the gateway IP.
 *
 * Priority:
 * 1. GODOT_HOST env var (user-provided override)
 * 2. Auto-detect via 'ip route' command (WSL only)
 * 3. Returns null if not in WSL or detection fails
 *
 * Result is cached to avoid repeated command execution.
 *
 * @returns The Windows host IP address, or null if not found
 */
export function getHostIpInWSL(): string | null {
  // Return cached result if already resolved
  if (cachedHostIp !== undefined) {
    return cachedHostIp === null ? null : cachedHostIp;
  }

  // Check explicit overrides first
  if (process.env.GODOT_HOST) {
    cachedHostIp = process.env.GODOT_HOST;
    logger.debug('Using GODOT_HOST env var for host IP', { ip: cachedHostIp });
    return cachedHostIp;
  }


  // Only auto-detect in WSL environment
  if (!isWSL()) {
    cachedHostIp = null;
    return null;
  }

  // Auto-detect Windows host IP from ip route
  try {
    const routeOutput = execSync("ip route | awk '/default/ {print $3}'", {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (routeOutput && isValidIPv4(routeOutput)) {
      cachedHostIp = routeOutput;
      logger.debug('Auto-detected Windows host IP', { ip: cachedHostIp });
      return cachedHostIp;
    }

    if (routeOutput) {
      logger.warning('Auto-detected host IP is not a valid IPv4 address', {
        value: routeOutput,
      });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warning('Failed to auto-detect Windows host IP', { error: errorMessage });
  }

  // Cache failed detection to avoid repeated attempts
  cachedHostIp = null;
  return null;
}

/**
 * Clears the cached host IP. Used for testing purposes.
 */
export function _clearHostIpCache(): void {
  cachedHostIp = undefined;
}
