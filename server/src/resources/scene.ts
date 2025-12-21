import { defineResource } from '../core/define-resource.js';

export const currentSceneResource = defineResource({
  uri: 'godot://scene/current',
  name: 'Current Scene',
  description: 'The currently open scene in the Godot editor',
  mimeType: 'application/json',
  async handler({ godot }) {
    const result = await godot.sendCommand<{
      path: string | null;
      root_name: string | null;
      root_type: string | null;
    }>('get_current_scene');

    if (!result.path) {
      return JSON.stringify({ error: 'No scene currently open' });
    }

    return JSON.stringify({
      path: result.path,
      root: {
        name: result.root_name,
        type: result.root_type,
      },
    });
  },
});

export const sceneTreeResource = defineResource({
  uri: 'godot://scene/tree',
  name: 'Scene Tree',
  description: 'Full hierarchy of the current scene',
  mimeType: 'application/json',
  async handler({ godot }) {
    const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree');
    return JSON.stringify(result.tree, null, 2);
  },
});

export const sceneResources = [currentSceneResource, sceneTreeResource];
