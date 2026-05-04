import generateSuggestions from '@/lib/agents/suggestions';
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

const suggestionsBodySchema = z.object({
  chatHistory: chatHistorySchema,
  chatModel: modelWithProviderSchema,
});

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/suggestions');
  try {
    const parseBody = await parseRequestBody(
      req,
      suggestionsBodySchema,
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

    const suggestions = await generateSuggestions(
      {
        chatHistory: body.chatHistory.map(([role, content]) => ({
          role: role === 'human' ? 'user' : 'assistant',
          content,
        })),
      },
      llm,
    );

    return Response.json({ suggestions }, { status: 200 });
  } catch (err) {
    logRequestEvent(
      context,
      'api.suggestions.error',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error occurred while generating suggestions',
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
};
