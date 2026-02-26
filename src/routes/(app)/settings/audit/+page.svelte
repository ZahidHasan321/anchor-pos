<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		ShieldCheck,
		ShieldAlert,
		User,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';
	import { formatDateTime } from '$lib/format';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	let { data } = $props();

	function goToPage(pageNum: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h2 class="text-xl font-bold tracking-tight">Audit Log</h2>
		<div class="flex items-center gap-2 self-start rounded-full border px-4 py-1.5 sm:self-auto">
			{#await data.streamed}
				<Skeleton class="h-4 w-32" />
			{:then streamed}
				{#if streamed.integrity.valid}
					<ShieldCheck class="h-4 w-4 text-emerald-500" />
					<span class="text-xs font-medium text-emerald-500">Chain Verified: Valid</span>
				{:else}
					<ShieldAlert class="h-4 w-4 text-destructive" />
					<span class="text-xs font-medium text-destructive"
						>Chain Corrupted at #{streamed.integrity.brokenAt}</span
					>
				{/if}
			{/await}
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
					{#await data.streamed}
						{#each Array(10) as _}
							<Table.Row>
								{#each Array(6) as _}<Table.Cell><Skeleton class="h-8 w-full" /></Table.Cell>{/each}
							</Table.Row>
						{/each}
					{:then streamed}
						{#each streamed.logs as log}
							<Table.Row>
								<Table.Cell class="pl-6 text-xs whitespace-nowrap"
									>{formatDateTime(log.createdAt)}</Table.Cell
								>
								<Table.Cell
									><div class="flex items-center gap-2">
										<User class="h-3 w-3 text-muted-foreground" /><span class="text-sm font-medium"
											>{log.userName}</span
										>
									</div></Table.Cell
								>
								<Table.Cell
									><Badge variant="outline" class="h-4 px-1.5 text-[9px] tracking-tighter uppercase"
										>{log.action}</Badge
									></Table.Cell
								>
								<Table.Cell class="text-xs text-muted-foreground">{log.entity}</Table.Cell>
								<Table.Cell class="max-w-md truncate text-xs">{log.details}</Table.Cell>
								<Table.Cell class="pr-6 font-mono text-[9px] text-muted-foreground"
									>{log.hash.substring(0, 10)}...</Table.Cell
								>
							</Table.Row>
						{/each}
						{#if streamed.logs.length === 0}
							<Table.Row
								><Table.Cell colspan={6} class="h-48 text-center text-muted-foreground italic"
									>No audit entries found.</Table.Cell
								></Table.Row
							>
						{/if}
					{/await}
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="border-t p-4">
			{#await data.streamed then streamed}
				<div class="flex w-full items-center justify-between">
					<p class="text-sm text-muted-foreground">
						Showing {streamed.logs.length} of {streamed.pagination.totalLogs} entries
					</p>
					{#if streamed.pagination.totalPages > 1}
						<div class="flex gap-1">
							<Button
								variant="outline"
								size="icon"
								disabled={streamed.pagination.currentPage <= 1}
								onclick={() => goToPage(streamed.pagination.currentPage - 1)}
								class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
							>
							<Button
								variant="outline"
								size="icon"
								disabled={streamed.pagination.currentPage >= streamed.pagination.totalPages}
								onclick={() => goToPage(streamed.pagination.currentPage + 1)}
								class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
							>
						</div>
					{/if}
				</div>
			{/await}
		</Card.Footer>
	</Card.Root>
</div>
