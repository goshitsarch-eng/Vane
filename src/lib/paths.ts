import fs from 'node:fs';
import path from 'node:path';

const normalizeDataRoot = () => {
  const configured = process.env.DATA_DIR?.trim();

  if (!configured) {
    return path.join(process.cwd(), 'data');
  }

  const resolved = path.resolve(configured);

  return path.basename(resolved) === 'data'
    ? resolved
    : path.join(resolved, 'data');
};

export const DATA_ROOT = normalizeDataRoot();
export const MIGRATIONS_ROOT = path.join(process.cwd(), 'drizzle');

export const dataPath = (...segments: string[]) => {
  return path.join(DATA_ROOT, ...segments);
};

export const ensureDataDir = () => {
  fs.mkdirSync(DATA_ROOT, { recursive: true });
};
