<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button';
	import { AlertCircle, RefreshCw, Home, ServerCrash } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { APP_NAME } from '$lib/constants';

	const status = $derived($page.status);
	const message = $derived($page.error?.message || 'An unexpected error occurred');

	// Log error details for debugging (visible in adb logcat)
	$effect(() => {
		if (browser) {
			console.error(
				`[SvelteKit Error] Status: ${status}, Message: ${message}, URL: ${window.location.href}, Error:`,
				$page.error
			);
		}
	});

	function reload() {
		if (browser) window.location.reload();
	}
</script>

<div class="flex min-h-dvh flex-col items-center justify-center bg-background p-6 text-center">
	<div class="mb-6 rounded-full bg-destructive/10 p-4 text-destructive">
		{#if status === 404}
			<AlertCircle size={48} />
		{:else}
			<ServerCrash size={48} />
		{/if}
	</div>

	<h1 class="mb-2 text-3xl font-black tracking-tighter text-foreground uppercase italic">
		{#if status === 404}
			Page Not Found
		{:else}
			System Error
		{/if}
	</h1>

	<p class="mb-8 max-w-md text-muted-foreground">
		{message}
		{#if status !== 404}
			<br /><span class="mt-2 block font-mono text-xs opacity-50">Status Code: {status}</span>
		{/if}
	</p>

	<div class="flex flex-col gap-3 sm:flex-row">
		<Button variant="default" size="lg" onclick={reload} class="gap-2">
			<RefreshCw size={18} />
			Try Again
		</Button>

		<Button variant="outline" size="lg" href="/dashboard" class="gap-2">
			<Home size={18} />
			Back to Dashboard
		</Button>
	</div>

	<div
		class="mt-12 text-[10px] font-bold tracking-widest text-muted-foreground uppercase opacity-30"
	>
		{APP_NAME} Native Engine
	</div>
</div>
