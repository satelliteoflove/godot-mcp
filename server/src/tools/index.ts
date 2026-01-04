import { registry } from '../core/registry.js';
import { sceneTools } from './scene.js';
import { nodeTools } from './node.js';
import { editorTools } from './editor.js';
import { projectTools } from './project.js';
import { animationTools } from './animation.js';
import { tilemapTools } from './tilemap.js';
import { resourceTools } from './resource.js';
import { scene3dTools } from './scene3d.js';

export function registerAllTools(): void {
  registry.registerTools(sceneTools);
  registry.registerTools(nodeTools);
  registry.registerTools(editorTools);
  registry.registerTools(projectTools);
  registry.registerTools(animationTools);
  registry.registerTools(tilemapTools);
  registry.registerTools(resourceTools);
  registry.registerTools(scene3dTools);
}

export { sceneTools } from './scene.js';
export { nodeTools } from './node.js';
export { editorTools } from './editor.js';
export { projectTools } from './project.js';
export { animationTools } from './animation.js';
export { tilemapTools } from './tilemap.js';
export { resourceTools } from './resource.js';
export { scene3dTools } from './scene3d.js';
