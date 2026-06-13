import { registry } from '../core/registry.js';
import { sceneTools } from './scene.js';
import { nodeTools } from './node.js';
import { editorTools } from './editor.js';
import { projectTools } from './project.js';
import { animationTools } from './animation.js';
import { tilemapTools } from './tilemap.js';
import { resourceTools } from './resource.js';
import { scene3dTools } from './scene3d.js';
import { docsTools } from './docs.js';
import { inputTools } from './input.js';
import { profilerTools } from './profiler.js';
import { runtimeStateTools } from './runtime-state.js';
import { gameTimeTools } from './game-time.js';
import { execTools } from './exec.js';
import { validateMeshesTools } from './validate-meshes.js';

export interface RegisterOptions {
  // Register only tools whose annotations declare readOnlyHint: true — a real
  // observation-only boundary for agents that should not modify the project.
  readOnly?: boolean;
}

export function registerAllTools(options: RegisterOptions = {}): void {
  const all = [
    ...sceneTools,
    ...nodeTools,
    ...editorTools,
    ...projectTools,
    ...animationTools,
    ...tilemapTools,
    ...resourceTools,
    ...scene3dTools,
    ...docsTools,
    ...inputTools,
    ...profilerTools,
    ...runtimeStateTools,
    ...gameTimeTools,
    ...execTools,
    ...validateMeshesTools,
  ];
  const tools = options.readOnly
    ? all.filter((tool) => tool.annotations?.readOnlyHint === true)
    : all;
  registry.registerTools(tools);
}

export { sceneTools } from './scene.js';
export { nodeTools } from './node.js';
export { editorTools } from './editor.js';
export { projectTools } from './project.js';
export { animationTools } from './animation.js';
export { tilemapTools } from './tilemap.js';
export { resourceTools } from './resource.js';
export { scene3dTools } from './scene3d.js';
export { docsTools } from './docs.js';
export { inputTools } from './input.js';
export { profilerTools } from './profiler.js';
export { runtimeStateTools } from './runtime-state.js';
export { gameTimeTools } from './game-time.js';
export { execTools } from './exec.js';
export { validateMeshesTools } from './validate-meshes.js';
