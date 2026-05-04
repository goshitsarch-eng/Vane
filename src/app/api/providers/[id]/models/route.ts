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

const modelTypeSchema = z.enum(['embedding', 'chat']);

const addModelSchema = z.object({
  key: z.string().min(1, 'Model key is required'),
  name: z.string().min(1, 'Model name is required'),
  type: modelTypeSchema,
});

const deleteModelSchema = z.object({
  key: z.string().min(1, 'Model key is required'),
  type: modelTypeSchema,
});

export const POST = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const context = createRequestContext(req, '/api/providers/[id]/models');
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
      addModelSchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const body = parseBody.data;

    const registry = new ModelRegistry(context);

    await registry.addProviderModel(id, body.type, body);

    return Response.json(
      {
        message: 'Model added successfully',
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    logRequestEvent(
      context,
      'providers.models.add.error',
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

export const DELETE = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) => {
  const context = createRequestContext(req, '/api/providers/[id]/models');
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
      deleteModelSchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const body = parseBody.data;

    const registry = new ModelRegistry(context);

    await registry.removeProviderModel(id, body.type, body.key);

    return Response.json(
      {
        message: 'Model deleted successfully',
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    logRequestEvent(
      context,
      'providers.models.delete.error',
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
