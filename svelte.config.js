import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import { mdsvex } from 'mdsvex';

const isNode = process.env.BUILD_TARGET === 'node' || process.env.BUILD_TARGET === 'electron' || process.env.NODE_ENV === 'production';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// Use node adapter for Docker/VPS, auto for Vercel/Others
		adapter: isNode ? adapterNode({ out: 'build', precompress: true }) : adapterAuto(),
		csrf: {
			checkOrigin: false // Disable origin check to allow Electron app to communicate
		},
		alias: {
			'@/*': './src/lib/*'
		}
	},
	preprocess: [mdsvex()],
	extensions: ['.svelte', '.svx']
};

export default config;
