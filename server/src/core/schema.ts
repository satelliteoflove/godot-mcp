import { z, type ZodType } from 'zod';

type JsonObj = Record<string, unknown>;

// The Anthropic API forbids oneOf/anyOf/allOf at the root of inputSchema.
// Zod v4's toJSONSchema emits `oneOf` for discriminatedUnion, so we flatten
// all branches into a single object schema. The discriminator field's `const`
// values are collected into an `enum`; all other per-branch properties are
// merged and become optional at the top level. Actual validation still runs
// through Zod when the tool is called.
function flattenUnionToObject(schema: JsonObj): JsonObj {
  const branches = (schema.oneOf ?? schema.anyOf ?? schema.allOf) as JsonObj[] | undefined;
  if (!branches || branches.length === 0) {
    return { type: 'object' };
  }

  const mergedProperties: JsonObj = {};
  const requiredSets: string[][] = branches.map((b) =>
    Array.isArray(b.required) ? (b.required as string[]) : []
  );

  for (const branch of branches) {
    const props = branch.properties as JsonObj | undefined;
    if (props) Object.assign(mergedProperties, props);
  }

  // Only fields required in every branch stay required at the top level.
  const commonRequired =
    requiredSets.length > 0
      ? requiredSets[0].filter((k) => requiredSets.every((r) => r.includes(k)))
      : [];

  // If a common-required field has a `const` in every branch, replace it
  // with an `enum` so the model knows which values are valid.
  for (const key of commonRequired) {
    const constValues = branches.flatMap((b) => {
      const prop = (b.properties as Record<string, JsonObj> | undefined)?.[key];
      return prop?.const !== undefined ? [prop.const] : [];
    });
    if (constValues.length === branches.length) {
      mergedProperties[key] = { type: 'string', enum: constValues };
    }
  }

  return {
    type: 'object',
    ...(Object.keys(mergedProperties).length > 0 ? { properties: mergedProperties } : {}),
    ...(commonRequired.length > 0 ? { required: commonRequired } : {}),
  };
}

export function toInputSchema(schema: ZodType): object {
  const jsonSchema = z.toJSONSchema(schema, { target: 'draft-07' });
  const { $schema, ...rest } = jsonSchema as JsonObj;

  if (rest.type === 'object') return rest;
  if (rest.oneOf || rest.anyOf || rest.allOf) return flattenUnionToObject(rest);
  return { type: 'object', ...rest };
}
