import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
import type { AnyToolDefinition } from '../core/types.js';

interface MeshFinding {
  node: string;
  surface: number;
  severity: 'error' | 'warning';
  kind: string;
  stat: string;
  fix: string;
}

interface ValidateMeshesResponse {
  checked_meshes: number;
  checked_surfaces: number;
  total_findings: number;
  findings: MeshFinding[];
  note?: string;
}

const ValidateMeshesSchema = z.object({
  max_findings: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Cap on findings returned (default 25). The total count is always reported.'),
});

export const validateMeshes = defineTool({
  name: 'godot_validate_meshes',
  annotations: {
    title: 'Validate Meshes',
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  description:
    'Check every code-built (ArrayMesh) surface in the RUNNING game for silent data corruption ' +
    'that renders WITHOUT any error. Run this FIRST when rendering looks wrong and no error is ' +
    'reported anywhere: surfaces pure black or far too dark, floors/walls invisible or ' +
    'see-through, geometry visible from only one side, lighting that ignores light-energy ' +
    'changes, scenes that "tuning" cannot fix. Detects: inside-out or mixed triangle winding ' +
    '(Godot front faces wind clockwise — wrong winding = culled faces or inverted lighting ' +
    'normals), dropped triangles / orphaned vertices (e.g. SurfaceTool.append_from of an ' +
    'indexed mesh mixed with raw add_vertex silently discards most of the batch), degenerate ' +
    'UVs that make generate_tangents() emit garbage, and NaN/zero normals or tangents. Every ' +
    'finding includes its likely cause and the fix. Read-only and cheap. Walks the current ' +
    'scene only (meshes parented elsewhere under root are not seen). Also run it after ' +
    'writing or changing mesh-generation code — BEFORE spending time tuning lights or ' +
    'materials to rescue a "too dark" scene.',
  schema: ValidateMeshesSchema,

  async execute(args, { godot }) {
    const result = await godot.sendCommand<ValidateMeshesResponse>('validate_meshes', {
      max_findings: args.max_findings ?? 25,
    });
    // Nothing checked is NOT a clean bill — saying "no problems" over zero
    // evidence is exactly the confident-lie failure mode this tool exists to
    // prevent.
    if (result.checked_surfaces === 0) {
      const reason = result.note ?? 'the current scene has no code-built (ArrayMesh) triangle surfaces';
      return (
        `No mesh data was validated (${reason}). ` +
        'This is NOT a clean bill — nothing was checked. Engine primitives (BoxMesh, etc.) and ' +
        'imported scenes parented outside the current scene are not covered.'
      );
    }
    if (result.total_findings === 0) {
      return (
        `Checked ${result.checked_meshes} meshes (${result.checked_surfaces} surfaces) — no integrity problems. ` +
        'This rules out winding, dropped triangles, degenerate UVs/tangents, and NaN data. ' +
        'If rendering still looks wrong, the cause is lighting or materials, not mesh data — ' +
        'note that SDFGI replaces constant ambient light, so shadow-side fill must come from a ' +
        'shadowless fill DirectionalLight rather than ambient_light_energy.'
      );
    }
    return structured(result);
  },
});

export const validateMeshesTools = [validateMeshes] as AnyToolDefinition[];
