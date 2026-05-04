import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDataDir = process.env.DATA_DIR;

afterEach(() => {
  if (originalDataDir === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = originalDataDir;
  }
  vi.resetModules();
});

describe('API route validation', () => {
  it('/api/search returns 400 for malformed client input', async () => {
    const { POST } = await import('@/app/api/search/route');

    const response = await POST(
      new Request('http://localhost/api/search', {
        method: 'POST',
        body: JSON.stringify({
          query: '',
          sources: [],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
    expect(body.error).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'query' }),
        expect.objectContaining({ path: 'sources' }),
      ]),
    );
  });

  it('/api/search returns 400 for malformed JSON', async () => {
    const { POST } = await import('@/app/api/search/route');

    const response = await POST(
      new Request('http://localhost/api/search', {
        method: 'POST',
        body: '{',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual(
      expect.objectContaining({
        message: 'Invalid request body',
        error: 'Malformed JSON',
      }),
    );
  });

  it('/api/config accepts empty string config values', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vane-config-'));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();

    const { POST } = await import('@/app/api/config/route');

    const response = await POST(
      new Request('http://localhost/api/config', {
        method: 'POST',
        body: JSON.stringify({
          key: 'personalization.instructions',
          value: '',
        }),
      }) as any,
    );

    expect(response.status).toBe(200);
  });

  it('/api/config returns 400 when the config value is omitted', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vane-config-'));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();

    const { POST } = await import('@/app/api/config/route');

    const response = await POST(
      new Request('http://localhost/api/config', {
        method: 'POST',
        body: JSON.stringify({
          key: 'personalization.instructions',
        }),
      }) as any,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe('Invalid request body');
  });
});
