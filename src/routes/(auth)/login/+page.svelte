<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import { Eye, EyeOff } from '@lucide/svelte';

	let { form } = $props();
	let showPassword = $state(false);
	let loading = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-background p-4">
	<Card.Root class="w-full max-w-sm">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl font-bold">Welcome Back</Card.Title>
			<Card.Description>Sign in to your account</Card.Description>
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
					<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
						{form.error}
					</div>
				{/if}

				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input
						id="username"
						name="username"
						value={form?.username ?? ''}
						placeholder="Enter your username"
						required
						autocomplete="username"
					/>
				</div>

				<div class="space-y-2">
					<Label for="password">Password</Label>
					<div class="relative">
						<Input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							placeholder="Enter your password"
							required
							autocomplete="current-password"
							class="pr-10"
						/>
						<button
							type="button"
							class="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
							onclick={() => (showPassword = !showPassword)}
							tabindex={-1}
						>
							{#if showPassword}
								<EyeOff class="h-4 w-4" />
							{:else}
								<Eye class="h-4 w-4" />
							{/if}
						</button>
					</div>
				</div>

				<Button type="submit" class="w-full cursor-pointer" disabled={loading}>
					{loading ? 'Signing in...' : 'Sign In'}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
