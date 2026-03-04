<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from 'svelte-sonner';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import ConfirmDialog from '$lib/components/ui/confirm-dialog.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { globalSettings } from '$lib/settings.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';

	let { data, children } = $props();

	// Initialize state before DOM is updated (works on server and client)
	$effect.pre(() => {
		if (data.storeSettings) {
			globalSettings.update(
				data.storeSettings.store_locale,
				data.storeSettings.store_timezone,
				data.storeSettings.store_currency
			);
		}
	});

	// Initialize PowerSync once in Electron mode
	let powersyncInitialized = false;
	$effect(() => {
		const isElectron = import.meta.env.BUILD_TARGET === 'electron' || (browser && (window as any).electron);
		if (!browser || !isElectron || powersyncInitialized) return;
		powersyncInitialized = true;
		powersync.init().then(() => powersync.connect());
	});

	// In Electron mode, load store settings from PowerSync once ready
	$effect(() => {
		const isElectron = import.meta.env.BUILD_TARGET === 'electron' || (browser && (window as any).electron);
		if (browser && isElectron && powersync.ready) {
			powersync.db.getAll('SELECT * FROM store_settings').then((rows: any[]) => {
				const settings: Record<string, string> = {};
				for (const row of rows) {
					settings[row.key] = row.value;
				}
				globalSettings.update(
					settings.store_locale,
					settings.store_timezone,
					settings.store_currency
				);
			});
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
<Toaster richColors position="top-right" />
<TooltipProvider>
	{@render children()}
</TooltipProvider>
<ConfirmDialog />
