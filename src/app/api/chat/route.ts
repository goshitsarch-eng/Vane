import { z } from 'zod';
import ModelRegistry from '@/lib/models/registry';
import { ModelWithProvider } from '@/lib/models/types';
import SearchAgent from '@/lib/agents/search';
import SessionManager from '@/lib/session';
import { ChatTurnMessage } from '@/lib/types';
import { SearchSources } from '@/lib/agents/search/types';
import db from '@/lib/db';
import { eq } from 'drizzle-orm';
import { chats } from '@/lib/db/schema';
import UploadManager from '@/lib/uploads/manager';
import {
  createRequestContext,
  logRequestEvent,
  serializeError,
} from '@/lib/observability/request';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const messageSchema = z.object({
  messageId: z.string().min(1, 'Message ID is required'),
  chatId: z.string().min(1, 'Chat ID is required'),
  content: z.string().min(1, 'Message content is required'),
});

const chatModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z
    .string({ message: 'Chat model provider id must be provided' })
    .min(1, 'Chat model provider id must be provided'),
  key: z
    .string({ message: 'Chat model key must be provided' })
    .min(1, 'Chat model key must be provided'),
});

const embeddingModelSchema: z.ZodType<ModelWithProvider> = z.object({
  providerId: z
    .string({
      message: 'Embedding model provider id must be provided',
    })
    .min(1, 'Embedding model provider id must be provided'),
  key: z
    .string({ message: 'Embedding model key must be provided' })
    .min(1, 'Embedding model key must be provided'),
});

const bodySchema = z.object({
  message: messageSchema,
  optimizationMode: z.enum(['speed', 'balanced', 'quality'], {
    message: 'Optimization mode must be one of: speed, balanced, quality',
  }),
  sources: z.array(z.string()).optional().default([]),
  history: z
    .array(z.tuple([z.string(), z.string()]))
    .optional()
    .default([]),
  files: z.array(z.string()).optional().default([]),
  chatModel: chatModelSchema,
  embeddingModel: embeddingModelSchema.optional().nullable(),
  systemInstructions: z.string().nullable().optional().default(''),
});

type Body = z.infer<typeof bodySchema>;

const safeValidateBody = (data: unknown) => {
  const result = bodySchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      error: result.error.issues.map((e: any) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }

  return {
    success: true,
    data: result.data,
  };
};

const ensureChatExists = async (input: {
  id: string;
  sources: SearchSources[];
  query: string;
  fileIds: string[];
}) => {
  try {
    const exists = await db.query.chats
      .findFirst({
        where: eq(chats.id, input.id),
      })
      .execute();

    if (!exists) {
      await db.insert(chats).values({
        id: input.id,
        createdAt: new Date().toISOString(),
        sources: input.sources,
        title: input.query,
        files: input.fileIds.map((id) => {
          return {
            fileId: id,
            name: UploadManager.getFile(id)?.name || 'Uploaded File',
          };
        }),
      });
    }
  } catch (err) {
    console.error('Failed to check/save chat:', err);
  }
};

