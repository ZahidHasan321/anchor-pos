<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		Lock,
		User,
		Loader2,
		AlertCircle,
		ShieldCheck,
		Eye,
		EyeOff,
		Sun,
		Moon,
		Monitor
	} from '@lucide/svelte';
	import { fade, slide } from 'svelte/transition';
	import { setMode, resetMode } from 'mode-watcher';

	let { form } = $props();
	let loading = $state(false);
	let showPassword = $state(false);

	function setTheme(theme: 'light' | 'dark' | 'system') {
		if (theme === 'system') resetMode();
		else setMode(theme);
	}
</script>

<svelte:head>
	<title>Login — Anchor</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center bg-muted/30 p-4">
	<!-- Theme Toggle -->
	<div class="absolute top-4 right-4">
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="h-9 w-9 cursor-pointer rounded-full bg-background/50 shadow-sm backdrop-blur-md"
					>
						<Sun
							class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
						/>
						<Moon
							class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
						/>
						<span class="sr-only">Toggle theme</span>
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end">
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
	</div>

	<div class="w-full max-w-[400px] space-y-6">
		<!-- Brand Logo -->
		<div
			class="flex flex-col items-center justify-center space-y-2 text-center"
			in:fade={{ duration: 600 }}
		>
			<div
				class="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-2xl font-black text-primary-foreground italic shadow-xl shadow-primary/20"
			>
				A
			</div>
			<h1 class="text-3xl font-black tracking-tighter text-primary uppercase italic">Anchor</h1>
			<p class="text-sm font-medium text-muted-foreground">Clothing POS System</p>
		</div>

		<Card.Root class="border-border/50 shadow-2xl">
			<Card.Header class="space-y-1">
				<Card.Title class="text-center text-2xl">Welcome back</Card.Title>
				<Card.Description class="text-center"
					>Enter your credentials to access your account</Card.Description
				>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					use:enhance={() => {
						loading = true;
						return async ({ update }) => {
							loading = false;
							await update();
						};
					}}
					class="space-y-4"
				>
					{#if form?.error}
						<div
							in:slide={{ duration: 200 }}
							class="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive"
						>
							<AlertCircle class="h-4 w-4 shrink-0" />
							<p>{form.error}</p>
						</div>
					{/if}

					<div class="space-y-2">
						<Label for="username">Username</Label>
						<div class="relative">
							<User
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="username"
								name="username"
								placeholder="admin"
								class="h-11 pl-10"
								value={form?.username ?? ''}
								required
								autocomplete="username"
								disabled={loading}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="password">Password</Label>
						<div class="relative">
							<Lock
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								placeholder="••••••••"
								class="h-11 px-10"
								required
								autocomplete="current-password"
								disabled={loading}
							/>
							<button
								type="button"
								class="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground transition-colors hover:text-foreground focus:outline-hidden"
								onclick={() => (showPassword = !showPassword)}
								tabindex="-1"
							>
								{#if showPassword}
									<EyeOff class="h-4 w-4" />
								{:else}
									<Eye class="h-4 w-4" />
								{/if}
							</button>
						</div>
					</div>

					<Button
						type="submit"
						class="h-11 w-full text-base font-bold shadow-lg shadow-primary/20"
						disabled={loading}
					>
						{#if loading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Signing in...
						{:else}
							Sign In
						{/if}
					</Button>
				</form>
			</Card.Content>
			<Card.Footer class="flex flex-col items-center rounded-b-lg border-t bg-muted/20 py-4">
				<div
					class="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
				>
					<ShieldCheck class="h-3 w-3" />
					Secure Environment
				</div>
			</Card.Footer>
		</Card.Root>

		<p class="text-center text-xs text-muted-foreground">
			&copy; {new Date().getFullYear()} Anchor Clothing. All rights reserved.
		</p>
	</div>
</div>
