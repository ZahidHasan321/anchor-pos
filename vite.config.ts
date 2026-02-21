import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), compression()],
	ssr: {
		noExternal: ['chart.js', 'postgres', 'drizzle-orm']
	},
	server: {
		allowedHosts: true
	}
});