export const POST = async (req: Request) => {
  const context = createRequestContext(req, '/api/chat');
  try {
    const reqBody = (await req.json()) as Body;
    logRequestEvent(context, 'api.chat.request.start');

    const parseBody = safeValidateBody(reqBody);

    if (!parseBody.success) {
      return Response.json(
        { message: 'Invalid request body', error: parseBody.error },
        { status: 400 },
      );
    }

    const body = parseBody.data as Body;
    const { message } = body;
    logRequestEvent(context, 'api.chat.request.validated', {
      chatId: body.message.chatId,
      messageId: body.message.messageId,
      sources: body.sources,
      chatProviderId: body.chatModel.providerId,
      chatModel: body.chatModel.key,
      embeddingProviderId: body.embeddingModel?.providerId,
      embeddingModel: body.embeddingModel?.key,
    });

    if (message.content === '') {
      return Response.json(
        {
          message: 'Please provide a message to process',
        },
        { status: 400 },
      );
    }

    const registry = new ModelRegistry(context);

    let llm;
    let embedding = null;
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

    if (body.embeddingModel) {
      try {
        embedding = await registry.loadEmbeddingModel(
          body.embeddingModel.providerId,
          body.embeddingModel.key,
        );
      } catch (err: any) {
        logRequestEvent(
          context,
          'api.chat.embedding.load_failed',
          { error: serializeError(err) },
          'warn',
        );
        embedding = null;
      }
    }

    const history: ChatTurnMessage[] = body.history.map((msg) => {
      if (msg[0] === 'human') {
        return {
          role: 'user',
          content: msg[1],
        };
      } else {
        return {
          role: 'assistant',
          content: msg[1],
        };
      }
    });

    const agent = new SearchAgent();
    const session = SessionManager.createSession();

    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const encoder = new TextEncoder();
    let streamClosed = false;

    const writeStreamEvent = (event: Record<string, unknown>) => {
      if (streamClosed) return;
      writer
        .write(encoder.encode(JSON.stringify(event) + '\n'))
        .catch((err) => {
          logRequestEvent(
            context,
            'api.chat.stream.write_failed',
            { error: serializeError(err) },
            'warn',
          );
        });
    };

    const closeStream = () => {
      if (streamClosed) return;
      streamClosed = true;
      writer.close().catch(() => {});
    };

    const disconnect = session.subscribe((event: string, data: any) => {
      if (event === 'data') {
        if (data.type === 'block') {
          writeStreamEvent({
            type: 'block',
            block: data.block,
          });
        } else if (data.type === 'updateBlock') {
          writeStreamEvent({
            type: 'updateBlock',
            blockId: data.blockId,
            patch: data.patch,
          });
        } else if (data.type === 'researchComplete') {
          writeStreamEvent({
            type: 'researchComplete',
          });
        }
      } else if (event === 'end') {
        writeStreamEvent({
          type: 'messageEnd',
        });
        closeStream();
        session.removeAllListeners();
        logRequestEvent(context, 'api.chat.stream.done', {
          chatId: body.message.chatId,
          messageId: body.message.messageId,
        });
      } else if (event === 'error') {
        writeStreamEvent({
          type: 'error',
          data: data.data,
        });
        closeStream();
        session.removeAllListeners();
        logRequestEvent(
          context,
          'api.chat.stream.error',
          { error: data },
          'error',
        );
      }
    });

    agent
      .searchAsync(session, {
        chatHistory: history,
        followUp: message.content,
        chatId: body.message.chatId,
        messageId: body.message.messageId,
        config: {
          llm,
          embedding: embedding,
          sources: body.sources as SearchSources[],
          mode: body.optimizationMode,
          fileIds: body.files,
          systemInstructions: body.systemInstructions || 'None',
          requestId: context.requestId,
        },
      })
      .catch((err) => {
        logRequestEvent(
          context,
          'api.chat.agent.error',
          { error: serializeError(err) },
          'error',
        );
        try {
          session.emit('error', {
            data:
              err instanceof Error
                ? err.message
                : 'An unexpected error occurred',
          });
          session.emit('end', {});
        } catch {
          // Session may already be cleaned up
        }
      });

    ensureChatExists({
      id: body.message.chatId,
      sources: body.sources as SearchSources[],
      fileIds: body.files,
      query: message.content,
    });

    req.signal.addEventListener('abort', () => {
      disconnect();
      closeStream();
      logRequestEvent(context, 'api.chat.stream.abort');
    });

    return new Response(responseStream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
  } catch (err) {
    logRequestEvent(
      context,
      'api.chat.request.exception',
      { error: serializeError(err) },
      'error',
    );
    return Response.json(
      {
        message: 'An error occurred while processing chat request',
        requestId: context.requestId,
      },
      { status: 500 },
    );
  }
};
