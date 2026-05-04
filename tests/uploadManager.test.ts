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

describe('UploadManager', () => {
  it('writes concurrent upload manifest updates without dropping files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vane-uploads-'));
    process.env.DATA_DIR = tempDir;
    vi.resetModules();

    const [{ default: UploadManager }, { default: BaseEmbedding }] =
      await Promise.all([
        import('@/lib/uploads/manager'),
        import('@/lib/models/base/embedding'),
      ]);

    class TestEmbedding extends BaseEmbedding<Record<string, never>> {
      async embedText(texts: string[]) {
        return texts.map((text, index) => [text.length, index]);
      }

      async embedChunks(chunks: any[]) {
        return chunks.map((chunk, index) => [
          String(chunk.content ?? '').length,
          index,
        ]);
      }
    }

    const manager = new UploadManager({
      embeddingModel: new TestEmbedding({}),
    });

    const first = manager.processFiles([
      new File(['alpha'], 'a.txt', { type: 'text/plain' }),
    ]);
    const second = manager.processFiles([
      new File(['beta'], 'b.txt', { type: 'text/plain' }),
    ]);

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.map((file) => file.fileName)).toEqual(['a.txt']);
    expect(secondResult.map((file) => file.fileName)).toEqual(['b.txt']);

    const manifestPath = path.join(
      tempDir,
      'data',
      'uploads',
      'uploaded_files.json',
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    expect(
      manifest.files.map((file: { name: string }) => file.name).sort(),
    ).toEqual(['a.txt', 'b.txt']);
  });
});
