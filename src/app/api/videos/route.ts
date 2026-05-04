import handleVideoSearch from '@/lib/agents/media/video';
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

const videoSearchBodySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  chatHistory: chatHistorySchema,
  chatModel: modelWithProviderSchema,
});

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/videos');
  try {
    const parseBody = await parseRequestBody(
      req,
      videoSearchBodySchema,
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

    const videos = await handleVideoSearch(
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
      videos,
      ...(videos.length === 0
        ? {
            warning:
              'No video results were returned. The active search backend may not provide media-specific fields.',
          }
        : {}),
    };

    return Response.json(response, { status: 200 });
  } catch (err) {
    logRequestEvent(
      context,
      'api.videos.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error occurred while searching videos',
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
};
