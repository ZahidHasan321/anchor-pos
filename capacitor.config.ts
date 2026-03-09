import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.auto.pos',
	appName: 'Auto POS',
	webDir: 'build/client',
	server: {
		// The Capacitor app loads your web app from this URL and provides native Bluetooth access
		url: 'https://anchorshop.cloud',
		cleartext: true,
		androidScheme: 'https',
		errorPath: 'offline.html', // Try without leading slash
		allowNavigation: ['anchorshop.cloud', '*.anchorshop.cloud']
	},
	plugins: {
		CapacitorThermalPrinter: {}
	}
};

export default config;
