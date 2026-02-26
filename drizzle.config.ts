import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;
if (!url && process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
	throw new Error('DATABASE_URL is not set');
}

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: url || '' },
	verbose: true,
	strict: true
});
