import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './powersync-schema';
import { browser } from '$app/environment';

export class PowerSyncManager {
    db!: PowerSyncDatabase;
    private static instance: PowerSyncManager;
    ready = $state(false);
    isConnected = $state(false);
    private _readyResolve: (() => void) | null = null;
    private _readyPromise: Promise<void>;

    constructor() {
        this._readyPromise = new Promise((resolve) => {
            this._readyResolve = resolve;
        });

        if (browser) {
            this.db = new PowerSyncDatabase({
                schema: AppSchema,
                database: {
                    dbFilename: 'powersync.db'
                }
            });
        }
    }

    public static getInstance(): PowerSyncManager {
        if (!PowerSyncManager.instance) {
            PowerSyncManager.instance = new PowerSyncManager();
        }
        return PowerSyncManager.instance;
    }

    async init() {
        if (!browser) return;

        await this.db.init();
        console.log('PowerSync initialized');
    }

    async connect() {
        if (!browser) return;

        try {
            const powersyncUrl = import.meta.env.VITE_POWERSYNC_URL || 'https://powersync.anchorshop.cloud';

            const connector: any = {
                fetchCredentials: async () => {
                    try {
                        const res = await fetch(`/api/powersync/token`, {
                            credentials: 'include'
                        });
                        if (!res.ok) {
                            console.warn('PowerSync token fetch failed:', res.status);
                            return null;
                        }
                        const { token } = await res.json();
                        return {
                            endpoint: powersyncUrl,
                            token: token
                        };
                    } catch (e) {
                        console.warn('PowerSync credential fetch error:', e);
                        return null;
                    }
                },
                uploadData: async (database: any) => {
                    const transaction = await database.getNextCrudTransaction();
                    if (!transaction) return;

                    let retries = 0;
                    const maxRetries = 3;
                    while (retries <= maxRetries) {
                        try {
                            const res = await fetch(`/api/powersync/upload`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ mutations: transaction.crud })
                            });

                            if (res.ok) {
                                await transaction.complete();
                                return;
                            }
                            throw new Error(`Upload failed: ${res.status}`);
                        } catch (e) {
                            retries++;
                            if (retries > maxRetries) {
                                console.error('Data upload failed after retries:', e);
                                throw e;
                            }
                            await new Promise(r => setTimeout(r, 1000 * retries));
                        }
                    }
                }
            };

            await this.db.connect(connector);
            this.isConnected = true;
            console.log('PowerSync connected');

            // Wait for initial sync to mark as ready
            this._waitForInitialSync();
        } catch (e) {
            console.error('PowerSync connection failed:', e);
        }
    }

    private async _waitForInitialSync() {
        try {
            // Check if we already have data (from a previous session's OPFS cache)
            const count = await this.db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ps_oplog');
            if (count && count.cnt > 0) {
                this.ready = true;
                this._readyResolve?.();
                return;
            }

            // Otherwise wait for the first sync complete status
            const status = this.db.currentStatus;
            if (status?.dataFlowStatus?.downloading === false && status?.connected) {
                this.ready = true;
                this._readyResolve?.();
                return;
            }

            // Poll for ready state
            const check = setInterval(async () => {
                try {
                    const count = await this.db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM ps_oplog');
                    if (count && count.cnt > 0) {
                        this.ready = true;
                        this._readyResolve?.();
                        clearInterval(check);
                    }
                } catch {
                    // DB not ready yet
                }
            }, 500);

            // Timeout after 30s - mark ready anyway (may have cached data)
            setTimeout(() => {
                if (!this.ready) {
                    console.warn('PowerSync initial sync timeout, marking ready with cached data');
                    this.ready = true;
                    this._readyResolve?.();
                    clearInterval(check);
                }
            }, 30000);
        } catch {
            // If ps_oplog doesn't exist yet, wait a bit
            setTimeout(() => {
                this.ready = true;
                this._readyResolve?.();
            }, 2000);
        }
    }

    waitForReady(): Promise<void> {
        if (this.ready) return Promise.resolve();
        return this._readyPromise;
    }

    watchQuery<T = any>(sql: string, params: any[] = []): { current: T[]; stop: () => void } {
        const state = $state<{ current: T[] }>({ current: [] });
        let stopped = false;

        if (browser && this.db) {
            const run = async () => {
                try {
                    const watch = this.db.watch(sql, params);
                    for await (const result of watch) {
                        if (stopped) break;
                        state.current = (result.rows as any)?._array || [];
                    }
                } catch (e) {
                    console.error('watchQuery error:', e);
                }
            };
            run();
        }

        return {
            get current() { return state.current; },
            stop() { stopped = true; }
        };
    }
}

export const powersync = PowerSyncManager.getInstance();
