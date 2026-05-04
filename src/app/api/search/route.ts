import ModelRegistry from '@/lib/models/registry';
import SessionManager from '@/lib/session';
import { ChatTurnMessage } from '@/lib/types';
import APISearchAgent from '@/lib/agents/search/api';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';
import { z } from 'zod';
import {
  chatHistorySchema,
  modelWithProviderSchema,
  parseRequestBody,
} from '@/lib/validation';

const bodySchema = z.object({
  optimizationMode: z.enum(['speed', 'balanced', 'quality']).default('speed'),
  sources: z
    .array(z.enum(['web', 'discussions', 'academic']))
    .min(1, 'At least one search source is required'),
  chatModel: modelWithProviderSchema,
  embeddingModel: modelWithProviderSchema.optional().nullable(),
  query: z.string().min(1, 'Query is required'),
  history: chatHistorySchema,
  stream: z.boolean().optional().default(false),
  systemInstructions: z.string().optional().default(''),
});

type ChatRequestBody = z.infer<typeof bodySchema>;

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/search');
  try {
    const parseBody = await parseRequestBody(
      req,
      bodySchema,
      context.requestId,
    );

    if (!parseBody.success) {
      return parseBody.response;
    }

    const body: ChatRequestBody = parseBody.data;
    logRequestEvent(context, 'api.search.request.start', {
      stream: Boolean(body.stream),
      sources: body.sources,
      chatProviderId: body.chatModel?.providerId,
      chatModel: body.chatModel?.key,
      embeddingProviderId: body.embeddingModel?.providerId,
      embeddingModel: body.embeddingModel?.key,
    });

    const registry = new ModelRegistry(context);

    let llm;
    try {
      llm = await registry.loadChatModel(
        body.chatModel.providerId,
        body.chatModel.key,
      );
    } catch (err: any) {
      const isMissingProvider = err.message === 'Invalid provider id';
      return Response.json(
        {
          message: isMissingProvider
            ? 'No AI model is configured. Please add a model provider in Settings.'
            : err.message || 'Failed to load AI model',
          requestId: context.requestId,
        },
        { status: isMissingProvider ? 400 : 500 },
      );
    }

    let embeddings = null;
    if (body.embeddingModel) {
      try {
        embeddings = await registry.loadEmbeddingModel(
          body.embeddingModel.providerId,
          body.embeddingModel.key,
        );
      } catch (err: any) {
        logRequestEvent(
          context,
          'api.search.embedding.load_failed',
          { error: serializeError(err) },
          'warn',
        );
        embeddings = null;
      }
    }

    const history: ChatTurnMessage[] = body.history.map((msg) => {
      return msg[0] === 'human'
        ? { role: 'user', content: msg[1] }
        : { role: 'assistant', content: msg[1] };
    });

    const session = SessionManager.createSession();

    const agent = new APISearchAgent();

    agent
      .searchAsync(session, {
        chatHistory: history,
        config: {
          embedding: embeddings,
          llm: llm,
          sources: body.sources,
          mode: body.optimizationMode,
          fileIds: [],
          systemInstructions: body.systemInstructions || '',
          requestId: context.requestId,
        },
        followUp: body.query,
        chatId: crypto.randomUUID(),
        messageId: crypto.randomUUID(),
      })
      .catch((err) => {
        logRequestEvent(
          context,
          'api.search.agent.error',
          { error: serializeError(err) },
          'error',
        );
        session.emit('error', {
          data: err instanceof Error ? err.message : 'Search error',
        });
        session.emit('end', {});
      });

    if (!body.stream) {
      return new Promise((resolve: (value: Response) => void) => {
        let message = '';
        let sources: any[] = [];
        const disconnect = session.subscribe(
          (event: string, data: Record<string, any>) => {
            if (event === 'data') {
              try {
                if (data.type === 'response') {
                  message += data.data;
                } else if (data.type === 'searchResults') {
                  sources = data.data;
                }
              } catch (error) {
                disconnect();
                resolve(
                  Response.json(
                    { message: 'Error parsing data' },
                    { status: 500 },
                  ),
                );
              }
            }

            if (event === 'end') {
              disconnect();
              logRequestEvent(context, 'api.search.request.success', {
                sourceCount: sources.length,
                messageLength: message.length,
              });
              resolve(Response.json({ message, sources }, { status: 200 }));
            }

            if (event === 'error') {
              disconnect();
              logRequestEvent(
                context,
                'api.search.request.error',
                { error: data },
                'error',
              );
              resolve(
                Response.json(
                  { message: 'Search error', error: data },
                  { status: 500 },
                ),
              );
            }
          },
        );
      });
    }

    const encoder = new TextEncoder();

    const abortController = new AbortController();
    const { signal } = abortController;

    const stream = new ReadableStream({
      start(controller) {
        let sources: any[] = [];
        let streamClosed = false;

        const enqueue = (event: Record<string, unknown>) => {
          if (streamClosed) return;
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
        };

        const closeStream = () => {
          if (streamClosed) return;
          streamClosed = true;
          controller.close();
        };

        enqueue({
          type: 'init',
          data: 'Stream connected',
        });
        logRequestEvent(context, 'api.search.stream.open');

        signal.addEventListener('abort', () => {
          session.removeAllListeners();

          try {
            closeStream();
          } catch (error) {}
        });

        const disconnect = session.subscribe(
          (event: string, data: Record<string, any>) => {
            if (event === 'data') {
              if (signal.aborted) return;

              try {
                if (data.type === 'response') {
                  enqueue({
                    type: 'response',
                    data: data.data,
                  });
                } else if (data.type === 'searchResults') {
                  sources = data.data;
                  enqueue({
                    type: 'sources',
                    data: sources,
                  });
                }
              } catch (error) {
                if (!streamClosed) {
                  streamClosed = true;
                  controller.error(error);
                }
              }
            }

            if (event === 'end') {
              if (signal.aborted) return;

              disconnect();
              enqueue({
                type: 'done',
              });
              closeStream();
              logRequestEvent(context, 'api.search.stream.done', {
                sourceCount: sources.length,
              });
            }

            if (event === 'error') {
              if (signal.aborted) return;

              disconnect();
              enqueue({
                type: 'error',
                data,
              });
              closeStream();
              logRequestEvent(
                context,
                'api.search.stream.error',
                { error: data },
                'error',
              );
            }
          },
        );
      },
      cancel() {
        abortController.abort();
        logRequestEvent(context, 'api.search.stream.cancel');
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err: any) {
    logRequestEvent(
      context,
      'api.search.request.exception',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error has occurred.',
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
};
