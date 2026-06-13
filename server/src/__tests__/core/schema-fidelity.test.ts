import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { toInputSchema, validActions, describeValidationError } from '../../core/schema.js';
import { scene } from '../../tools/scene.js';
import { runtimeState } from '../../tools/runtime-state.js';

type JsonSchema = Record<string, unknown>;

const TestUnion = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('alpha').describe('First action summary'),
    shared: z.string().describe('Shared everywhere'),
    alpha_only: z.string().describe('Alpha needs this'),
    maybe: z.number().optional().describe('Optional knob'),
  }),
  z.object({
    action: z.literal('beta').describe('Second action summary'),
    shared: z.string().describe('Shared everywhere'),
    conflicted: z.string().describe('Beta meaning'),
  }),
  z.object({
    action: z.literal('gamma'),
    conflicted: z.string().describe('Gamma meaning'),
  }),
]);

const flat = () => toInputSchema(TestUnion) as JsonSchema;
const props = () => flat().properties as Record<string, JsonSchema>;

describe('flattened schemas preserve per-action information', () => {
  it('action enum description carries one summary line per action', () => {
    const action = props().action;
    expect(action.enum).toEqual(['alpha', 'beta', 'gamma']);
    const description = action.description as string;
    const lines = description.split('\n');
    expect(lines[0]).toBe('alpha: First action summary');
    expect(lines[1]).toBe('beta: Second action summary');
    // gamma has no describe() — the bare label still appears as its own line
    expect(lines[2]).toBe('gamma');
  });

  it('branch-required fields carry a (required for: ...) marker', () => {
    expect(props().alpha_only.description).toBe('Alpha needs this (required for: alpha)');
    // shared is required in alpha and beta but absent in gamma
    expect(props().shared.description).toBe('Shared everywhere (required for: alpha, beta)');
  });

  it('optional subset fields carry a (for: ...) marker', () => {
    expect(props().maybe.description).toBe('Optional knob (for: alpha)');
  });

  it('conflicting descriptions are kept per action instead of silently dropped', () => {
    const description = props().conflicted.description as string;
    expect(description).toContain('for beta: Beta meaning');
    expect(description).toContain('for gamma: Gamma meaning');
  });

  it('real tools publish their per-action guidance', () => {
    const sceneProps = (toInputSchema(scene.schema) as JsonSchema).properties as Record<
      string,
      JsonSchema
    >;
    expect(sceneProps.action.description).toContain('open: Open a scene file');
    expect(sceneProps.scene_path.description).toContain('(required for: open');

    const rsProps = (toInputSchema(runtimeState.schema) as JsonSchema).properties as Record<
      string,
      JsonSchema
    >;
    // The watch lifecycle guidance must reach the model, not just the docs
    expect((rsProps.action.description as string).length).toBeGreaterThan(50);
  });
});

describe('validActions', () => {
  it('lists the union actions', () => {
    expect(validActions(TestUnion)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns null for plain object schemas', () => {
    expect(validActions(z.object({ foo: z.string() }))).toBeNull();
  });
});

describe('describeValidationError', () => {
  const fail = (args: Record<string, unknown>) => {
    const parsed = TestUnion.safeParse(args);
    if (parsed.success) throw new Error('expected parse failure');
    return describeValidationError('godot_test', TestUnion, args, parsed.error);
  };

  it('names valid actions when the action is unknown', () => {
    const message = fail({ action: 'bogus' });
    expect(message).toBe('godot_test: unknown action "bogus". Valid actions: alpha, beta, gamma');
  });

  it('names valid actions when the action is missing', () => {
    const message = fail({});
    expect(message).toBe('godot_test: missing required "action". Valid actions: alpha, beta, gamma');
  });

  it('names the action, failing fields, and the branch contract', () => {
    const message = fail({ action: 'alpha' });
    expect(message).toContain('godot_test action "alpha"');
    expect(message).toContain('shared');
    expect(message).toContain('alpha_only');
    expect(message).toContain('requires shared, alpha_only');
    expect(message).toContain('accepts maybe');
  });

  it('does not dump raw ZodError JSON', () => {
    const message = fail({ action: 'alpha' });
    expect(message).not.toContain('"code"');
    expect(message).not.toContain('invalid_type');
  });
});
