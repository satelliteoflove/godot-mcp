import { existsSync, cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InstallResult {
  success: boolean;
  message: string;
  installedVersion?: string;
  previousVersion?: string;
  skipped?: boolean;
}

export interface InstallOptions {
  force?: boolean;
}

export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA > numB) return 1;
    if (numA < numB) return -1;
  }
  return 0;
}

export async function installAddon(projectPath: string, options: InstallOptions = {}): Promise<InstallResult> {
  const absolutePath = resolve(projectPath);

  if (!existsSync(absolutePath)) {
    return {
      success: false,
      message: `Path does not exist: ${absolutePath}`,
    };
  }

  const projectFile = join(absolutePath, 'project.godot');
  if (!existsSync(projectFile)) {
    return {
      success: false,
      message: `Not a Godot project: ${absolutePath} (no project.godot found)`,
    };
  }

  const __dirname = fileURLToPath(new URL('.', import.meta.url));
  const bundledAddon = join(__dirname, '..', '..', 'addon');

  if (!existsSync(bundledAddon)) {
    return {
      success: false,
      message:
        'Addon not found in package. This may be a development install - run "npm run build" first.',
    };
  }

  const addonsDir = join(absolutePath, 'addons');
  const targetDir = join(addonsDir, 'godot_mcp');

  const bundledVersion = parsePluginVersion(join(bundledAddon, 'plugin.cfg'));
  if (!bundledVersion) {
    return {
      success: false,
      message: 'Could not determine bundled addon version',
    };
  }

  let previousVersion: string | undefined;
  const existingPluginCfg = join(targetDir, 'plugin.cfg');
  if (existsSync(existingPluginCfg)) {
    previousVersion = parsePluginVersion(existingPluginCfg);

    if (previousVersion) {
      const comparison = compareVersions(bundledVersion, previousVersion);

      if (comparison < 0 && !options.force) {
        return {
          success: true,
          skipped: true,
          message: `Addon version ${previousVersion} is newer than bundled version ${bundledVersion}. Use --force to downgrade.`,
          installedVersion: previousVersion,
          previousVersion,
        };
      }

      if (comparison === 0) {
        return {
          success: true,
          skipped: true,
          message: `Addon is already up to date (version ${previousVersion})`,
          installedVersion: previousVersion,
          previousVersion,
        };
      }
    }

    rmSync(targetDir, { recursive: true });
  }

  if (!existsSync(addonsDir)) {
    mkdirSync(addonsDir, { recursive: true });
  }

  cpSync(bundledAddon, targetDir, { recursive: true });

  if (previousVersion) {
    const comparison = compareVersions(bundledVersion, previousVersion);
    if (comparison < 0) {
      return {
        success: true,
        message: `Downgraded addon from ${previousVersion} to ${bundledVersion} (forced)`,
        installedVersion: bundledVersion,
        previousVersion,
      };
    }
    return {
      success: true,
      message: `Updated addon from ${previousVersion} to ${bundledVersion}`,
      installedVersion: bundledVersion,
      previousVersion,
    };
  }

  return {
    success: true,
    message: `Installed addon version ${bundledVersion}`,
    installedVersion: bundledVersion,
  };
}

function parsePluginVersion(pluginCfgPath: string): string | undefined {
  try {
    const content = readFileSync(pluginCfgPath, 'utf-8');
    const match = content.match(/^version="([^"]+)"/m);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function getAddonStatus(projectPath: string): {
  installed: boolean;
  version?: string;
  path?: string;
} {
  const absolutePath = resolve(projectPath);
  const targetDir = join(absolutePath, 'addons', 'godot_mcp');
  const pluginCfg = join(targetDir, 'plugin.cfg');

  if (!existsSync(pluginCfg)) {
    return { installed: false };
  }

  return {
    installed: true,
    version: parsePluginVersion(pluginCfg),
    path: targetDir,
  };
}
