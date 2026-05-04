import { describe, expect, it } from 'vitest';
import z from 'zod';
import ActionRegistry from '@/lib/agents/search/researcher/actions/registry';
import { ResearchAction } from '@/lib/agents/search/types';
import SessionManager from '@/lib/session';

const wait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('ActionRegistry', () => {
  it('preserves tool-call order when actions resolve out of order', async () => {
    const makeAction = (
      name: string,
      delayMs: number,
    ): ResearchAction<z.ZodObject<{ value: z.ZodString }>> => ({
      name,
      schema: z.object({ value: z.string() }),
      getToolDescription: () => name,
      getDescription: () => name,
      enabled: () => true,
      execute: async (params) => {
        await wait(delayMs);
        return {
          type: 'reasoning',
          reasoning: params.value,
        };
      },
    });

    const slowActionName = `test_slow_${crypto.randomUUID()}`;
    const fastActionName = `test_fast_${crypto.randomUUID()}`;

    ActionRegistry.register(makeAction(slowActionName, 20));
    ActionRegistry.register(makeAction(fastActionName, 1));

    const results = await ActionRegistry.executeAll(
      [
        {
          id: 'slow',
          name: slowActionName,
          arguments: { value: 'first' },
        },
        {
          id: 'fast',
          name: fastActionName,
          arguments: { value: 'second' },
        },
      ],
      {
        embedding: null,
        fileIds: [],
        llm: null as any,
        mode: 'speed',
        researchBlockId: 'research',
        session: new SessionManager('session'),
      },
    );

    expect(results).toEqual([
      { type: 'reasoning', reasoning: 'first' },
      { type: 'reasoning', reasoning: 'second' },
    ]);
  });
});
