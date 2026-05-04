import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const writeFileAtomicSync = (filePath: string, content: string) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    fs.rmSync(tmpPath, { force: true });
    throw err;
  }
};

export const writeJsonAtomicSync = (filePath: string, data: unknown) => {
  writeFileAtomicSync(filePath, JSON.stringify(data, null, 2));
};
