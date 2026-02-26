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

// Use a more unique key for the global client
const client = globalThis.__POS_DB_CLIENT__ || postgres(connectionString, { 
    prepare: false,
    // Add a small idle timeout even in dev to help with HMR connection accumulation
    idle_timeout: 10
});

if (dev) {
    globalThis.__POS_DB_CLIENT__ = client;
}

export const db = drizzle(client, { schema });

