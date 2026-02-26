import { PowerSyncDatabase } from '@powersync/web';
import { AppSchema } from './powersync-schema';
import { browser } from '$app/environment';

export class PowerSyncManager {
    db: PowerSyncDatabase;
    private static instance: PowerSyncManager;
    private remoteBase = 'https://anchorshop.cloud';

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
            // Connect to PowerSync service via our Nginx proxy
            const powersyncUrl = import.meta.env.VITE_POWERSYNC_URL || `${this.remoteBase}/powersync`;
            
            // Casting to any to satisfy the complex PowerSync version-specific types 
            const connector: any = {
                endpoint: powersyncUrl,
                fetchToken: async () => {
                    const res = await fetch(`${this.remoteBase}/api/powersync/token`, {
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
                        const res = await fetch(`${this.remoteBase}/api/powersync/upload`, {
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
