<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Store, Users, ClipboardList, ShieldAlert, Save, Loader2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { roleLabels } from '$lib/utils';

	let { data, form } = $props();

	const navItems = [
		{ label: 'Store Settings', href: '/settings', icon: Store },
		{ label: 'User Management', href: '/settings/users', icon: Users },
		{ label: 'Role Permissions', href: '/settings/permissions', icon: ShieldAlert },
		{ label: 'Audit Log', href: '/settings/audit', icon: ClipboardList }
	];

	const resourceLabels: Record<string, string> = {
		dashboard: 'Dashboard',
		inventory: 'Inventory',
		pos: 'POS',
		orders: 'Orders',
		customers: 'Customers',
		cashbook: 'Cashbook',
		reports: 'Reports'
	};

	// Track checked state per role
	let checkedState: Record<string, Record<string, boolean>> = $state({});
	let savingRole = $state<string | null>(null);

	// Initialize checked state from server data
	$effect(() => {
		const state: Record<string, Record<string, boolean>> = {};
		for (const role of data.configurableRoles) {
			state[role] = {};
			for (const resource of data.allResources) {
				state[role][resource] = data.permissionsByRole[role]?.includes(resource) ?? false;
			}
		}
		checkedState = state;
	});

	$effect(() => {
		if (form?.success) {
			toast.success(`Permissions updated for ${roleLabels[form.role] ?? form.role}`);
		} else if (form?.error) {
			toast.error(form.error);
		}
	});

	function getCheckedResources(role: string): string[] {
		if (!checkedState[role]) return [];
		return Object.entries(checkedState[role])
			.filter(([, checked]) => checked)
			.map(([resource]) => resource);
	}
</script>

<div class="space-y-6 p-3 sm:p-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
		<p class="text-sm text-muted-foreground sm:text-base">
			Configure your store and manage system settings.
		</p>
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

	<div>
		<h2 class="text-xl font-bold tracking-tight">Role Permissions</h2>
		<p class="text-sm text-muted-foreground">
			Configure which pages each role can access. Admin (Owner) always has full access.
		</p>
	</div>

	<div class="grid gap-6 lg:grid-cols-2">
		{#each data.configurableRoles as role}
			<Card.Root>
				<Card.Header>
					<Card.Title>{roleLabels[role] ?? role}</Card.Title>
					<Card.Description>Select which pages this role can access.</Card.Description>
				</Card.Header>
				<Card.Content>
					<form
						action="?/update"
						method="POST"
						use:enhance={() => {
							savingRole = role;
							return async ({ update }) => {
								savingRole = null;
								await update();
							};
						}}
					>
						<input type="hidden" name="role" value={role} />
						<div class="space-y-3">
							{#each data.allResources as resource}
								<label class="flex cursor-pointer items-center gap-3">
									<input
										type="checkbox"
										name="resources"
										value={resource}
										checked={checkedState[role]?.[resource] ?? false}
										onchange={(e) => {
											if (checkedState[role]) {
												checkedState[role][resource] = e.currentTarget.checked;
											}
										}}
										class="h-4 w-4 rounded border-input text-primary accent-primary"
									/>
									<span class="text-sm font-medium">{resourceLabels[resource] ?? resource}</span>
								</label>
							{/each}
						</div>
						<div class="mt-6 flex justify-end">
							<Button
								type="submit"
								class="cursor-pointer"
								disabled={savingRole === role || getCheckedResources(role).length === 0}
							>
								{#if savingRole === role}
									<Loader2 class="mr-2 h-4 w-4 animate-spin" />
								{/if}
								<Save class="mr-2 h-4 w-4" />
								Save {roleLabels[role] ?? role}
							</Button>
						</div>
					</form>
				</Card.Content>
			</Card.Root>
		{/each}

		<!-- Admin card (read-only) -->
		<Card.Root class="lg:col-span-2">
			<Card.Header>
				<Card.Title>Admin (Owner)</Card.Title>
				<Card.Description>
					Admin always has full access to all pages including Settings. This cannot be changed.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-4">
					{#each data.allResources as resource}
						<label class="flex items-center gap-2 opacity-60">
							<input type="checkbox" checked disabled class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">{resourceLabels[resource] ?? resource}</span>
						</label>
					{/each}
					<label class="flex items-center gap-2 opacity-60">
						<input type="checkbox" checked disabled class="h-4 w-4 rounded border-input" />
						<span class="text-sm font-medium">Settings</span>
					</label>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
</div>
