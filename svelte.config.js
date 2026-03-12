import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { mdsvex } from 'mdsvex';

const isCapacitor = process.env.BUILD_TARGET === 'capacitor';
const isNode = !isCapacitor && (process.env.BUILD_TARGET === 'node' || process.env.BUILD_TARGET === 'electron' || process.env.NODE_ENV === 'production');
const isElectron = process.env.BUILD_TARGET === 'electron';

function getAdapter() {
	if (isCapacitor) return adapterStatic({ pages: 'build/client', assets: 'build/client', fallback: 'index.html', precompress: false });
	if (isNode) return adapterNode({ out: 'build', precompress: true });
	return adapterAuto();
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: getAdapter(),
		csrf: {
			// Electron uses app:// protocol which can't pass standard CSRF origin checks.
			// Trust localhost and app:// origins for Electron, enforce for web.
			// Capacitor uses https://localhost (no form actions in SPA mode, but list for safety).
			trustedOrigins: isElectron
				? ['app://-', 'http://127.0.0.1', 'http://localhost']
				: isCapacitor
				? ['https://localhost']
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
