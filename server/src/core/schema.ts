import { zodToJsonSchema } from 'zod-to-json-schema';
import type { z } from 'zod';

export function toInputSchema(schema: z.ZodType): object {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });
  const { $schema, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}
