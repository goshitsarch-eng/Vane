import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';
import SessionManager from '@/lib/session';
import { ChatTurnMessage } from '@/lib/types';
import { SearchSources } from '@/lib/agents/search/types';
import APISearchAgent from '@/lib/agents/search/api';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';

interface ChatRequestBody {
  optimizationMode: 'speed' | 'balanced' | 'quality';
  sources: SearchSources[];
  chatModel: ModelWithProvider;
  embeddingModel?: ModelWithProvider | null;
  query: string;
  history: Array<[string, string]>;
  stream?: boolean;
  systemInstructions?: string;
}

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/search');
  try {
    const body: ChatRequestBody = await req.json();
    logRequestEvent(context, 'api.search.request.start', {
      stream: Boolean(body.stream),
      sources: body.sources,
      chatProviderId: body.chatModel?.providerId,
      chatModel: body.chatModel?.key,
      embeddingProviderId: body.embeddingModel?.providerId,
      embeddingModel: body.embeddingModel?.key,
    });

    if (!body.sources || !body.query) {
      return Response.json(
        { message: 'Missing sources or query' },
        { status: 400 },
      );
    }

    body.history = body.history || [];
    body.optimizationMode = body.optimizationMode || 'speed';
    body.stream = body.stream || false;

    const registry = new ModelRegistry(context);

    const llm = await registry.loadChatModel(
      body.chatModel.providerId,
      body.chatModel.key,
    );

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
      return new Promise(
        (
          resolve: (value: Response) => void,
          reject: (value: Response) => void,
        ) => {
          let message = '';
          let sources: any[] = [];

          session.subscribe((event: string, data: Record<string, any>) => {
            if (event === 'data') {
              try {
                if (data.type === 'response') {
                  message += data.data;
                } else if (data.type === 'searchResults') {
                  sources = data.data;
                }
              } catch (error) {
                reject(
                  Response.json(
                    { message: 'Error parsing data' },
                    { status: 500 },
                  ),
                );
              }
            }

            if (event === 'end') {
              logRequestEvent(context, 'api.search.request.success', {
                sourceCount: sources.length,
                messageLength: message.length,
              });
              resolve(Response.json({ message, sources }, { status: 200 }));
            }

            if (event === 'error') {
              logRequestEvent(
                context,
                'api.search.request.error',
                { error: data },
                'error',
              );
              reject(
                Response.json(
                  { message: 'Search error', error: data },
                  { status: 500 },
                ),
              );
            }
          });
        },
      );
    }

    const encoder = new TextEncoder();

    const abortController = new AbortController();
    const { signal } = abortController;

    const stream = new ReadableStream({
      start(controller) {
        let sources: any[] = [];
        let streamClosed = false;

        const closeStream = () => {
          if (streamClosed) return;
          streamClosed = true;
          controller.close();
        };

        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'init',
              data: 'Stream connected',
            }) + '\n',
          ),
        );
        logRequestEvent(context, 'api.search.stream.open');

        signal.addEventListener('abort', () => {
          session.removeAllListeners();

          try {
            closeStream();
          } catch (error) {}
        });

        session.subscribe((event: string, data: Record<string, any>) => {
          if (event === 'data') {
            if (signal.aborted) return;

            try {
              if (data.type === 'response') {
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'response',
                      data: data.data,
                    }) + '\n',
                  ),
                );
              } else if (data.type === 'searchResults') {
                sources = data.data;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: 'sources',
                      data: sources,
                    }) + '\n',
                  ),
                );
              }
            } catch (error) {
              controller.error(error);
            }
          }

          if (event === 'end') {
            if (signal.aborted) return;

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'done',
                }) + '\n',
              ),
            );
            closeStream();
            logRequestEvent(context, 'api.search.stream.done', {
              sourceCount: sources.length,
            });
          }

          if (event === 'error') {
            if (signal.aborted) return;

            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  type: 'error',
                  data,
                }) + '\n',
              ),
            );
            closeStream();
            logRequestEvent(
              context,
              'api.search.stream.error',
              { error: data },
              'error',
            );
          }
        });
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
