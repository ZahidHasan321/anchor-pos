/**
 * Unified environment variable access for both Vite dev and Electron packaged modes.
 *
 * - Vite dev: $env/dynamic/private is the canonical source (loads .env automatically)
 * - Electron packaged: electron-main.cjs loads .env via dotenv into process.env
 *   before booting SvelteKit, so process.env is the canonical source.
 *
 * IMPORTANT: Values are read lazily (via getters) because $env/dynamic/private
 * is not populated until after SvelteKit calls server.init(), which happens
 * AFTER all modules are imported. Module-level constants would capture empty values.
 */
import { env as svelteEnv } from '$env/dynamic/private';

function get(key: string): string {
	return svelteEnv[key] || process.env[key] || '';
}

const env = {
	get APP_SECRET_HEADER() { return get('APP_SECRET_HEADER'); },
	get POWERSYNC_API_URL() { return get('POWERSYNC_API_URL'); },
	get POWERSYNC_URL() { return get('POWERSYNC_URL'); },
	get POWERSYNC_PRIVATE_KEY() { return get('POWERSYNC_PRIVATE_KEY'); },
	get POWERSYNC_PUBLIC_KEY() { return get('POWERSYNC_PUBLIC_KEY'); },
	get BUILD_TARGET() { return get('BUILD_TARGET'); },
	get ELECTRON_USER_DATA() { return get('ELECTRON_USER_DATA'); },
	get IS_ELECTRON() { return get('BUILD_TARGET') === 'electron'; },
	get IS_CAPACITOR() { return get('BUILD_TARGET') === 'capacitor'; },
};

export default env;
