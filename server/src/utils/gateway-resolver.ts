import fs from 'fs';
import os from 'os';
import { logger } from './logger.js';

/**
 * Represents different network environments.
 */
export type GatewayEnvironment = 'wsl2' | 'wsl1' | 'linux' | 'windows' | 'macos';

export interface GatewayInfo {
  environment: GatewayEnvironment;
  gatewayIp: string | null;
  source?: string; // Where the gateway was resolved from (e.g., '/proc/net/route', '/etc/resolv.conf')
}

/**
 * Detects the current Linux environment (WSL1, WSL2, or native Linux) and resolves the gateway IP.
 * Gateway detection is only supported for Linux/WSL environments.
 * For other platforms, returns the environment type with null gateway.
 *
 * @returns Gateway information for the current environment
 */
export function resolveGateway(): GatewayInfo {
  const platform = process.platform;

  // Linux-based systems (including WSL1 and WSL2)
  if (platform === 'linux') {
    const wslEnv = detectWSLVersion();
    
    // Try /proc/net/route first (works for all Linux variants)
    const gatewayIp = resolveLinuxGateway();
    if (gatewayIp) {
      return {
        environment: wslEnv || 'linux',
        gatewayIp,
        source: '/proc/net/route',
      };
    }

    // WSL2 fallback: try /etc/resolv.conf (more reliable than /proc/net/route in some WSL2 setups)
    if (wslEnv === 'wsl2') {
      const wslGateway = resolveWSL2Nameserver();
      if (wslGateway) {
        return {
          environment: 'wsl2',
          gatewayIp: wslGateway,
          source: '/etc/resolv.conf',
        };
      }
    }

    return { environment: wslEnv || 'linux', gatewayIp: null };
  }

  // Non-Linux platforms: gateway detection not supported
  if (platform === 'win32') {
    return { environment: 'windows', gatewayIp: null };
  }

  if (platform === 'darwin') {
    return { environment: 'macos', gatewayIp: null };
  }

  return { environment: 'linux', gatewayIp: null };
}

/**
 * Detects if running in WSL1 or WSL2.
 * Returns the WSL version or null if not running in WSL.
 */
function detectWSLVersion(): 'wsl2' | 'wsl1' | null {
  // Fast check: environment variables set by WSL
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    // Determine if WSL1 or WSL2 by checking /proc/version
    try {
      const versionContent = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
      if (versionContent.includes('microsoft')) {
        return 'wsl2';
      }
    } catch {
      // If we can't read /proc/version, assume WSL1
      return 'wsl1';
    }
  }

  // Fallback: Check kernel release for Microsoft markers
  try {
    const releaseInfo = os.release().toLowerCase();
    if (releaseInfo.includes('microsoft')) {
      // Can't distinguish reliably, assume WSL2 as it's more common
      return 'wsl2';
    }
  } catch {
    // os.release() should never fail, but handle gracefully
  }

  return null;
}

/**
 * Resolves gateway IP on Linux by parsing /proc/net/route.
 * Format: destination gateway flags refcnt use metric mask mtu window irtt
 * Default route has destination=00000000
 * Gateway is in hex format and needs conversion to dotted decimal.
 */
function resolveLinuxGateway(): string | null {
  try {
    const routeContent = fs.readFileSync('/proc/net/route', 'utf8');
    const lines = routeContent.split('\n');

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      // Skip header line and non-default routes
      if (parts[0] === 'Iface' || parts[1] !== '00000000') continue;

      // Gateway is the second field (index 2), stored as hex
      const gatewayHex = parts[2];
      const gatewayIp = convertHexToIp(gatewayHex);

      if (gatewayIp && isValidIPv4(gatewayIp)) {
        logger.debug('Linux gateway resolved from /proc/net/route', { ip: gatewayIp });
        return gatewayIp;
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug('Failed to resolve Linux gateway from /proc/net/route', { error: errorMessage });
  }

  return null;
}

/**
 * Converts 8-character hex string (little-endian) to dotted decimal IP.
 * Example: "0101A8C0" → "192.168.1.1" (bytes reversed)
 */
function convertHexToIp(hex: string): string | null {
  if (hex.length !== 8) return null;

  try {
    // Hex is little-endian, so reverse it
    const bytes = [];
    for (let i = 6; i >= 0; i -= 2) {
      bytes.push(parseInt(hex.substring(i, i + 2), 16));
    }

    if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) {
      return null;
    }

    return bytes.join('.');
  } catch {
    return null;
  }
}

/**
 * Resolves gateway IP on WSL2 by reading /etc/resolv.conf nameserver.
 * In WSL2, the Windows host can be reached via the nameserver IP.
 */
function resolveWSL2Nameserver(): string | null {
  try {
    const resolvConf = fs.readFileSync('/etc/resolv.conf', 'utf8');
    const lines = resolvConf.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('nameserver ')) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 2) {
          const ip = parts[1];
          if (isValidIPv4(ip)) {
            logger.debug('WSL2 gateway resolved from /etc/resolv.conf', { ip });
            return ip;
          }
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.debug('Failed to resolve WSL2 gateway from /etc/resolv.conf', { error: errorMessage });
  }

  return null;
}

/**
 * Validates if a string is a valid IPv4 address.
 */
function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !Number.isNaN(num) && num >= 0 && num <= 255;
  });
}
