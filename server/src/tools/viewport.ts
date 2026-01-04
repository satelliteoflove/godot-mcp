import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface CameraData {
  viewport_index: number;
  global_position: Vector3;
  global_rotation: Vector3;
  fov: number;
  near: number;
  far: number;
  projection: string;
  size?: number;
}

interface ViewportCamera {
  position: Vector3;
  forward: Vector3;
  projection: string;
}

interface ViewportData {
  index: number;
  size: { width: number; height: number };
  camera?: ViewportCamera;
}

interface ViewportInfoResponse {
  viewport_count: number;
  viewports: ViewportData[];
}

const ViewportSchema = z.object({
  action: z
    .enum(['get_camera', 'get_viewports'])
    .describe(
      'Action: get_camera (detailed editor camera info), get_viewports (overview of all viewports)'
    ),
  viewport_index: z
    .number()
    .int()
    .min(0)
    .max(3)
    .optional()
    .default(0)
    .describe('Viewport index 0-3 for split views (get_camera only, defaults to 0)'),
});

type ViewportArgs = z.infer<typeof ViewportSchema>;

function formatVector3(v: Vector3): string {
  return `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
}

export const viewport = defineTool({
  name: 'viewport',
  description:
    'Get editor viewport and camera information. Use get_camera for detailed camera properties (position, rotation, FOV, projection). Use get_viewports for an overview of all active editor viewports.',
  schema: ViewportSchema,
  async execute(args: ViewportArgs, { godot }) {
    switch (args.action) {
      case 'get_camera': {
        const result = await godot.sendCommand<CameraData>('get_editor_camera', {
          viewport_index: args.viewport_index,
        });

        let output = `Editor Camera (viewport ${result.viewport_index}):\n`;
        output += `  position: ${formatVector3(result.global_position)}\n`;
        output += `  rotation: ${formatVector3(result.global_rotation)} rad\n`;
        output += `  projection: ${result.projection}\n`;

        if (result.projection === 'perspective') {
          output += `  fov: ${result.fov.toFixed(1)} deg\n`;
        } else {
          output += `  size: ${result.size?.toFixed(2) ?? 'unknown'}\n`;
        }

        output += `  near: ${result.near}, far: ${result.far}`;

        return output;
      }

      case 'get_viewports': {
        const result = await godot.sendCommand<ViewportInfoResponse>('get_viewport_info', {});

        if (result.viewport_count === 0) {
          return 'No active 3D editor viewports found';
        }

        let output = `Editor Viewports: ${result.viewport_count} active\n`;

        for (const vp of result.viewports) {
          output += `\nViewport ${vp.index}:\n`;
          output += `  size: ${vp.size.width}x${vp.size.height}\n`;

          if (vp.camera) {
            output += `  camera position: ${formatVector3(vp.camera.position)}\n`;
            output += `  looking: ${formatVector3(vp.camera.forward)}\n`;
            output += `  projection: ${vp.camera.projection}`;
          } else {
            output += `  (no camera)`;
          }
        }

        return output;
      }
    }
  },
});

export const viewportTools = [viewport] as AnyToolDefinition[];
