import { isWSL } from './wsl-detection.js';
import { getHostIpInWSL } from './host-ip-resolver.js';
import { logger } from './logger.js';

/**
 * Determines the target host for Godot connections.
 *
 * Priority:
 * 1. GODOT_HOST env var (user-provided override)
 * 2. Auto-detected Windows host IP if in WSL (via getHostIpInWSL)
 * 3. '127.0.0.1' as fallback for native environments
 *
 * @returns The host address to connect to Godot
 */
export function getTargetHost(): string {
  // Check for explicit override
  if (process.env.GODOT_HOST) {
    const override = process.env.GODOT_HOST.trim();
    logger.debug('Using GODOT_HOST override', { host: override });
    return override;
  }

  // Try to auto-detect Windows host in WSL
  if (isWSL()) {
    const wslHostIp = getHostIpInWSL();
    if (wslHostIp) {
      logger.debug('Using auto-detected Windows host IP', { host: wslHostIp });
      return wslHostIp;
    }
    logger.warning(
      'WSL detected but could not auto-detect Windows host IP, falling back to localhost'
    );
  }

  // Default to localhost
  logger.debug('Using localhost as fallback');
  return '127.0.0.1';
}

/**
 * Gets comprehensive connection strategy information for diagnostics/logging.
 *
 * @returns Object containing current connection configuration
 */
export interface ConnectionStrategy {
  environment: 'wsl' | 'native';
  targetHost: string;
  wsUrl: string;
}

export function getConnectionStrategy(port: number): ConnectionStrategy {
  const environment = isWSL() ? 'wsl' : 'native';
  const targetHost = getTargetHost();
  const wsUrl = `ws://${targetHost}:${port}`;

  return {
    environment,
    targetHost,
    wsUrl,
  };
}
