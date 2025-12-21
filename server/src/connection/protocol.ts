import { z } from 'zod';

export const RequestSchema = z.object({
  id: z.string(),
  command: z.string(),
  params: z.record(z.unknown()).optional().default({}),
});

export type Request = z.infer<typeof RequestSchema>;

export const SuccessResponseSchema = z.object({
  id: z.string(),
  status: z.literal('success'),
  result: z.unknown(),
});

export const ErrorResponseSchema = z.object({
  id: z.string(),
  status: z.literal('error'),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const ResponseSchema = z.union([SuccessResponseSchema, ErrorResponseSchema]);

export type Response = z.infer<typeof ResponseSchema>;
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export function createRequest(command: string, params: Record<string, unknown> = {}): Request {
  return {
    id: crypto.randomUUID(),
    command,
    params,
  };
}

export function isSuccessResponse(response: Response): response is SuccessResponse {
  return response.status === 'success';
}

export function isErrorResponse(response: Response): response is ErrorResponse {
  return response.status === 'error';
}
