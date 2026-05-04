import configManager from '@/lib/config';
import ModelRegistry from '@/lib/models/registry';
import { NextRequest, NextResponse } from 'next/server';
import { ConfigModelProvider } from '@/lib/config/types';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';

type SaveConfigBody = {
  key: string;
  value: string;
};

export const GET = async (req: NextRequest) => {
  const context = createRequestContext(req, '/api/config');
  try {
    logRequestEvent(context, 'config.get.start');
    const values = configManager.getCurrentConfig();
    const fields = configManager.getUIConfigSections();

    const modelRegistry = new ModelRegistry(context);
    const modelProviders = await modelRegistry.getActiveProviders();

    values.modelProviders = values.modelProviders.map(
      (mp: ConfigModelProvider) => {
        const activeProvider = modelProviders.find((p) => p.id === mp.id);

        return {
          ...mp,
          chatModels: activeProvider?.chatModels ?? mp.chatModels,
          embeddingModels:
            activeProvider?.embeddingModels ?? mp.embeddingModels,
        };
      },
    );

    logRequestEvent(context, 'config.get.success', {
      providerCount: values.modelProviders.length,
    });

    return NextResponse.json({
      values,
      fields,
    });
  } catch (err) {
    logRequestEvent(
      context,
      'config.get.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};

export const POST = async (req: NextRequest) => {
  const context = createRequestContext(req, '/api/config');
  try {
    const body: SaveConfigBody = await req.json();

    if (!body.key || !body.value) {
      return Response.json(
        {
          message: 'Key and value are required.',
        },
        {
          status: 400,
        },
      );
    }

    configManager.updateConfig(body.key, body.value);
    logRequestEvent(context, 'config.update.success', { key: body.key });

    return Response.json(
      {
        message: 'Config updated successfully.',
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    logRequestEvent(
      context,
      'config.update.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      { message: 'An error has occurred.' },
      { status: 500 },
    );
  }
};
