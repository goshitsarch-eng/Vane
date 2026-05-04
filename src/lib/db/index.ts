import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { dataPath, ensureDataDir } from '@/lib/paths';

ensureDataDir();

const sqlite = new Database(dataPath('db.sqlite'));
const db = drizzle(sqlite, {
  schema: schema,
});

export default db;
