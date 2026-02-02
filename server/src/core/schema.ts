import { z, type ZodType } from 'zod';

export function toInputSchema(schema: ZodType): object {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'draft-07',
  });
  const { $schema, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}
