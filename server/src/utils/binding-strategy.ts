import { isWSL } from './wsl-detection.js';
import { getHostIpInWSL } from './host-ip-resolver.js';
import { logger } from './logger.js';

/**
 * Determines the IP address the MCP server's WebSocket server should bind to.
 *
 * Strategy:
 * - '0.0.0.0' if running in WSL (allows Windows host connections)
 * - '127.0.0.1' if running natively (localhost only)
 */
export function getBindAddress(): string {
  if (isWSL()) {
    logger.debug('WSL detected, binding to 0.0.0.0 for external access');
    return '0.0.0.0';
  }

  logger.debug('Native environment detected, binding to 127.0.0.1 for local access');
  return '127.0.0.1';
}

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
    const wsLHostIp = getHostIpInWSL();
    if (wsLHostIp) {
      logger.debug('Using auto-detected Windows host IP', { host: wsLHostIp });
      return wsLHostIp;
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
 * Gets comprehensive binding strategy information for diagnostics/logging.
 *
 * @returns Object containing current binding configuration
 */
export interface BindingStrategy {
  environment: 'wsl' | 'native';
  bindAddress: string;
  targetHost: string;
  wsUrl: string;
}

export function getBindingStrategy(port: number): BindingStrategy {
  const environment = isWSL() ? 'wsl' : 'native';
  const bindAddress = getBindAddress();
  const targetHost = getTargetHost();

  // Note: WebSocket URL always uses targetHost, not bindAddress
  const wsUrl = `ws://${targetHost}:${port}`;

  return {
    environment,
    bindAddress,
    targetHost,
    wsUrl,
  };
}
