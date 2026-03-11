import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { mdsvex } from 'mdsvex';

const isNode = process.env.BUILD_TARGET === 'node' || process.env.BUILD_TARGET === 'electron' || process.env.NODE_ENV === 'production';
const isElectron = process.env.BUILD_TARGET === 'electron';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Use node adapter for Docker/VPS, auto for Vercel/Others
		adapter: isNode ? adapterNode({ out: 'build', precompress: true }) : adapterAuto(),
		csrf: {
			// Electron uses app:// protocol which can't pass standard CSRF origin checks.
			// Trust localhost and app:// origins for Electron, enforce for web.
			trustedOrigins: isElectron
				? ['app://-', 'http://127.0.0.1', 'http://localhost']
				: ['https://anchorshop.cloud']
		},
		alias: {
			'@/*': './src/lib/*'
		}
	},
	preprocess: [mdsvex()],
	extensions: ['.svelte', '.svx']
};

export default config;
