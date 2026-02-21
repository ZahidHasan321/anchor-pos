
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Auto-add SSL if it looks like a cloud database and is missing sslmode
let connectionString = env.DATABASE_URL;
if (connectionString.includes('pooler.local') || connectionString.includes('neon.tech') || connectionString.includes('supabase.com')) {
    if (!connectionString.includes('sslmode=')) {
        connectionString += connectionString.includes('?') ? '&sslmode=require' : '?sslmode=require';
    }
}

const client = globalThis.postgresClient || postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV === 'development') globalThis.postgresClient = client;

export const db = drizzle(client, { schema });

