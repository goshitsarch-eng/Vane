import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'fs';
import { Mutex } from 'async-mutex';
import { PDFParse } from 'pdf-parse';
import { CanvasFactory } from 'pdf-parse/worker';
import officeParser from 'officeparser';
import BaseEmbedding from '../models/base/embedding';
import { dataPath } from '../paths';
import { writeJsonAtomicSync } from '../utils/atomic';
import { splitText } from '../utils/splitText';

const supportedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

type SupportedMimeType = (typeof supportedMimeTypes)[number];

type UploadManagerParams = {
  embeddingModel: BaseEmbedding<any>;
};

type RecordedFile = {
  id: string;
  name: string;
  filePath: string;
  contentPath: string;
  uploadedAt: string;
};

type FileRes = {
  fileName: string;
  fileExtension: string;
  fileId: string;
};

class UploadManager {
  private embeddingModel: BaseEmbedding<any>;
  private static recordMutex = new Mutex();
  static uploadsDir = dataPath('uploads');
  static uploadedFilesRecordPath = path.join(
    this.uploadsDir,
    'uploaded_files.json',
  );

  constructor(private params: UploadManagerParams) {
    this.embeddingModel = params.embeddingModel;
    UploadManager.ensureStorage();
  }

  private static ensureStorage() {
    if (!fs.existsSync(UploadManager.uploadsDir)) {
      fs.mkdirSync(UploadManager.uploadsDir, { recursive: true });
    }

    if (!fs.existsSync(UploadManager.uploadedFilesRecordPath)) {
      writeJsonAtomicSync(UploadManager.uploadedFilesRecordPath, {
        files: [],
      });
    }
  }

  private static getRecordedFiles(): RecordedFile[] {
    UploadManager.ensureStorage();

    const data = fs.readFileSync(UploadManager.uploadedFilesRecordPath, 'utf-8');
    const parsed = JSON.parse(data);

    return Array.isArray(parsed.files) ? parsed.files : [];
  }

  private static async addNewRecordedFiles(fileRecords: RecordedFile[]) {
    if (fileRecords.length === 0) return;

    await this.recordMutex.runExclusive(async () => {
      const currentData = this.getRecordedFiles();

      writeJsonAtomicSync(UploadManager.uploadedFilesRecordPath, {
        files: [...currentData, ...fileRecords],
      });
    });
  }

  static getFile(fileId: string): RecordedFile | null {
    const recordedFiles = this.getRecordedFiles();

    return recordedFiles.find((file) => file.id === fileId) || null;
  }

  static getFileChunks(
    fileId: string,
  ): { content: string; embedding: number[] }[] {
    try {
      const recordedFile = this.getFile(fileId);

      if (!recordedFile) {
        throw new Error(`File with ID ${fileId} not found`);
      }

      const contentData = JSON.parse(
        fs.readFileSync(recordedFile.contentPath, 'utf-8'),
      );

      return Array.isArray(contentData.chunks) ? contentData.chunks : [];
    } catch (err) {
      console.log('Error getting file chunks:', err);
      return [];
    }
  }

  private getContentPath(filePath: string) {
    const parsed = path.parse(filePath);
    return path.join(parsed.dir, `${parsed.name}.content.json`);
  }

  private async embedAndWrite(filePath: string, text: string): Promise<string> {
    const chunks = splitText(text, 512, 128);
    const embeddings = await this.embeddingModel.embedText(chunks);

    if (embeddings.length !== chunks.length) {
      throw new Error('Embeddings and text chunks length mismatch');
    }

    const contentPath = this.getContentPath(filePath);

    writeJsonAtomicSync(contentPath, {
      chunks: chunks.map((content, i) => ({
        content,
        embedding: embeddings[i],
      })),
    });

    return contentPath;
  }

  private async extractContentAndEmbed(
    filePath: string,
    fileType: SupportedMimeType,
  ): Promise<string> {
    switch (fileType) {
      case 'text/plain': {
        const content = fs.readFileSync(filePath, 'utf-8');
        return this.embedAndWrite(filePath, content);
      }
      case 'application/pdf': {
        const pdfBuffer = fs.readFileSync(filePath);
        const parser = new PDFParse({
          data: pdfBuffer,
          CanvasFactory,
        });
        const pdfText = await parser.getText().then((res) => res.text);

        return this.embedAndWrite(filePath, pdfText);
      }
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
        const docBuffer = fs.readFileSync(filePath);
        const docText = (await officeParser.parseOffice(docBuffer)).toText();

        return this.embedAndWrite(filePath, docText);
      }
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  }

  async processFiles(files: File[]): Promise<FileRes[]> {
    const processed = await Promise.all(
      files.map(async (file) => {
        if (!(supportedMimeTypes as unknown as string[]).includes(file.type)) {
          throw new Error(`File type ${file.type} not supported`);
        }

        const fileId = crypto.randomBytes(16).toString('hex');
        const fileExtension = file.name.split('.').pop() || '';
        const fileName = `${crypto.randomBytes(16).toString('hex')}.${fileExtension}`;
        const filePath = path.join(UploadManager.uploadsDir, fileName);
        const buffer = Buffer.from(await file.arrayBuffer());

        fs.writeFileSync(filePath, buffer);

        const contentPath = await this.extractContentAndEmbed(
          filePath,
          file.type as SupportedMimeType,
        );

        return {
          record: {
            id: fileId,
            name: file.name,
            filePath,
            contentPath,
            uploadedAt: new Date().toISOString(),
          },
          response: {
            fileExtension,
            fileId,
            fileName: file.name,
          },
        };
      }),
    );

    await UploadManager.addNewRecordedFiles(
      processed.map((file) => file.record),
    );

    return processed.map((file) => file.response);
  }
}

export default UploadManager;
