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

	$effect(() => {
		if (browser && (window as any).electron) {
			powersync.init().then(() => {
				if (data.user) {
					powersync.connect();
				}
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
