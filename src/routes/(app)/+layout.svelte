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
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { confirmState } from '$lib/confirm.svelte';
	import { roleLabels } from '$lib/utils';

	let { data, children } = $props();
	let isMobileMenuOpen = $state(false);
	let collapsed = $state(true);

	let logoutForm: HTMLFormElement;
	let mobileLogoutForm: HTMLFormElement;

	const user = $derived(data.user);
	const permissions = $derived(data.permissions ?? []);

	// Sync theme class on client-side hydration and user data changes
	function applyTheme(theme: string) {
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = theme === 'dark' || (theme === 'system' && prefersDark);
		document.documentElement.classList.toggle('dark', isDark);
		document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
		// Remove the server-injected FOUC-prevention style — Tailwind CSS handles it now
		document.getElementById('theme-init')?.remove();
	}

	$effect(() => {
		if (!browser) return;
		applyTheme(user?.theme || 'system');
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

	async function setTheme(theme: 'light' | 'dark' | 'system') {
		await fetch('/api/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ theme })
		});

		// Refresh all data to sync user profile theme
		await invalidateAll();

		if (!browser) return;
		applyTheme(theme);
	}

	async function handleLogout(e: Event, form: HTMLFormElement) {
		e.preventDefault();
		const confirmed = await confirmState.confirm({
			title: 'Logout',
			message: 'Are you sure you want to logout?',
			confirmText: 'Logout',
			variant: 'destructive'
		});
		if (confirmed) {
			form.requestSubmit();
		}
	}
</script>

<div class="flex min-h-screen bg-background text-foreground">
	<!-- Desktop Sidebar -->
	<aside
		class="fixed top-0 left-0 z-30 hidden h-screen border-r bg-card transition-all duration-300 md:flex md:flex-col print:hidden {collapsed
			? 'w-16'
			: 'w-64'}"
	>
		<!-- Sidebar Header: User info + collapse toggle -->
		<div
			class="flex h-16 items-center border-b px-4 {collapsed
				? 'justify-center'
				: 'justify-between'}"
		>
			{#if !collapsed}
				<div class="flex min-w-0 items-center gap-3">
					<Avatar class="h-8 w-8 shrink-0">
						{#if user?.imageUrl}
							<img
								src={user.imageUrl}
								alt={user.name}
								class="h-full w-full rounded-full object-cover"
							/>
						{:else}
							<AvatarFallback class="bg-primary text-xs font-bold text-primary-foreground">
								{user?.name?.charAt(0) ?? 'U'}
							</AvatarFallback>
						{/if}
					</Avatar>
					<div class="min-w-0">
						<p class="truncate text-sm font-semibold">{user?.name}</p>
						<p class="text-xs text-muted-foreground">
							{roleLabels[user?.role ?? ''] ?? user?.role}
						</p>
					</div>
				</div>
			{/if}
			<button
				onclick={() => (collapsed = !collapsed)}
				class="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				{#if collapsed}
					<ChevronRight class="h-4 w-4" />
				{:else}
					<ChevronLeft class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- Nav Links -->
		<nav class="flex-1 overflow-y-auto py-4 {collapsed ? 'px-2' : 'px-3'}">
			<div class="space-y-1">
				{#each navItems as item}
					{@const active = isActive(item.href)}
					{#if collapsed}
						<Tooltip.Root>
							<Tooltip.Trigger>
								{#snippet child({ props })}
									<a
										{...props}
										href={item.href}
										class="flex cursor-pointer items-center justify-center rounded-md p-2.5 transition-colors
                      {active
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
									>
										<item.icon class="h-5 w-5" />
									</a>
								{/snippet}
							</Tooltip.Trigger>
							<Tooltip.Content side="right">{item.label}</Tooltip.Content>
						</Tooltip.Root>
					{:else}
						<a
							href={item.href}
							class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors
                {active
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
						>
							<item.icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/if}
				{/each}
			</div>
		</nav>

		<!-- Bottom: Theme toggle + Logout -->
		<div class="space-y-1 border-t p-3 {collapsed ? 'px-2' : ''}">
			<!-- Theme Toggle -->
			{#if collapsed}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								class="flex w-full cursor-pointer items-center justify-center rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-accent"
							>
								<Sun
									class="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
								/>
								<Moon
									class="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
								/>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="right" align="end">
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer">
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer">
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer">
							<Monitor class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button
								{...props}
								class="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
							>
								<Sun
									class="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
								/>
								<Moon
									class="absolute ml-0 h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
								/>
								<span class="ml-4">Theme</span>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content side="right" align="end">
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer">
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer">
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer">
							<Monitor class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/if}

			<!-- Logout -->
			<form
				action="/logout"
				method="POST"
				use:enhance
				bind:this={logoutForm}
				onsubmit={(e) => handleLogout(e, logoutForm)}
			>
				{#if collapsed}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="submit"
									class="flex w-full cursor-pointer items-center justify-center rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
								>
									<LogOut class="h-5 w-5" />
								</button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content side="right">Logout</Tooltip.Content>
					</Tooltip.Root>
				{:else}
					<Button
						variant="ghost"
						class="w-full cursor-pointer justify-start gap-3 text-muted-foreground hover:text-destructive"
						type="submit"
					>
						<LogOut class="h-4 w-4" />
						Logout
					</Button>
				{/if}
			</form>
		</div>
	</aside>

	<!-- Mobile Top Bar (minimal — just menu button) -->
	<div
		class="fixed top-0 right-0 left-0 z-20 flex h-12 items-center border-b bg-card/95 px-4 backdrop-blur-sm md:hidden print:hidden"
	>
		<Sheet.Root bind:open={isMobileMenuOpen}>
			<Sheet.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="cursor-pointer">
						<Menu class="h-5 w-5" />
						<span class="sr-only">Toggle menu</span>
					</Button>
				{/snippet}
			</Sheet.Trigger>
			<Sheet.Content side="left" class="w-64 p-0">
				<div class="flex h-16 items-center gap-3 border-b px-6">
					<Avatar class="h-8 w-8">
						{#if user?.imageUrl}
							<img
								src={user.imageUrl}
								alt={user.name}
								class="h-full w-full rounded-full object-cover"
							/>
						{:else}
							<AvatarFallback class="bg-primary text-xs font-bold text-primary-foreground">
								{user?.name?.charAt(0) ?? 'U'}
							</AvatarFallback>
						{/if}
					</Avatar>
					<div>
						<p class="text-sm font-semibold">{user?.name}</p>
						<p class="text-xs text-muted-foreground">
							{roleLabels[user?.role ?? ''] ?? user?.role}
						</p>
					</div>
				</div>
				<nav class="space-y-1 p-4">
					{#each navItems as item}
						{@const active = isActive(item.href)}
						<a
							href={item.href}
							class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                {active
								? 'bg-primary text-primary-foreground'
								: 'hover:bg-accent hover:text-accent-foreground'}"
							onclick={() => (isMobileMenuOpen = false)}
						>
							<item.icon class="h-4 w-4" />
							{item.label}
						</a>
					{/each}
					<Separator class="my-4" />
					<!-- Theme toggle for mobile -->
					<div class="flex items-center gap-2 px-3 py-2">
						<span class="text-sm text-muted-foreground">Theme:</span>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('light')}
						>
							<Sun class="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('dark')}
						>
							<Moon class="h-4 w-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							class="h-8 w-8 cursor-pointer"
							onclick={() => setTheme('system')}
						>
							<Monitor class="h-4 w-4" />
						</Button>
					</div>
					<Separator class="my-4" />
					<form
						action="/logout"
						method="POST"
						use:enhance
						bind:this={mobileLogoutForm}
						onsubmit={(e) => handleLogout(e, mobileLogoutForm)}
					>
						<Button variant="ghost" class="w-full cursor-pointer justify-start gap-3" type="submit">
							<LogOut class="h-4 w-4" />
							Logout
						</Button>
					</form>
				</nav>
			</Sheet.Content>
		</Sheet.Root>
		<span class="ml-3 text-sm font-semibold">Clothing POS</span>
	</div>

	<!-- Main Content Area -->
	<div
		class="flex min-w-0 flex-1 flex-col pt-12 transition-all duration-300 md:pt-0 {collapsed
			? 'md:ml-16'
			: 'md:ml-64'}"
	>
		{#if $navigating}
			<div
				class="fixed top-12 right-0 left-0 z-50 h-1 md:top-0 {collapsed
					? 'md:left-16'
					: 'md:left-64'}"
			>
				<div class="h-full w-full overflow-hidden bg-primary/20">
					<div class="progress-bar-value h-full bg-primary"></div>
				</div>
			</div>
		{/if}

		<main class="flex-1 overflow-y-auto">
			{@render children()}
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
</style>
