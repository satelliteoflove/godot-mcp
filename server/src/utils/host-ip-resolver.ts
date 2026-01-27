import { isWSL } from './wsl-detection.js';
import { resolveGateway } from './gateway-resolver.js';
import { logger } from './logger.js';

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
 * 2. Auto-detect gateway IP from /etc/resolv.conf (WSL2 only)
 * 3. Returns null if not in WSL or detection fails
 *
 * Result is cached to avoid repeated resolution attempts.
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

  // Auto-detect Windows host IP using gateway resolver
  try {
    const gateway = resolveGateway();
    if (gateway.gatewayIp) {
      cachedHostIp = gateway.gatewayIp;
      logger.debug('Auto-detected Windows host IP from gateway', { ip: cachedHostIp });
      return cachedHostIp;
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
