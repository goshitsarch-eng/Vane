import searchImages from '@/lib/agents/media/image';
import ModelRegistry from '@/lib/models/registry';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';
import {
  chatHistorySchema,
  modelWithProviderSchema,
  parseRequestBody,
} from '@/lib/validation';
import { z } from 'zod';

const imageSearchBodySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  chatHistory: chatHistorySchema,
  chatModel: modelWithProviderSchema,
});

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/images');
  try {
    const parseBody = await parseRequestBody(
      req,
      imageSearchBodySchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const body = parseBody.data;

    const registry = new ModelRegistry(context);

    let llm;
    try {
      llm = await registry.loadChatModel(
        body.chatModel.providerId,
        body.chatModel.key,
      );
    } catch (err: any) {
      return Response.json(
        {
          message: err.message || 'Failed to load AI model',
          requestId: context.requestId,
        },
        { status: 400 },
      );
    }

    const images = await searchImages(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
        query: body.query,
      },
      llm,
    );

    const response = {
      images,
      ...(images.length === 0
        ? {
            warning:
              'No image results were returned. The active search backend may not provide media-specific fields.',
          }
        : {}),
    };

    return Response.json(response, { status: 200 });
  } catch (err) {
    logRequestEvent(
      context,
      'api.images.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error occurred while searching images',
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
};
