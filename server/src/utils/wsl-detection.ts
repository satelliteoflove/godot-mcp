import fs from 'fs';
import os from 'os';

/**
 * Detects if the current process is running in Windows Subsystem for Linux (WSL).
 * Uses a multi-signal detection approach for reliability:
 * 1. Environment variables (WSL_DISTRO_NAME, WSL_INTEROP) - fastest
 * 2. /proc/version file - most reliable on WSL2
 * 3. os.release() - fallback for other scenarios
 *
 * @returns true if running in WSL, false otherwise
 */
export function isWSL(): boolean {
  // Only WSL runs on Linux with these environment variables
  if (process.platform !== 'linux') {
    return false;
  }

  // Fast path: Check environment variables set by WSL
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) {
    return true;
  }

  // Reliable path: Check /proc/version (WSL2 specific)
  try {
    const versionContent = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
    if (versionContent.includes('microsoft')) {
      return true;
    }
  } catch {
    // /proc/version not available or not readable; continue to next detection method
  }

  // Fallback: Check kernel release
  try {
    const releaseInfo = os.release().toLowerCase();
    if (releaseInfo.includes('microsoft')) {
      return true;
    }
  } catch {
    // os.release() should never fail, but handle gracefully
  }

  return false;
}
