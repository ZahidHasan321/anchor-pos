<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Eye,
		EyeOff,
		UserPlus,
		ShieldAlert,
		KeyRound,
		Store,
		Users,
		ClipboardList,
		ExternalLink,
		Camera
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import * as Avatar from '$lib/components/ui/avatar';
	import { confirmState } from '$lib/confirm.svelte';
	import { roleLabels } from '$lib/utils';

	let { data, form } = $props();

	const navItems = [
		{ label: 'Store Settings', href: '/settings', icon: Store },
		{ label: 'User Management', href: '/settings/users', icon: Users },
		{ label: 'Role Permissions', href: '/settings/permissions', icon: ShieldAlert },
		{ label: 'Audit Log', href: '/settings/audit', icon: ClipboardList }
	];

	let showPassword = $state(false);
	let isCreateDialogOpen = $state(false);
	let isResetDialogOpen = $state(false);
	let selectedUser = $state<any>(null);
	let previewUrl = $state<string | null>(null);

	$effect(() => {
		if (form?.success) {
			if (form.message) toast.success(form.message);
			isCreateDialogOpen = false;
			isResetDialogOpen = false;
		} else if (form?.message) {
			toast.error(form.message);
		}
	});
</script>

<div class="space-y-6 p-3 sm:p-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
		<p class="text-sm text-muted-foreground sm:text-base">Configure your store and manage system settings.</p>
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

	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-xl font-bold tracking-tight">User Management</h2>
		<Button onclick={() => (isCreateDialogOpen = true)} class="cursor-pointer">
			<UserPlus class="mr-2 h-4 w-4" /> Create User
		</Button>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>All Users</Card.Title>
			<Card.Description>Manage your team members and their access levels.</Card.Description>
		</Card.Header>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="pl-6">Name</Table.Head>
						<Table.Head>Username</Table.Head>
						<Table.Head>Role</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="pr-6 text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.users as user}
						<Table.Row>
							<Table.Cell class="pl-6">
								<div class="flex items-center gap-3">
									<Avatar.Root class="h-8 w-8">
										<Avatar.Image src={user.imageUrl} alt={user.name} />
										<Avatar.Fallback>{user.name.charAt(0)}</Avatar.Fallback>
									</Avatar.Root>
									<div class="flex flex-col">
										<span class="font-medium">{user.name}</span>
										{#if user.email}
											<span class="text-xs text-muted-foreground">{user.email}</span>
										{/if}
									</div>
								</div>
							</Table.Cell>
							<Table.Cell class="text-xs">@{user.username}</Table.Cell>
							<Table.Cell class="text-xs">{roleLabels[user.role] ?? user.role}</Table.Cell>
							<Table.Cell>
								<Badge variant={user.isActive ? 'default' : 'destructive'} class="text-[10px]">
									{user.isActive ? 'Active' : 'Inactive'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="pr-6 text-right">
								<div class="flex items-center justify-end gap-2">
									<Button variant="outline" size="icon" href="/settings/users/{user.id}" class="h-8 w-8">
										<ExternalLink class="h-4 w-4" />
									</Button>
									<form action="?/toggleActive" method="POST" use:enhance class="inline">
										<input type="hidden" name="id" value={user.id} />
										<input type="hidden" name="isActive" value={user.isActive} />
										<Button
											variant="outline"
											size="sm"
											type="button"
											class="h-8 cursor-pointer text-xs"
											disabled={user.id === data.user.id}
											onclick={async (e) => {
												const formElement = e.currentTarget.closest('form');
												const action = user.isActive ? 'Deactivate' : 'Activate';
												if (
													await confirmState.confirm({
														title: `${action} User`,
														message: `Are you sure you want to ${action.toLowerCase()} user ${user.name}?`,
														confirmText: action,
														variant: user.isActive ? 'destructive' : 'default'
													})
												) {
													formElement?.requestSubmit();
												}
											}}
										>
											{user.isActive ? 'Deact.' : 'Act.'}
										</Button>
									</form>
									<Button
										variant="outline"
										size="icon"
										onclick={() => {
											selectedUser = user;
											isResetDialogOpen = true;
										}}
										class="h-8 w-8 cursor-pointer"
									>
										<KeyRound class="h-4 w-4" />
									</Button>
								</div>
							</Table.Cell>
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>

<!-- Create User Dialog -->
<Dialog.Root bind:open={isCreateDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Create New User</Dialog.Title>
			<Dialog.Description>Add a new staff member to the system.</Dialog.Description>
		</Dialog.Header>
		<form
			action="?/create"
			method="POST"
			use:enhance
			enctype="multipart/form-data"
			class="space-y-4"
		>
			<div class="flex justify-center pb-4">
				<label
					class="group relative cursor-pointer"
					for="create-image-upload"
				>
					<Avatar.Root
						class="h-20 w-20 border-2 border-muted transition-colors group-hover:border-primary"
					>
						<Avatar.Image src={previewUrl} alt="Preview" />
						<Avatar.Fallback class="bg-muted">
							<Camera class="h-8 w-8 text-muted-foreground" />
						</Avatar.Fallback>
					</Avatar.Root>
					<div
						class="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
					>
						<Camera class="h-6 w-6 text-white" />
					</div>
					<input
						id="create-image-upload"
						name="image"
						type="file"
						class="hidden"
						accept="image/*"
						onchange={(e) => {
							const file = e.currentTarget.files?.[0];
							if (file) {
								if (file.size > 2 * 1024 * 1024) {
									toast.error('Image size must be less than 2MB');
									e.currentTarget.value = '';
									return;
								}
								previewUrl = URL.createObjectURL(file);
							}
						}}
					/>
				</label>
			</div>

			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="name">Full Name</Label>
					<Input id="name" name="name" placeholder="e.g. Zahid Hasan" required />
				</div>
				<div class="space-y-2">
					<Label for="username">Username</Label>
					<Input id="username" name="username" placeholder="e.g. zahid" required />
				</div>
			</div>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="space-y-2">
					<Label for="email">Email (Optional)</Label>
					<Input id="email" name="email" type="email" placeholder="zahid@example.com" />
				</div>
				<div class="space-y-2">
					<Label for="phone">Phone (Optional)</Label>
					<Input id="phone" name="phone" placeholder="01XXXXXXXXX" />
				</div>
			</div>
			<div class="space-y-2">
				<Label for="role">Role</Label>
				<select
					name="role"
					class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
					required
				>
					<option value="sales">Sales Person</option>
					<option value="manager">Inventory Manager</option>
					<option value="admin">Admin (Owner)</option>
				</select>
			</div>
			<div class="space-y-2">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						required
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
			<Dialog.Footer>
				<Button type="submit" class="w-full cursor-pointer">Create User</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Reset Password Dialog -->
<Dialog.Root bind:open={isResetDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Reset Password</Dialog.Title>
			<Dialog.Description>
				Enter a new password for <strong>{selectedUser?.name}</strong>.
			</Dialog.Description>
		</Dialog.Header>
		<form action="?/resetPassword" method="POST" use:enhance class="space-y-4">
			<input type="hidden" name="id" value={selectedUser?.id} />
			<div class="space-y-2">
				<Label for="new-password">New Password</Label>
				<div class="relative">
					<Input
						id="new-password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						required
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
			<Dialog.Footer>
				<Button
					type="button"
					class="w-full cursor-pointer"
					onclick={async (e) => {
						const formElement = e.currentTarget.closest('form');
						if (
							await confirmState.confirm({
								title: 'Reset Password',
								message: `Are you sure you want to reset the password for ${selectedUser?.name}?`,
								confirmText: 'Reset Password',
								variant: 'destructive'
							})
						) {
							formElement?.requestSubmit();
						}
					}}
				>
					Reset Password
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
