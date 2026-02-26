import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const connectionString = env.DATABASE_URL;

if (dev) {
    console.log(`[DB] Initializing in dev mode...`);
}

// Only initialize if we have a connection string
let dbInstance: any = null;
let client: any = null;

if (connectionString) {
    client = (globalThis as any).__POS_DB_CLIENT__ || postgres(connectionString, { 
        prepare: false,
        idle_timeout: 10
    });

    if (dev) {
        (globalThis as any).__POS_DB_CLIENT__ = client;
    }
    dbInstance = drizzle(client, { schema });
} else {
    console.warn('[DB] No DATABASE_URL found. Running in offline-only mode.');
}

export const db = dbInstance;

