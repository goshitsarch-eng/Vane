import { z } from 'zod';

export const modelWithProviderSchema = z.object({
  providerId: z.string().min(1, 'Model provider id is required'),
  key: z.string().min(1, 'Model key is required'),
});

export const chatHistorySchema = z
  .array(z.tuple([z.enum(['human', 'assistant']), z.string()]))
  .optional()
  .default([]);

export const searchSourcesSchema = z
  .array(z.enum(['web', 'discussions', 'academic']))
  .optional()
  .default([]);

export const zodIssues = (error: z.ZodError) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));

export const invalidBodyResponse = (error: z.ZodError, requestId?: string) =>
  Response.json(
    {
      message: 'Invalid request body',
      error: zodIssues(error),
      ...(requestId ? { requestId } : {}),
    },
    { status: 400 },
  );

export const malformedJsonResponse = (requestId?: string) =>
  Response.json(
    {
      message: 'Invalid request body',
      error: 'Malformed JSON',
      ...(requestId ? { requestId } : {}),
    },
    { status: 400 },
  );

export const parseRequestBody = async <T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
  requestId?: string,
): Promise<
  { success: true; data: z.infer<T> } | { success: false; response: Response }
> => {
  let body: unknown;

  try {
    body = await req.json();
  } catch (error) {
    return {
      success: false,
      response: malformedJsonResponse(requestId),
    };
  }

  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return {
      success: false,
      response: invalidBodyResponse(parsed.error, requestId),
    };
  }

  return {
    success: true,
    data: parsed.data,
  };
};
