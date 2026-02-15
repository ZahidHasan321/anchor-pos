<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import {
		ShieldCheck,
		ShieldAlert,
		Clock,
		User,
		Info,
		Store,
		Users,
		ClipboardList
	} from '@lucide/svelte';
	import { formatDateTime } from '$lib/format';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	const navItems = [
		{ label: 'Store Settings', href: '/settings', icon: Store },
		{ label: 'User Management', href: '/settings/users', icon: Users },
		{ label: 'Role Permissions', href: '/settings/permissions', icon: ShieldAlert },
		{ label: 'Audit Log', href: '/settings/audit', icon: ClipboardList }
	];
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
		<h2 class="text-xl font-bold tracking-tight">Audit Log</h2>
		<div class="flex items-center gap-2 self-start rounded-full border px-4 py-1.5 sm:self-auto">
			{#if data.integrity.valid}
				<ShieldCheck class="h-4 w-4 text-emerald-500" />
				<span class="text-xs font-medium text-emerald-500">Chain Verified: Valid</span>
			{:else}
				<ShieldAlert class="h-4 w-4 text-destructive" />
				<span class="text-xs font-medium text-destructive"
					>Chain Corrupted at entry #{data.integrity.brokenAt}</span
				>
			{/if}
		</div>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="pl-6">Time</Table.Head>
						<Table.Head>User</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>Entity</Table.Head>
						<Table.Head>Details</Table.Head>
						<Table.Head class="pr-6">Hash</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.logs as log}
						<Table.Row>
							<Table.Cell class="pl-6 text-xs whitespace-nowrap">
								{formatDateTime(log.createdAt)}
							</Table.Cell>
							<Table.Cell>
								<div class="flex items-center gap-2">
									<User class="h-3 w-3 text-muted-foreground" />
									<span class="text-sm font-medium">{log.userName}</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								<Badge variant="outline" class="text-[9px] tracking-tighter uppercase px-1.5 h-4">
									{log.action}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-xs text-muted-foreground">
								{log.entity}
							</Table.Cell>
							<Table.Cell class="max-w-md truncate text-xs">
								{log.details}
							</Table.Cell>
							<Table.Cell class="pr-6 font-mono text-[9px] text-muted-foreground">
								{log.hash.substring(0, 10)}...
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if data.logs.length === 0}
						<Table.Row>
							<Table.Cell colspan={6} class="h-48 text-center text-muted-foreground italic">
								No audit entries found.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
