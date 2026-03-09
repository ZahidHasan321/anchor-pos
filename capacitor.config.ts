import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.auto.pos',
	appName: 'Auto POS',
	webDir: 'build/client',
	server: {
		// The Capacitor app loads your web app from this URL
		url: 'https://anchorshop.cloud',
		androidScheme: 'https',
		errorPath: 'offline.html',
		allowNavigation: ['*']
	},
	android: {
		allowMixedContent: true
	},
	plugins: {
		CapacitorThermalPrinter: {}
	}
};

export default config;
