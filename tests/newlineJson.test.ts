import { describe, expect, it } from 'vitest';
import { consumeNewlineJson, flushNewlineJson } from '@/lib/utils/newlineJson';

describe('newline JSON parsing', () => {
  it('keeps incomplete trailing JSON until the next chunk arrives', () => {
    const parsed: Array<{ value: number }> = [];

    let buffer = consumeNewlineJson('', '{"value":1}\n{"val', (message) => {
      parsed.push(message as { value: number });
    });

    expect(parsed).toEqual([{ value: 1 }]);
    expect(buffer).toBe('{"val');

    buffer = consumeNewlineJson(buffer, 'ue":2}\n', (message) => {
      parsed.push(message as { value: number });
    });

    expect(buffer).toBe('');
    expect(parsed).toEqual([{ value: 1 }, { value: 2 }]);
  });

  it('flushes a final JSON object without a trailing newline', () => {
    const parsed: Array<{ value: number }> = [];

    flushNewlineJson('{"value":3}', (message) => {
      parsed.push(message as { value: number });
    });

    expect(parsed).toEqual([{ value: 3 }]);
  });
});
