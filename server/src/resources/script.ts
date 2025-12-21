import { getGodotConnection } from '../connection/websocket.js';

export const scriptResources = [
  {
    uri: 'godot://script/current',
    name: 'Current Script',
    description: 'The currently open script in the Godot editor',
    mimeType: 'text/x-gdscript',
  },
];

export async function handleScriptResource(uri: string): Promise<string> {
  const godot = getGodotConnection();

  if (uri === 'godot://script/current') {
    const result = await godot.sendCommand<{
      path: string | null;
      content: string | null;
    }>('get_current_script');

    if (!result.path) {
      return JSON.stringify({ error: 'No script currently open' });
    }

    return JSON.stringify({
      path: result.path,
      content: result.content,
    });
  }

  throw new Error(`Unknown script resource: ${uri}`);
}
