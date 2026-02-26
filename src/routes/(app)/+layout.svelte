<script lang="ts">
	import {
		LayoutDashboard,
		Package,
		ShoppingCart,
		Receipt,
		Users,
		Wallet,
		Settings,
		LogOut,
		Menu,
		Sun,
		Moon,
		Monitor,
		ChevronLeft,
		ChevronRight,
		BarChart3
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { Separator } from '$lib/components/ui/separator';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { setMode, resetMode } from 'mode-watcher';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { navigating } from '$app/stores';
	import { confirmState } from '$lib/confirm.svelte';
	import { roleLabels } from '$lib/utils';
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';

	let { data, children } = $props();
	let isMobileMenuOpen = $state(false);

	// Initialize from server-side data (using a closure to avoid capturing initial props warning)
	let collapsed = $state(untrack(() => data.sidebarCollapsed));
	$effect(() => {
		collapsed = data.sidebarCollapsed;
	});

	let logoutForm: HTMLFormElement;
	let mobileLogoutForm: HTMLFormElement;

	const user = $derived(data.user);
	const permissions = $derived(data.permissions ?? []);

	// Persistence: Update cookie when state changes
	function toggleSidebar() {
		collapsed = !collapsed;
		// Sync to cookie so it persists on reload
		document.cookie = `sidebar_collapsed=${collapsed}; path=/; max-age=31536000; SameSite=Lax`;
	}

	// Sync user's DB theme preference
	let hasSyncedTheme = false;
	$effect(() => {
		if (!browser || !user?.theme || hasSyncedTheme) return;
		hasSyncedTheme = true;
		const stored = localStorage.getItem('mode-watcher-mode');
		if (stored !== user.theme) {
			if (user.theme === 'system') resetMode();
			else setMode(user.theme as 'light' | 'dark');
		}
	});

	const allNavItems = [
		{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, resource: 'dashboard' },
		{ href: '/inventory', label: 'Inventory', icon: Package, resource: 'inventory' },
		{ href: '/pos', label: 'POS', icon: ShoppingCart, resource: 'pos' },
		{ href: '/orders', label: 'Orders', icon: Receipt, resource: 'orders' },
		{ href: '/customers', label: 'Customers', icon: Users, resource: 'customers' },
		{ href: '/cashbook', label: 'Cashbook', icon: Wallet, resource: 'cashbook' },
		{ href: '/reports', label: 'Reports', icon: BarChart3, resource: 'reports' },
		{ href: '/settings', label: 'Settings', icon: Settings, resource: 'settings' }
	];

	const navItems = $derived(
		allNavItems.filter((item) => {
			if (!user) return false;
			if (item.resource === 'settings') return user.role === 'admin';
			return permissions.includes(item.resource);
		})
	);

	function isActive(href: string): boolean {
		if (!browser) return false;
		const currentPath = $page.url.pathname;
		if (href === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(href);
	}

	function setTheme(theme: 'light' | 'dark' | 'system') {
		if (theme === 'system') resetMode();
		else setMode(theme);
		fetch('/api/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ theme })
		});
	}

	async function handleLogout(e: Event, form: HTMLFormElement) {
		e.preventDefault();
		const confirmed = await confirmState.confirm({
			title: 'Logout',
			message: 'Are you sure you want to logout?',
			confirmText: 'Logout',
			variant: 'destructive'
		});
		if (confirmed) form.requestSubmit();
	}
</script>

<!-- CSS Variable sync for industry standard performance -->
<div
	class="flex h-screen w-full bg-background text-foreground"
	style="--sidebar-width: {collapsed ? '64px' : '256px'}"
>
	<!-- Desktop Sidebar -->
	<aside
		class="relative z-30 hidden h-full shrink-0 border-r bg-card transition-[width] duration-300 ease-in-out md:flex md:flex-col print:hidden"
		style="width: var(--sidebar-width)"
	>
		<!-- Brand Header -->
		<div
			class="flex h-16 items-center border-b px-4 transition-all duration-300 {collapsed
				? 'justify-center'
				: 'justify-start'} overflow-hidden"
		>
			<div class="flex shrink-0 items-center gap-3">
				<div
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary font-black text-primary-foreground italic shadow-lg shadow-primary/20"
				>
					A
				</div>
				{#if !collapsed}
					<span
						in:fade={{ delay: 150, duration: 150 }}
						class="text-xl font-black tracking-tighter whitespace-nowrap text-primary uppercase italic"
						>Anchor</span
					>
				{/if}
			</div>
		</div>

		<!-- Nav Links -->
		<nav class="scrollbar-none flex-1 overflow-y-auto py-4 {collapsed ? 'px-2' : 'px-3'}">
			<div class="space-y-1">
				{#each navItems as item}
					{@const active = isActive(item.href)}
					{#if collapsed}
						<Tooltip.Root delayDuration={0}>
							<Tooltip.Trigger class="w-full">
								{#snippet child({ props })}
									<a
										{...props}
										href={item.href}
										class="flex h-10 w-full items-center justify-center rounded-md transition-all {active
											? 'bg-primary text-primary-foreground shadow-md'
											: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
									>
										<item.icon class="h-5 w-5" />
									</a>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="right" class="font-medium">{item.label}</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href={item.href}
							class="flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-all {active
								? 'bg-primary text-primary-foreground shadow-md'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
						>
							<item.icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/if}
				{/each}
			</div>
		</nav>

		<!-- Bottom Section -->
		<div class="mt-auto space-y-2 border-t p-3">
			<!-- User Dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="w-full">
					{#snippet child({ props })}
						<button
							{...props}
							class="group flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-lg p-1.5 transition-colors hover:bg-accent"
						>
							<Avatar class="h-8 w-8 shrink-0 border border-border shadow-sm">
								{#if user?.imageUrl}<img
										src={user.imageUrl}
										alt={user.name}
										class="h-full w-full rounded-full object-cover"
									/>
								{:else}<AvatarFallback class="bg-muted text-[10px] font-bold"
										>{user?.name?.charAt(0) ?? 'U'}</AvatarFallback
									>{/if}
							</Avatar>
							{#if !collapsed}
								<div in:fade={{ delay: 150 }} class="flex min-w-0 flex-1 flex-col items-start">
									<span class="truncate text-sm leading-tight font-semibold">{user?.name}</span>
									<span class="truncate text-[10px] tracking-wider text-muted-foreground uppercase"
										>{roleLabels[user?.role ?? ''] ?? user?.role}</span
									>
								</div>
							{/if}
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					side={collapsed ? 'right' : 'top'}
					align={collapsed ? 'end' : 'center'}
					class="w-56"
				>
					<DropdownMenu.Label class="font-normal">
						<div class="flex flex-col space-y-1">
							<p class="text-sm leading-none font-medium">{user?.name}</p>
							<p class="text-xs leading-none text-muted-foreground">{user?.username}</p>
						</div>
					</DropdownMenu.Label>
					<DropdownMenu.Separator />
					<DropdownMenu.Group>
						<DropdownMenu.Label
							class="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase"
							>Theme</DropdownMenu.Label
						>
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer"
							><Sun class="mr-2 h-4 w-4" /> Light</DropdownMenu.Item
						>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer"
							><Moon class="mr-2 h-4 w-4" /> Dark</DropdownMenu.Item
						>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer"
							><Monitor class="mr-2 h-4 w-4" /> System</DropdownMenu.Item
						>
					</DropdownMenu.Group>
					<DropdownMenu.Separator />
					<form
						action="/logout"
						method="POST"
						use:enhance
						bind:this={logoutForm}
						onsubmit={(e) => handleLogout(e, logoutForm)}
					>
						<DropdownMenu.Item
							class="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
							onSelect={(e) => {
								e.preventDefault();
								handleLogout(e, logoutForm);
							}}
						>
							<LogOut class="mr-2 h-4 w-4" /> Logout
						</DropdownMenu.Item>
					</form>
				</DropdownMenu.Content>
			</DropdownMenu.Root>

			<!-- Collapse Toggle -->
			<button
				onclick={toggleSidebar}
				class="flex w-full cursor-pointer items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				title={collapsed ? 'Expand' : 'Collapse'}
			>
				{#if collapsed}<ChevronRight class="h-5 w-5" />{:else}<ChevronLeft class="h-5 w-5" />{/if}
			</button>
		</div>
	</aside>

	<!-- Mobile Header -->
	<div
		class="fixed top-0 right-0 left-0 z-20 flex h-12 items-center border-b bg-card/95 px-4 backdrop-blur-sm md:hidden print:hidden"
	>
		<Sheet.Root bind:open={isMobileMenuOpen}>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="cursor-pointer"
						><Menu class="h-5 w-5" /></Button
					>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="left" class="w-64 p-0">
				<div class="flex h-16 items-center gap-3 border-b px-6">
					<Avatar class="h-8 w-8">
						{#if user?.imageUrl}<img
								src={user.imageUrl}
								alt={user.name}
								class="h-full w-full rounded-full object-cover"
							/>
						{:else}<AvatarFallback class="bg-muted text-[10px] font-bold"
								>{user?.name?.charAt(0) ?? 'U'}</AvatarFallback
							>{/if}
					</Avatar>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">{user?.name}</p>
						<p class="text-[10px] tracking-wider text-muted-foreground uppercase">
							{roleLabels[user?.role ?? ''] ?? user?.role}
						</p>
					</div>
				</div>
				<nav class="space-y-1 p-4">
					{#each navItems as item}
						{@const active = isActive(item.href)}
						<a
							href={item.href}
							class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors {active
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent hover:text-accent-foreground'}"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<item.icon class="h-4 w-4" />
							{item.label}
						</a>
					{/each}
					<Separator class="my-4" />
					<div class="flex items-center gap-2 px-3 py-2">
						<span class="text-sm text-muted-foreground">Theme:</span>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => setTheme('light')}
							><Sun class="h-4 w-4" /></Button
						>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => setTheme('dark')}
							><Moon class="h-4 w-4" /></Button
						>
						<Button variant="ghost" size="icon" class="h-8 w-8" onclick={() => setTheme('system')}
							><Monitor class="h-4 w-4" /></Button
						>
					</div>
					<Separator class="my-4" />
					<form
						action="/logout"
						method="POST"
						use:enhance
						bind:this={mobileLogoutForm}
						onsubmit={(e) => handleLogout(e, mobileLogoutForm)}
					>
						<Button variant="ghost" class="w-full justify-start gap-3" type="submit"
							><LogOut class="h-4 w-4" /> Logout</Button
						>
					</form>
				</nav>
			</Sheet.Content>
		</Sheet.Root>
		<span class="ml-3 text-sm font-black tracking-tighter text-primary uppercase italic"
			>Anchor</span
		>
	</div>

	<!-- Main Content Area -->
	<div class="flex min-w-0 flex-1 flex-col pt-12 md:pt-0" data-sveltekit-preload-data="hover">
		<main class="grid flex-1 overflow-hidden bg-background">
			{#key $page.url.pathname}
				<div
					class="col-start-1 row-start-1 flex flex-col overflow-y-auto bg-background w-full h-full"
					in:fade={{ duration: 150 }}
					out:fade={{ duration: 150 }}
				>
					{@render children()}
				</div>
			{/key}
		</main>
	</div>
</div>

<style>
	.progress-bar-value {
		width: 100%;
		animation: progress-animation 2s infinite linear;
		transform-origin: 0% 50%;
	}
	@keyframes progress-animation {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(0);
		}
		100% {
			transform: translateX(100%);
		}
	}
	:global(.scrollbar-none::-webkit-scrollbar) {
		display: none;
	}
	:global(.scrollbar-none) {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
