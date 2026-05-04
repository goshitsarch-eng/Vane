import configManager from '@/lib/config';
import ModelRegistry from '@/lib/models/registry';
import { NextRequest, NextResponse } from 'next/server';
import { ConfigModelProvider } from '@/lib/config/types';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';
import { z } from 'zod';
import { parseRequestBody } from '@/lib/validation';

const saveConfigBodySchema = z.object({
  key: z.string().min(1, 'Config key is required'),
  value: z.any().refine((value) => value !== undefined, {
    message: 'Config value is required',
  }),
});

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
    const parseBody = await parseRequestBody(
      req,
      saveConfigBodySchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const body = parseBody.data;

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
