import path from 'path';
import { DATA_ROOT } from './src/lib/paths';

export default {
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: path.join(DATA_ROOT, 'db.sqlite'),
  },
};
