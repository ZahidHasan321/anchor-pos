<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import {
		Store,
		Users,
		ClipboardList,
		ShieldAlert
	} from '@lucide/svelte';
	import { page } from '$app/state';
	import { fade } from 'svelte/transition';

	let { children } = $props();

	const navItems = [
		{ label: 'Store Settings', href: '/settings', icon: Store },
		{ label: 'User Management', href: '/settings/users', icon: Users },
		{ label: 'Role Permissions', href: '/settings/permissions', icon: ShieldAlert },
		{ label: 'Audit Log', href: '/settings/audit', icon: ClipboardList }
	];
</script>

<div class="space-y-5 p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 md:pb-6">
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
			<p class="text-sm text-muted-foreground sm:text-base">
				Configure your store and manage system settings.
			</p>
		</div>
	</div>

	<!-- Settings Navigation Tabs -->
	<div class="flex flex-wrap gap-2 border-b pb-4">
		{#each navItems as item}
			<Button
				variant={page.url.pathname === item.href ? 'default' : 'ghost'}
				href={item.href}
				class="h-9 flex-1 cursor-pointer px-3 text-xs sm:flex-none sm:text-sm"
			>
				<item.icon class="mr-2 h-4 w-4" />
				{item.label}
			</Button>
		{/each}
	</div>

	{#key page.url.pathname}
		<div in:fade={{ duration: 150 }}>
			{@render children()}
		</div>
	{/key}
</div>
