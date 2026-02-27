import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from '@powersync/node';

interface Credentials {
  token: string;
  endpoint: string;
}

class PosConnector implements PowerSyncBackendConnector {
  private credentials: Credentials | null = null;

  setCredentials(creds: Credentials) {
    this.credentials = creds;
  }

  clearCredentials() {
    this.credentials = null;
  }

  async fetchCredentials() {
    if (!this.credentials) {
      throw new Error('PowerSync: not authenticated');
    }
    return this.credentials;
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    if (!this.credentials) return;

    const batch = await database.getCrudBatch(200);
    if (!batch) return;

    const res = await fetch(
      `${process.env.POWERSYNC_API_URL ?? 'https://anchorshop.cloud'}/api/sync/upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.credentials.token}`,
        },
        body: JSON.stringify({ batch: batch.crud }),
      }
    );

    if (!res.ok) {
      // throw so the SDK backs off and retries — do NOT call batch.complete()
      throw new Error(`Upload failed [${res.status}]: ${await res.text()}`);
    }

    await batch.complete();
  }
}

export const posConnector = new PosConnector();
