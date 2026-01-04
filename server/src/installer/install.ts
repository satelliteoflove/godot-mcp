import { existsSync, cpSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface InstallResult {
  success: boolean;
  message: string;
  installedVersion?: string;
  previousVersion?: string;
}

export async function installAddon(projectPath: string): Promise<InstallResult> {
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

  let previousVersion: string | undefined;
  const existingPluginCfg = join(targetDir, 'plugin.cfg');
  if (existsSync(existingPluginCfg)) {
    previousVersion = parsePluginVersion(existingPluginCfg);
    rmSync(targetDir, { recursive: true });
  }

  if (!existsSync(addonsDir)) {
    mkdirSync(addonsDir, { recursive: true });
  }

  cpSync(bundledAddon, targetDir, { recursive: true });

  const installedVersion = parsePluginVersion(join(targetDir, 'plugin.cfg'));

  if (previousVersion) {
    return {
      success: true,
      message: `Updated addon from ${previousVersion} to ${installedVersion}`,
      installedVersion,
      previousVersion,
    };
  }

  return {
    success: true,
    message: `Installed addon version ${installedVersion}`,
    installedVersion,
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
