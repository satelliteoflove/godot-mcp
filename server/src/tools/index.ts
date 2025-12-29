import { registry } from '../core/registry.js';
import { sceneTools } from './scene.js';
import { nodeTools } from './node.js';
import { scriptTools } from './script.js';
import { editorTools } from './editor.js';
import { projectTools } from './project.js';
import { screenshotTools } from './screenshot.js';
import { animationTools } from './animation.js';
import { tilemapTools } from './tilemap.js';
import { resourceTools } from './resource.js';

export function registerAllTools(): void {
  registry.registerTools(sceneTools);
  registry.registerTools(nodeTools);
  registry.registerTools(scriptTools);
  registry.registerTools(editorTools);
  registry.registerTools(projectTools);
  registry.registerTools(screenshotTools);
  registry.registerTools(animationTools);
  registry.registerTools(tilemapTools);
  registry.registerTools(resourceTools);
}

export { sceneTools } from './scene.js';
export { nodeTools } from './node.js';
export { scriptTools } from './script.js';
export { editorTools } from './editor.js';
export { projectTools } from './project.js';
export { screenshotTools } from './screenshot.js';
export { animationTools } from './animation.js';
export { tilemapTools } from './tilemap.js';
export { resourceTools } from './resource.js';
