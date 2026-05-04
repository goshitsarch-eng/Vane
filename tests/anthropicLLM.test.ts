import { afterEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';
import AnthropicLLM from '@/lib/models/providers/anthropic/anthropicLLM';

const tool = {
  name: 'web_search',
  description: 'Search the web',
  schema: z.object({
    query: z.string(),
  }),
};

describe('AnthropicLLM', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes tools into Messages API requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: [
            { type: 'text', text: 'Using a tool.' },
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'web_search',
              input: { query: 'vane' },
            },
          ],
          stop_reason: 'tool_use',
          usage: {},
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const llm = new AnthropicLLM({
      apiKey: 'test-key',
      baseURL: 'https://anthropic.test/v1',
      model: 'claude-test',
    });

    const output = await llm.generateText({
      messages: [{ role: 'user', content: 'search' }],
      tools: [tool],
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(requestBody.tools).toEqual([
      expect.objectContaining({
        description: 'Search the web',
        input_schema: expect.objectContaining({ type: 'object' }),
        name: 'web_search',
      }),
    ]);
    expect(output.toolCalls).toEqual([
      {
        id: 'tool_1',
        name: 'web_search',
        arguments: { query: 'vane' },
      },
    ]);
  });

  it('assembles streamed tool-call JSON deltas', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        [
          {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'tool_use',
              id: 'tool_1',
              name: 'web_search',
              input: {},
            },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: '{"query":"van',
            },
          },
          {
            type: 'content_block_delta',
            index: 0,
            delta: {
              type: 'input_json_delta',
              partial_json: 'e"}',
            },
          },
          {
            type: 'content_block_stop',
            index: 0,
          },
          {
            type: 'message_delta',
            delta: {
              stop_reason: 'tool_use',
            },
          },
        ].forEach((event) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n`),
          );
        });
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
    );

    const llm = new AnthropicLLM({
      apiKey: 'test-key',
      baseURL: 'https://anthropic.test/v1',
      model: 'claude-test',
    });

    const toolCalls: any[] = [];
    const chunks: any[] = [];

    for await (const chunk of llm.streamText({
      messages: [{ role: 'user', content: 'search' }],
      tools: [tool],
    })) {
      chunks.push(chunk);
      toolCalls.push(...chunk.toolCallChunk);
    }

    expect(toolCalls.at(-1)).toEqual({
      id: 'tool_1',
      name: 'web_search',
      arguments: { query: 'vane' },
    });
    expect(chunks.at(-1)?.done).toBe(true);
  });
});
