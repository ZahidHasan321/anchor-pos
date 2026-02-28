import { PowerSyncDatabase } from '@powersync/node';
import { AppSchema } from './schema.js';
import path from 'path';
import os from 'os';

let _db: PowerSyncDatabase | null = null;

export function getPowerSyncDb(): PowerSyncDatabase & { isFunctional: boolean } {
  if (!_db) {
    const dataDir = process.env.POWERSYNC_DATA_DIR ?? os.homedir();
    try {
      _db = new PowerSyncDatabase({
        schema: AppSchema,
        database: { dbFilename: path.join(dataDir, 'pos-local.db') },
      });
      (_db as any).isFunctional = true;
    } catch (e) {
      console.error('[PowerSync] Failed to initialize local DB:', e);
      // Return a dummy object that won't crash the app immediately
      const dummy = {
        isFunctional: false,
        getAll: async () => [],
        getOptional: async () => null,
        execute: async () => ({ rowsAffected: 0 }),
        writeTransaction: async (fn: any) => {
          const tx = {
            getAll: async () => [],
            getOptional: async () => null,
            execute: async () => ({ rowsAffected: 0 })
          };
          return await fn(tx);
        },
        connect: async () => {},
        disconnect: async () => {},
        waitForFirstSync: async () => {}
      } as any;
      return dummy;
    }
  }
  return _db as any;
}
