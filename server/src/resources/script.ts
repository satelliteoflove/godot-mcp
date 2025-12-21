import { defineResource } from '../core/define-resource.js';

export const currentScriptResource = defineResource({
  uri: 'godot://script/current',
  name: 'Current Script',
  description: 'The currently open script in the Godot editor',
  mimeType: 'text/x-gdscript',
  async handler({ godot }) {
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
  },
});

export const scriptResources = [currentScriptResource];
