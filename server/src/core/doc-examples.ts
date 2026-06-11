import { z } from 'zod';
import type { AnyToolDefinition } from './types.js';

// Deriving per-action documentation (variant tables + copy-pasteable examples)
// from a tool's schema. Kept separate from the doc-generation SCRIPT so it can
// be unit-tested without the script's file I/O. The script (scripts/generate-docs.ts)
// imports these to render markdown.

export interface ActionVariant {
  action: string;
  properties: Record<string, Record<string, unknown>>;
  required: string[];
}

// The Anthropic-shaped input schema flattens discriminated unions into a single
// object (see core/schema.ts), which discards per-action structure. For docs we
// want that structure back, so read the raw (un-flattened) JSON Schema, where a
// discriminatedUnion serializes to a top-level `oneOf` of per-action branches —
// each carrying its own `required` list and the action literal's `.describe()`.
export function rawJsonSchema(tool: AnyToolDefinition): Record<string, unknown> {
  const { $schema, ...rest } = z.toJSONSchema(tool.schema, { target: 'draft-07' }) as Record<string, unknown>;
  return rest;
}

// Discriminated-union schemas serialize to oneOf (one object variant per
// action). Pull each variant's action literal, properties, and required list.
export function getActionVariants(schema: Record<string, unknown>): ActionVariant[] | null {
  const branches = (schema.oneOf || schema.anyOf) as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(branches)) return null;

  const variants: ActionVariant[] = [];
  for (const branch of branches) {
    const properties = (branch.properties as Record<string, Record<string, unknown>>) || {};
    const actionProp = properties.action;
    const action =
      (actionProp?.const as string | undefined) ??
      (Array.isArray(actionProp?.enum) ? (actionProp!.enum as string[])[0] : undefined);
    if (action === undefined) continue;
    variants.push({ action, properties, required: (branch.required as string[]) || [] });
  }
  return variants.length > 0 ? variants : null;
}

// Representative values for well-known parameter names, so generated examples
// read like real calls rather than `"example"` placeholders.
const NAMED_EXAMPLES: Record<string, unknown> = {
  node_path: '/root/Main/Player',
  parent_path: '/root/Main',
  new_parent_path: '/root/UI',
  scene_path: 'res://scenes/enemy.tscn',
  script_path: 'res://scripts/player.gd',
  resource_path: 'res://resources/spriteframes.tres',
  animation_name: 'idle',
  node_name: 'NewNode',
  node_type: 'Sprite2D',
  name_pattern: '*Enemy*',
  type: 'CharacterBody2D',
  root_path: '/root/Main',
  path: '/root/Main/Player',
  signal: 'body_entered',
};

// Build a representative, schema-VALID value for one JSON-Schema property.
// Recurses through arrays/objects/unions and produces NON-EMPTY arrays +
// populated required object fields, so min-length / nested-required constraints hold.
export function exampleForProp(name: string, prop: Record<string, unknown>): unknown {
  if (prop.const !== undefined) return prop.const;
  if (Array.isArray(prop.enum)) return (prop.enum as unknown[])[0];
  if (name in NAMED_EXAMPLES) return NAMED_EXAMPLES[name];

  // A prop that is itself a union (z.union / z.discriminatedUnion serialize to
  // anyOf / oneOf — e.g. the input `sequence` entry shapes): build the first branch.
  const branches = (prop.oneOf ?? prop.anyOf ?? prop.allOf) as Record<string, unknown>[] | undefined;
  if (Array.isArray(branches) && branches.length > 0) {
    return exampleForProp(name, branches[0]);
  }

  switch (prop.type) {
    case 'string':
      return 'example';
    case 'integer':
    case 'number':
      // Respect a lower bound so .min(n) constraints aren't violated.
      return typeof prop.minimum === 'number' ? prop.minimum : 0;
    case 'boolean':
      return false;
    case 'array': {
      const items = prop.items as Record<string, unknown> | undefined;
      // One representative element: keeps arrays non-empty so a length-based
      // refine (e.g. watch_start's specs/signals) is satisfied.
      return items ? [exampleForProp(name, items)] : [];
    }
    case 'object': {
      const props = (prop.properties as Record<string, Record<string, unknown>>) || {};
      const req = (prop.required as string[]) || [];
      const obj: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        if (req.includes(key)) obj[key] = exampleForProp(key, props[key]);
      }
      return obj;
    }
    default:
      return null;
  }
}

// A copy-pasteable example for one action: the discriminator plus every
// schema-required field. JSON Schema can't express cross-field refinements
// (e.g. watch_start requires specs OR signals), so if the required-only example
// fails the REAL Zod schema, add optional fields one at a time until it
// validates — keeping the minimal field that unblocks it (#287).
export function buildVariantExample(
  variant: ActionVariant,
  toolSchema: z.ZodType
): Record<string, unknown> {
  const example: Record<string, unknown> = { action: variant.action };
  for (const name of variant.required) {
    if (name === 'action') continue;
    example[name] = exampleForProp(name, variant.properties[name]);
  }

  if (!toolSchema.safeParse(example).success) {
    for (const [name, prop] of Object.entries(variant.properties)) {
      if (name === 'action' || name in example) continue;
      example[name] = exampleForProp(name, prop);
      if (toolSchema.safeParse(example).success) break;
      delete example[name]; // this field didn't unblock it — don't over-specify
    }
  }

  return example;
}
