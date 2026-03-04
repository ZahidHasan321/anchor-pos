import { AppSchema } from './powersync-schema';
import { browser } from '$app/environment';
import { toast } from 'svelte-sonner';

type PowerSyncDatabase = any;

export class PowerSyncManager {
    db!: PowerSyncDatabase;
    private static instance: PowerSyncManager;
    ready = $state(false);
    isConnected = $state(false);
    /** Increments each time a sync completes — use as a dependency in $effect to re-query */
    dataVersion = $state(0);
    connectionStatus = $state<'online' | 'offline' | 'syncing'>('offline');
    private _readyResolve: (() => void) | null = null;
    private _readyPromise: Promise<void>;
    private _lastToastTime = 0;
    private _lastToastType = '';

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

    private _initialized = false;

    async init() {
        if (!browser || this._initialized) return;
        this._initialized = true;

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

    private _connecting = false;

    async connect() {
        if (!browser || this._connecting) return;
        this._connecting = true;

        try {
            const powersyncUrl = import.meta.env.VITE_POWERSYNC_URL || import.meta.env.POWERSYNC_URL || 'https://powersync.anchorshop.cloud';

            const connector: any = {
                fetchCredentials: async () => {
                    const maxAttempts = 3;
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            const res = await fetch(`/api/powersync/token`, {
                                credentials: 'include'
                            });
                            if (!res.ok) {
                                console.error(`PowerSync token fetch failed (attempt ${attempt}/${maxAttempts}):`, res.status);
                                if (attempt < maxAttempts) {
                                    await new Promise(r => setTimeout(r, 1000 * attempt));
                                    continue;
                                }
                                throw new Error(`Token fetch failed: ${res.status}`);
                            }
                            const { token } = await res.json();
                            return {
                                endpoint: powersyncUrl,
                                token: token
                            };
                        } catch (e) {
                            console.error(`PowerSync credential fetch error (attempt ${attempt}/${maxAttempts}):`, e);
                            if (attempt < maxAttempts) {
                                await new Promise(r => setTimeout(r, 1000 * attempt));
                                continue;
                            }
                            throw e;
                        }
                    }
                    throw new Error('PowerSync token fetch exhausted retries');
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

    private _fireToast(type: string, fn: () => void) {
        const now = Date.now();
        if (type === this._lastToastType && now - this._lastToastTime < 3000) return;
        this._lastToastType = type;
        this._lastToastTime = now;
        fn();
    }

    private _listenForSyncChanges() {
        let lastConnected = false;
        let lastDownloading = false;
        let lastUploading = false;
        let initialSync = true;

        // Also listen for browser online/offline events
        if (browser) {
            window.addEventListener('offline', () => {
                this.connectionStatus = 'offline';
                this._fireToast('offline', () =>
                    toast.warning('You are offline. Changes will sync when reconnected.')
                );
            });
            window.addEventListener('online', () => {
                // PowerSync will reconnect automatically; mark syncing
                if (this.connectionStatus === 'offline') {
                    this.connectionStatus = 'syncing';
                }
            });
        }

        this.db.registerListener({
            statusChanged: (status: any) => {
                const downloading = !!status?.dataFlowStatus?.downloading;
                const uploading = !!status?.dataFlowStatus?.uploading;
                const connected = !!status?.connected;
                const isSyncing = connected && (downloading || uploading);

                // Update connection status
                if (!connected) {
                    this.connectionStatus = 'offline';
                } else if (isSyncing) {
                    this.connectionStatus = 'syncing';
                } else {
                    this.connectionStatus = 'online';
                }

                // Toast: went offline
                if (!connected && lastConnected) {
                    this._fireToast('offline', () =>
                        toast.warning('You are offline. Changes will sync when reconnected.')
                    );
                }

                // Toast: came back online
                if (connected && !lastConnected && !initialSync) {
                    this._fireToast('reconnect', () =>
                        toast.info('Back online. Syncing...')
                    );
                }

                // Toast: sync completed (downloading or uploading finished)
                if (connected && !initialSync) {
                    const downloadFinished = !downloading && lastDownloading;
                    const uploadFinished = !uploading && lastUploading;
                    if ((downloadFinished || uploadFinished) && !isSyncing) {
                        this._fireToast('synced', () =>
                            toast.success('Data synced successfully')
                        );
                    }
                }

                // Detect when downloading completes (transition from downloading to idle)
                if (connected && downloading === false && lastConnected) {
                    this.dataVersion++;
                    console.log('PowerSync: sync completed, dataVersion =', this.dataVersion);
                }

                lastConnected = connected;
                lastDownloading = downloading;
                lastUploading = uploading;
                initialSync = false;
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
