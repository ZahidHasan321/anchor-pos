import { PowerSyncDatabase } from '@powersync/node';
import { AppSchema } from './schema.js';
import path from 'path';
import os from 'os';

let _db: PowerSyncDatabase | null = null;

export function getPowerSyncDb(): PowerSyncDatabase {
  if (!_db) {
    const dataDir = process.env.POWERSYNC_DATA_DIR ?? os.homedir();
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: path.join(dataDir, 'pos-local.db') },
    });
  }
  return _db;
}
