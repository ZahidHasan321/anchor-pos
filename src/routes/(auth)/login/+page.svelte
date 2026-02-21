<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Lock, User, Loader2, AlertCircle, ShieldCheck } from '@lucide/svelte';
	import { fade, slide } from 'svelte/transition';

	let { form } = $props();
	let loading = $state(false);
</script>

<svelte:head>
	<title>Login — Anchor</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-muted/30 p-4">
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
								type="password"
								placeholder="••••••••"
								class="h-11 pl-10"
								required
								autocomplete="current-password"
								disabled={loading}
							/>
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
