<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from 'svelte-sonner';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import ConfirmDialog from '$lib/components/ui/confirm-dialog.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import { globalSettings } from '$lib/settings.svelte';
	import { powersync } from '$lib/powersync';
	import { browser } from '$app/environment';

	let props = $props();

	// Initialize state immediately (works on server and client)
	if (props.data.storeSettings) {
		globalSettings.update(
			props.data.storeSettings.store_locale,
			props.data.storeSettings.store_timezone,
			props.data.storeSettings.store_currency
		);
	}

	$effect(() => {
		if (browser && (window as any).electron) {
			powersync.init().then(() => {
				if (props.data.user) {
					powersync.connect();
				}
			});
		}
		if (props.data.storeSettings) {
			globalSettings.update(
				props.data.storeSettings.store_locale,
				props.data.storeSettings.store_timezone,
				props.data.storeSettings.store_currency
			);
		}
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<ModeWatcher />
<Toaster richColors position="top-right" />
<TooltipProvider>
	{@render props.children()}
</TooltipProvider>
<ConfirmDialog />
