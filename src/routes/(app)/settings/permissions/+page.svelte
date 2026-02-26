<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Save, Loader2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { roleLabels } from '$lib/utils';

	let { data, form } = $props();

	const resourceLabels: Record<string, string> = {
		dashboard: 'Dashboard',
		inventory: 'Inventory',
		pos: 'POS',
		orders: 'Orders',
		customers: 'Customers',
		cashbook: 'Cashbook',
		reports: 'Reports'
	};

	// Use a more stable state management
	let checkedState = $state<Record<string, Record<string, boolean>>>(
		(() => {
			const state: Record<string, Record<string, boolean>> = {};
			for (const role of data.configurableRoles) {
				state[role] = {};
				for (const resource of data.allResources) {
					state[role][resource] = data.permissionsByRole[role]?.includes(resource) ?? false;
				}
			}
			return state;
		})()
	);
	let savingRole = $state<string | null>(null);

	// No need for $effect to sync back from data.permissionsByRole after save
	// because we keep the local state. Only sync on mount/initial load.

	$effect(() => {
		if (form?.success) {
			toast.success(`Permissions updated for ${roleLabels[form.role] ?? form.role}`);
		} else if (form?.error) {
			toast.error(form.error);
		}
	});

	function isRoleEmpty(role: string) {
		const roleState = checkedState[role];
		if (!roleState) return true;
		return !Object.values(roleState).some(v => v);
	}
</script>

<div class="space-y-6">
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
							// Optimization: We don't call update() which would re-run all load functions.
							// Instead we handle the result manually to keep the UI snappy.
							return async ({ result }) => {
								savingRole = null;
								if (result.type === 'success') {
									toast.success(`Permissions updated for ${roleLabels[role] ?? role}`);
								} else if (result.type === 'failure' && result.data?.error) {
									toast.error(result.data.error as string);
								} else {
									toast.error('Failed to update permissions');
								}
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
										bind:checked={checkedState[role][resource]}
										class="h-4 w-4 rounded border-input text-primary accent-primary cursor-pointer"
									/>
									<span class="text-sm font-medium">{resourceLabels[resource] ?? resource}</span>
								</label>
							{/each}
						</div>
						<div class="mt-6 flex justify-end">
							<Button
								type="submit"
								class="cursor-pointer"
								disabled={savingRole === role || isRoleEmpty(role)}
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
