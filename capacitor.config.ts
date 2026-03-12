import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
	appId: 'com.auto.pos',
	appName: 'Auto POS',
	webDir: 'build/client',
	server: {
		// App loads from local device assets (no remote server URL).
		// This prevents the offline.html loop on mobile network hiccups.
		androidScheme: 'https',
		errorPath: 'offline.html',
		allowNavigation: ['anchorshop.cloud', '*.anchorshop.cloud']
	},
	android: {
		allowMixedContent: false
	},
	plugins: {
		CapacitorThermalPrinter: {}
	}
};

export default config;
