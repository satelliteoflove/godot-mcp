import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition, ImageContent } from '../core/types.js';

export const captureGameScreenshot = defineTool({
  name: 'capture_game_screenshot',
  description:
    'Capture a screenshot of the running game viewport. The project must be running.',
  schema: z.object({
    max_width: z
      .number()
      .optional()
      .describe('Maximum width in pixels (image will be scaled down if larger)'),
  }),
  async execute({ max_width }, { godot }) {
    const result = await godot.sendCommand<{
      image_base64: string;
      width: number;
      height: number;
    }>('capture_game_screenshot', { max_width });

    return {
      type: 'image',
      data: result.image_base64,
      mimeType: 'image/png',
    } as ImageContent;
  },
});

export const captureEditorScreenshot = defineTool({
  name: 'capture_editor_screenshot',
  description: 'Capture a screenshot of the editor 2D or 3D viewport',
  schema: z.object({
    viewport: z
      .enum(['2d', '3d'])
      .optional()
      .describe('Which viewport to capture (defaults to the currently active one)'),
    max_width: z
      .number()
      .optional()
      .describe('Maximum width in pixels (image will be scaled down if larger)'),
  }),
  async execute({ viewport, max_width }, { godot }) {
    const result = await godot.sendCommand<{
      image_base64: string;
      width: number;
      height: number;
    }>('capture_editor_screenshot', { viewport, max_width });

    return {
      type: 'image',
      data: result.image_base64,
      mimeType: 'image/png',
    } as ImageContent;
  },
});

export const screenshotTools = [
  captureGameScreenshot,
  captureEditorScreenshot,
] as AnyToolDefinition[];
