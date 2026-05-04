import { describe, expect, it } from 'vitest';
import { sliceRewriteHistory } from '@/lib/hooks/chatHistory';

describe('sliceRewriteHistory', () => {
  it('keeps both human and assistant turns before the rewritten message', () => {
    const history: [string, string][] = [
      ['human', 'one'],
      ['assistant', 'one response'],
      ['human', 'two'],
      ['assistant', 'two response'],
      ['human', 'three'],
      ['assistant', 'three response'],
    ];

    expect(sliceRewriteHistory(history, 2)).toEqual([
      ['human', 'one'],
      ['assistant', 'one response'],
      ['human', 'two'],
      ['assistant', 'two response'],
    ]);
  });

  it('leaves history unchanged when the message index cannot be found', () => {
    const history: [string, string][] = [['human', 'one']];

    expect(sliceRewriteHistory(history, -1)).toBe(history);
  });
});
