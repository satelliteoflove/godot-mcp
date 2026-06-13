import { describe, it, expect } from 'vitest';
import {
  getActionVariants,
  buildVariantExample,
  rawJsonSchema,
  exampleForProp,
} from '../../core/doc-examples.js';
import {
  sceneTools,
  nodeTools,
  editorTools,
  projectTools,
  animationTools,
  tilemapTools,
  resourceTools,
  scene3dTools,
  docsTools,
  inputTools,
  profilerTools,
  runtimeStateTools,
  gameTimeTools,
  execTools,
  validateMeshesTools,
} from '../../tools/index.js';
import type { AnyToolDefinition } from '../../core/types.js';

const ALL_TOOLS: AnyToolDefinition[] = [
  ...sceneTools,
  ...nodeTools,
  ...editorTools,
  ...projectTools,
  ...animationTools,
  ...tilemapTools,
  ...resourceTools,
  ...scene3dTools,
  ...docsTools,
  ...inputTools,
  ...profilerTools,
  ...runtimeStateTools,
  ...gameTimeTools,
  ...execTools,
  ...validateMeshesTools,
];

// Tool + each of its action variants, as the doc generator sees them.
const ACTION_CASES = ALL_TOOLS.flatMap((tool) => {
  const variants = getActionVariants(rawJsonSchema(tool));
  return variants ? variants.map((variant) => ({ tool, variant })) : [];
});

function variantOf(toolName: string, action: string) {
  const tool = ALL_TOOLS.find((t) => t.name === toolName)!;
  const variant = getActionVariants(rawJsonSchema(tool))!.find((v) => v.action === action)!;
  return { tool, variant };
}

describe('generated doc examples (#287)', () => {
  it('discovers action variants across the tool surface', () => {
    // Guards the whole premise: if union detection regresses, every per-action
    // doc would silently fall back to the flat path again.
    const toolsWithActions = new Set(ACTION_CASES.map((c) => c.tool.name));
    expect(toolsWithActions.size).toBeGreaterThanOrEqual(14);
    expect(ACTION_CASES.length).toBeGreaterThan(50);
  });

  // Defect 1: every generated example must satisfy the REAL Zod schema —
  // including discriminator-only actions, schema-required fields, and refines.
  it.each(ACTION_CASES.map((c) => [`${c.tool.name}:${c.variant.action}`, c] as const))(
    'emits a schema-valid example for %s',
    (_label, { tool, variant }) => {
      const example = buildVariantExample(variant, tool.schema);
      const result = tool.schema.safeParse(example);
      expect(result.success, JSON.stringify(example)).toBe(true);
    }
  );

  // Defect 2: each action literal's .describe() must be available to render
  // under the action heading (no more empty Actions sections).
  it.each(ACTION_CASES.map((c) => [`${c.tool.name}:${c.variant.action}`, c] as const))(
    'carries an action description for %s',
    (_label, { variant }) => {
      const desc = String(variant.properties.action?.description ?? '').trim();
      expect(desc.length).toBeGreaterThan(0);
    }
  );

  it('includes schema-required fields beyond the discriminator (exec run -> source, remove -> name)', () => {
    const run = variantOf('godot_exec', 'run');
    expect(buildVariantExample(run.variant, run.tool.schema)).toMatchObject({
      action: 'run',
      source: expect.any(String),
    });

    const remove = variantOf('godot_exec', 'remove');
    expect(buildVariantExample(remove.variant, remove.tool.schema)).toMatchObject({
      action: 'remove',
      name: expect.any(String),
    });
  });

  it('satisfies a refine that JSON Schema cannot express (watch_start needs specs or signals)', () => {
    const { tool, variant } = variantOf('godot_runtime_state', 'watch_start');
    const example = buildVariantExample(variant, tool.schema);
    // Required-only would be {action} and fail the refine; augmentation must add one.
    const hasSpecs = Array.isArray((example as Record<string, unknown>).specs) && (example.specs as unknown[]).length > 0;
    const hasSignals = Array.isArray((example as Record<string, unknown>).signals) && (example.signals as unknown[]).length > 0;
    expect(hasSpecs || hasSignals).toBe(true);
  });

  it('does not over-specify actions that need only the discriminator (watch_collect)', () => {
    const { tool, variant } = variantOf('godot_runtime_state', 'watch_collect');
    const example = buildVariantExample(variant, tool.schema);
    expect(example).toEqual({ action: 'watch_collect' });
  });

  describe('exampleForProp', () => {
    it('builds a non-empty array from its items schema', () => {
      const val = exampleForProp('paths', { type: 'array', items: { type: 'string' } });
      expect(val).toEqual(['example']);
    });

    it('builds a union-typed array entry from the first branch (input sequence entries)', () => {
      const { tool } = variantOf('godot_input', 'sequence');
      const example = buildVariantExample(
        getActionVariants(rawJsonSchema(tool))!.find((v) => v.action === 'sequence')!,
        tool.schema
      );
      const inputs = (example as Record<string, unknown>).inputs as unknown[];
      expect(Array.isArray(inputs)).toBe(true);
      expect(inputs.length).toBeGreaterThan(0);
      expect(inputs[0]).not.toBeNull();
    });

    it('respects a numeric lower bound', () => {
      expect(exampleForProp('hz', { type: 'integer', minimum: 1 })).toBe(1);
    });

    it('only populates required object fields', () => {
      const val = exampleForProp('spec', {
        type: 'object',
        properties: { path: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } } },
        required: ['path'],
      }) as Record<string, unknown>;
      expect(val).toEqual({ path: '/root/Main/Player' });
    });
  });
});
