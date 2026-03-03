import { AppSchema } from './powersync-schema';
import { browser } from '$app/environment';

type PowerSyncDatabase = any;

export class PowerSyncManager {
    db!: PowerSyncDatabase;
    private static instance: PowerSyncManager;
    ready = $state(false);
    isConnected = $state(false);
    /** Increments each time a sync completes — use as a dependency in $effect to re-query */
    dataVersion = $state(0);
    private _readyResolve: (() => void) | null = null;
    private _readyPromise: Promise<void>;

    constructor() {
        this._readyPromise = new Promise((resolve) => {
            this._readyResolve = resolve;
        });
    }

    public static getInstance(): PowerSyncManager {
        if (!PowerSyncManager.instance) {
            PowerSyncManager.instance = new PowerSyncManager();
        }
        return PowerSyncManager.instance;
    }

    async init() {
        if (!browser) return;

        const { PowerSyncDatabase } = await import('@powersync/web');
        this.db = new PowerSyncDatabase({
            schema: AppSchema,
            database: {
                dbFilename: 'powersync.db'
            }
        });

        await this.db.init();
        console.log('PowerSync initialized');

        // Check for cached data immediately after init
        // OPFS retains data from previous sessions, so we can show it right away
        await this._checkCachedData();
    }

    private async _checkCachedData() {
        try {
            const count = await this.db.get('SELECT COUNT(*) as cnt FROM ps_oplog') as { cnt: number } | null;
            if (count && count.cnt > 0) {
                console.log('PowerSync: cached data found, marking ready immediately');
                this._markReady();
            }
        } catch {
            // ps_oplog may not exist yet on first run - that's fine
        }
    }

    private _markReady() {
        if (!this.ready) {
            this.ready = true;
            this._readyResolve?.();
        }
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

            // Listen for sync status changes to bump dataVersion
            this._listenForSyncChanges();

            // Wait for initial sync if not already ready from cached data
            if (!this.ready) {
                this._waitForInitialSync();
            }
        } catch (e) {
            console.error('PowerSync connection failed:', e);
            // If connection fails, still mark ready after a short delay
            // so the UI isn't stuck on skeletons forever
            setTimeout(() => this._markReady(), 2000);
        }
    }

    private _listenForSyncChanges() {
        let lastConnected = false;

        this.db.registerListener({
            statusChanged: (status: any) => {
                // Detect when downloading completes (transition from downloading to idle)
                const downloading = status?.dataFlowStatus?.downloading;
                const connected = status?.connected;

                if (connected && downloading === false && lastConnected) {
                    // Sync just finished downloading — bump version so pages re-query
                    this.dataVersion++;
                    console.log('PowerSync: sync completed, dataVersion =', this.dataVersion);
                }

                lastConnected = !!connected;
            }
        });
    }

    private async _waitForInitialSync() {
        try {
            // Check if data appeared since init
            const count = await this.db.get('SELECT COUNT(*) as cnt FROM ps_oplog') as { cnt: number } | null;
            if (count && count.cnt > 0) {
                this._markReady();
                return;
            }

            // Check sync status
            const status = this.db.currentStatus;
            if (status?.dataFlowStatus?.downloading === false && status?.connected) {
                this._markReady();
                return;
            }

            // Poll for data arrival
            const check = setInterval(async () => {
                try {
                    const count = await this.db.get('SELECT COUNT(*) as cnt FROM ps_oplog') as { cnt: number } | null;
                    if (count && count.cnt > 0) {
                        this._markReady();
                        clearInterval(check);
                    }
                } catch {
                    // DB not ready yet
                }
            }, 500);

            // Timeout after 5s - mark ready anyway (first-time user with no data)
            setTimeout(() => {
                if (!this.ready) {
                    console.warn('PowerSync initial sync timeout, marking ready');
                    this._markReady();
                    clearInterval(check);
                }
            }, 5000);
        } catch {
            // If ps_oplog doesn't exist yet, mark ready quickly
            setTimeout(() => this._markReady(), 1000);
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
