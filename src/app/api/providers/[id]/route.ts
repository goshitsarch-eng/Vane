import ModelRegistry from '@/lib/models/registry';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';
import { parseRequestBody } from '@/lib/validation';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const providerIdSchema = z.string().min(1, 'Provider ID is required');

const updateProviderSchema = z.object({
  name: z.string().min(1, 'Provider name is required'),
  config: z.record(z.string(), z.any()),
});

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const context = createRequestContext(req, '/api/providers/[id]');
  try {
    const { id } = await params;
    const parseId = providerIdSchema.safeParse(id);

    if (!parseId.success) {
      return Response.json(
        {
          message: 'Invalid request body',
          error: parseId.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId: context.requestId,
        },
        {
          status: 400,
        },
      );
    }

    const registry = new ModelRegistry(context);
    await registry.removeProvider(id);

    return Response.json(
      {
        message: 'Provider deleted successfully.',
      },
      {
        status: 200,
      },
    );
  } catch (err: any) {
    logRequestEvent(
      context,
      'providers.delete.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error has occurred.',
        requestId: context.requestId,
      },
      {
        status: 500,
      },
    );
  }
};

export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const context = createRequestContext(req, '/api/providers/[id]');
  try {
    const { id } = await params;
    const parseId = providerIdSchema.safeParse(id);

    if (!parseId.success) {
      return Response.json(
        {
          message: 'Invalid request body',
          error: parseId.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId: context.requestId,
        },
        {
          status: 400,
        },
      );
    }

    const parseBody = await parseRequestBody(
      req,
      updateProviderSchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const { name, config } = parseBody.data;

    const registry = new ModelRegistry(context);

    const updatedProvider = await registry.updateProvider(id, name, config);

    return Response.json(
      {
        provider: updatedProvider,
      },
      {
        status: 200,
      },
    );
  } catch (err: any) {
    logRequestEvent(
      context,
      'providers.update.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error has occurred.',
        requestId: context.requestId,
      },
      {
        status: 500,
      },
    );
  }
};
