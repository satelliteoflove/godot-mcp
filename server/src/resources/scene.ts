import { getGodotConnection } from '../connection/websocket.js';

export const sceneResources = [
  {
    uri: 'godot://scene/current',
    name: 'Current Scene',
    description: 'The currently open scene in the Godot editor',
    mimeType: 'application/json',
  },
  {
    uri: 'godot://scene/tree',
    name: 'Scene Tree',
    description: 'Full hierarchy of the current scene',
    mimeType: 'application/json',
  },
];

export async function handleSceneResource(uri: string): Promise<string> {
  const godot = getGodotConnection();

  if (uri === 'godot://scene/current') {
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
  }

  if (uri === 'godot://scene/tree') {
    const result = await godot.sendCommand<{ tree: unknown }>('get_scene_tree');
    return JSON.stringify(result.tree, null, 2);
  }

  throw new Error(`Unknown scene resource: ${uri}`);
}
