// In Capacitor builds (VITE_BUILD_TARGET=capacitor), the app is served from local device
// assets as a static SPA — no server-side rendering. For web and Electron, SSR is enabled.
export const ssr = import.meta.env.VITE_BUILD_TARGET !== 'capacitor';
