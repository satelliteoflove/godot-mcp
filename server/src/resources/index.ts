import { registry } from '../core/registry.js';
import { sceneResources } from './scene.js';
import { scriptResources } from './script.js';

export function registerAllResources(): void {
  registry.registerResources(sceneResources);
  registry.registerResources(scriptResources);
}

export { sceneResources } from './scene.js';
export { scriptResources } from './script.js';
