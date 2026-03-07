import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

const isCapacitor = process.env.CAPACITOR_BUILD === 'true';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), ...(!isCapacitor ? [compression()] : [])],
	ssr: {
		noExternal: [
			'chart.js',
			'postgres',
			'drizzle-orm',
			'jose',
			'kysely',
			'async-mutex',
			'bson',
			'jsbarcode',
			/^@powersync\/.*/,
			/^@journeyapps\/.*/,
			/^@oslojs\/.*/
		],
		external: ['electron']
	},
	optimizeDeps: {
		exclude: ['@powersync/web', '@journeyapps/wa-sqlite']
	},
	worker: {
		format: 'es'
	},
	build: {
		chunkSizeWarningLimit: 1000
	},
	server: {
		allowedHosts: true
	}
});
