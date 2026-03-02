import { getPowerSyncDb } from './db.js';
import { posConnector } from './connector.js';

let connected = false;

export async function connectPowerSync(token: string) {
  const db = getPowerSyncDb();
  console.log('[PowerSync-Node] Starting connection to backend...');

  posConnector.setCredentials({
    token,
    endpoint: process.env.POWERSYNC_URL ?? 'https://powersync.anchorshop.cloud',
  });

  if (!connected) {
    await db.connect(posConnector);
    connected = true;
  }
}

export async function refreshPowerSyncToken(token: string) {
  posConnector.setCredentials({
    token,
    endpoint: process.env.POWERSYNC_URL ?? 'https://powersync.anchorshop.cloud',
  });
}

export async function disconnectPowerSync() {
  posConnector.clearCredentials();
  await getPowerSyncDb().disconnect();
  connected = false;
}
