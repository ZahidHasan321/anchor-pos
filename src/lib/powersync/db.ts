import { PowerSyncDatabase } from '@powersync/node';
import { AppSchema } from './schema.js';
import path from 'path';
import os from 'os';

let _db: PowerSyncDatabase | null = null;

export function getPowerSyncDb(): PowerSyncDatabase {
  if (!_db) {
    const dataDir = process.env.POWERSYNC_DATA_DIR ?? os.homedir();
    const dbPath = path.join(dataDir, 'pos-local.db');
    console.log(`[PowerSync-Node] Initializing database at: ${dbPath}`);
    _db = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: dbPath },
    });
  }
  return _db;
}
