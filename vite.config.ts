import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), compression()],
	ssr: {
		noExternal: ['chart.js', 'crypto-js', 'postgres']
	},
	server: {
		allowedHosts: true
	}
});
