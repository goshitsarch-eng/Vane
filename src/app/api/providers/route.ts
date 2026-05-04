import ModelRegistry from '@/lib/models/registry';
import { NextRequest } from 'next/server';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';

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
    const body = await req.json();
    const { type, name, config } = body;

    if (!type || !name || !config) {
      return Response.json(
        {
          message: 'Missing required fields.',
        },
        {
          status: 400,
        },
      );
    }

    logRequestEvent(context, 'providers.create.start', { type, name });
    const registry = new ModelRegistry(context);

    const newProvider = await registry.addProvider(type, name, config);

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
