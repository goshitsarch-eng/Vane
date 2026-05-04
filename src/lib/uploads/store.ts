import BaseEmbedding from '../models/base/embedding';
import UploadManager from './manager';
import computeSimilarity from '../utils/computeSimilarity';
import { Chunk } from '../types';
import { hashObj } from '../utils/hash';

type UploadStoreParams = {
  embeddingModel: BaseEmbedding<any>;
  fileIds: string[];
};

type StoreRecord = {
  embedding: number[];
  content: string;
  fileId: string;
  metadata: Record<string, any>;
};

class UploadStore {
  embeddingModel: BaseEmbedding<any>;
  fileIds: string[];
  records: StoreRecord[] = [];

  constructor(private params: UploadStoreParams) {
    this.embeddingModel = params.embeddingModel;
    this.fileIds = params.fileIds;
    this.initializeStore();
  }

  initializeStore() {
    this.fileIds.forEach((fileId) => {
      const file = UploadManager.getFile(fileId);

      if (!file) {
        throw new Error(`File with ID ${fileId} not found`);
      }

      const chunks = UploadManager.getFileChunks(fileId);

      this.records.push(
        ...chunks.map((chunk) => ({
          embedding: chunk.embedding,
          content: chunk.content,
          fileId: fileId,
          metadata: {
            fileName: file.name,
            title: file.name,
            url: `file_id://${file.id}`,
          },
        })),
      );
    });
  }

  async query(queries: string[], topK: number): Promise<Chunk[]> {
    const queryEmbeddings = await this.embeddingModel.embedText(queries);

    const rankedResults = queryEmbeddings.map((query) => {
      const similarities = this.records
        .map((record) => {
          return {
            chunk: {
              content: record.content,
              metadata: {
                ...record.metadata,
                fileId: record.fileId,
              },
            },
            score: computeSimilarity(query, record.embedding),
          } as { chunk: Chunk; score: number };
        })
        .sort((a, b) => b.score - a.score);

      return {
        results: similarities,
        hashes: similarities.map((similarity) => hashObj(similarity)),
      };
    });

    const chunkMap: Map<string, Chunk> = new Map();
    const scoreMap: Map<string, number> = new Map();
    const k = 60;

    for (let i = 0; i < rankedResults.length; i++) {
      const { results, hashes } = rankedResults[i];

      for (let j = 0; j < results.length; j++) {
        const chunkHash = hashes[j];

        chunkMap.set(chunkHash, results[j].chunk);
        scoreMap.set(
          chunkHash,
          (scoreMap.get(chunkHash) || 0) + results[j].score / (j + 1 + k),
        );
      }
    }

    return Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([chunkHash]) => chunkMap.get(chunkHash)!)
      .slice(0, topK);
  }

  static getFileData(
    fileIds: string[],
  ): { fileName: string; initialContent: string }[] {
    const filesData: { fileName: string; initialContent: string }[] = [];

    fileIds.forEach((fileId) => {
      const file = UploadManager.getFile(fileId);

      if (!file) {
        throw new Error(`File with ID ${fileId} not found`);
      }

      const chunks = UploadManager.getFileChunks(fileId);

      filesData.push({
        fileName: file.name,
        initialContent: chunks
          .slice(0, 3)
          .map((chunk) => chunk.content)
          .join('\n---\n'),
      });
    });

    return filesData;
  }
}

export default UploadStore;
