import ModelRegistry from '@/lib/models/registry';
import { NextRequest } from 'next/server';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';
import { parseRequestBody } from '@/lib/validation';
import { z } from 'zod';

const providerConfigSchema = z.record(z.string(), z.any());

const createProviderSchema = z.object({
  type: z.string().min(1, 'Provider type is required'),
  name: z.string().min(1, 'Provider name is required'),
  config: providerConfigSchema,
});

export const GET = async (req: Request) => {
  const context = createRequestContext(req, '/api/providers');
  try {
    logRequestEvent(context, 'providers.get.start');
    const registry = new ModelRegistry(context);

    const activeProviders = await registry.getActiveProviders();

    const filteredProviders = activeProviders.filter((p) => {
      return !p.chatModels.some((m) => m.key === 'error');
    });

    logRequestEvent(context, 'providers.get.success', {
      providerCount: filteredProviders.length,
    });

    return Response.json(
      {
        providers: filteredProviders,
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    logRequestEvent(
      context,
      'providers.get.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error has occurred.',
      },
      {
        status: 500,
      },
    );
  }
};

export const POST = async (req: NextRequest) => {
  const context = createRequestContext(req, '/api/providers');
  try {
    const parseBody = await parseRequestBody(
      req,
      createProviderSchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const { type, name, config } = parseBody.data;

    logRequestEvent(context, 'providers.create.start', { type, name });
    const registry = new ModelRegistry(context);

    let newProvider;
    try {
      newProvider = await registry.addProvider(type, name, config);
    } catch (err: any) {
      if (err.message === 'Invalid provider type') {
        return Response.json(
          {
            message: err.message,
            requestId: context.requestId,
          },
          { status: 400 },
        );
      }

      throw err;
    }

    logRequestEvent(context, 'providers.create.success', {
      providerId: newProvider.id,
      type,
    });

    return Response.json(
      {
        provider: newProvider,
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    logRequestEvent(
      context,
      'providers.create.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error has occurred.',
      },
      {
        status: 500,
      },
    );
  }
};
