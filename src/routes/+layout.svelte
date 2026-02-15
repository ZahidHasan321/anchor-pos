<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from 'svelte-sonner';
	import { TooltipProvider } from '$lib/components/ui/tooltip';
	import ConfirmDialog from '$lib/components/ui/confirm-dialog.svelte';

	let { children, data } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
<Toaster richColors position="top-right" />
<TooltipProvider>
	{@render children()}
</TooltipProvider>
<ConfirmDialog />
