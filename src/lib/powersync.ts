import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './powersync-schema';
import { browser } from '$app/environment';

export class PowerSyncManager {
    db: PowerSyncDatabase;
    private static instance: PowerSyncManager;

    constructor() {
        this.db = new PowerSyncDatabase({
            schema: AppSchema,
            database: {
                dbFilename: 'powersync.db'
            }
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
        
        await this.db.init();
        console.log('PowerSync initialized');
    }

    async connect() {
        if (!browser) return;

        try {
            // In Electron, VITE_POWERSYNC_URL should be the remote PowerSync service
            const powersyncUrl = import.meta.env.VITE_POWERSYNC_URL || 'https://powersync.anchorshop.cloud';
            
            // Casting to any to satisfy the complex PowerSync version-specific types 
            const connector: any = {
                endpoint: powersyncUrl,
                fetchToken: async () => {
                    const res = await fetch(`/api/powersync/token`, {
                        credentials: 'include'
                    });
                    if (!res.ok) return null;
                    const { token } = await res.json();
                    return token;
                },
                uploadData: async (database: any) => {
                    const transaction = await database.getNextCrudTransaction();
                    if (!transaction) return;

                    try {
                        const res = await fetch(`/api/powersync/upload`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ mutations: transaction.crud })
                        });

                        if (res.ok) {
                            await transaction.complete();
                        } else {
                            throw new Error('Upload failed');
                        }
                    } catch (e) {
                        console.error('Data upload failed:', e);
                        throw e;
                    }
                }
            };

            await this.db.connect(connector);
            console.log('PowerSync connected');
        } catch (e) {
            console.error('PowerSync connection failed:', e);
        }
    }
}

export const powersync = PowerSyncManager.getInstance();
