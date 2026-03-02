<script lang="ts">
	import { enhance } from '$app/forms';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Search,
		Plus,
		Phone,
		Mail,
		Trash,
		X,
		Loader2,
		ChevronLeft,
		ChevronRight,
		Users
	} from '@lucide/svelte';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createDebounced } from '$lib/debounce.svelte';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();

	const isNative = $derived(browser && !!(window as any).electron);

	// Electron: client-side PowerSync data
	let nativeCustomers = $state<any[]>([]);
	let nativePagination = $state({ currentPage: 1, totalPages: 1, total: 0, perPage: 20 });

	async function loadNativeCustomers() {
		if (!isNative || !powersync.ready) return;
		const perPage = 20;
		const pg = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1');
		const offset = (pg - 1) * perPage;
		const q = searchQuery;
		let where = 'WHERE 1=1';
		const params: any[] = [];
		if (q) {
			where += ' AND (c.name LIKE ? OR c.phone LIKE ?)';
			params.push(`%${q}%`, `%${q}%`);
		}

		const [countResult, customerList] = await Promise.all([
			powersync.db.get(`SELECT count(*) as count FROM customers c ${where}`, params),
			powersync.db.getAll(`
            SELECT c.id, c.name, c.phone, c.email,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') as orderCount,
                COALESCE((SELECT SUM(o.total_amount) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed'), 0) as totalSpent,
                (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') as lastOrderDate
            FROM customers c
            ${where}
            ORDER BY totalSpent DESC
            LIMIT ? OFFSET ?
        `, [...params, perPage, offset])
		]);

		const total = (countResult as any)?.count ?? 0;
		nativeCustomers = (customerList as any[]).map(c => ({
			...c,
			lastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate) : null
		}));
		nativePagination = { currentPage: pg, totalPages: Math.ceil(total / perPage), total, perPage };
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			loadNativeCustomers();
		}
	});

	let searchQuery = $state('');
	let createDialogOpen = $state(false);
	let loading = $state(false);

	$effect(() => {
		searchQuery = data.search;
	});

	const debouncedSearch = createDebounced(() => searchQuery);

	$effect(() => {
		const q = debouncedSearch.value;
		const current = page.url.searchParams.get('q') ?? '';
		if (q === current) return;
		const params = new URLSearchParams(page.url.searchParams);
		if (q) params.set('q', q);
		else params.delete('q');
		params.set('page', '1');
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	});

	function goToPage(pageNum: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	$effect(() => {
		if (form?.success) {
			toast.success('Action successful');
			createDialogOpen = false;
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});
</script>

<svelte:head>
	<title>Customers — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-3 pb-24 sm:p-6 md:pb-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
			<p class="text-sm text-muted-foreground sm:text-base">
				Manage your customer database and purchase history.
			</p>
		</div>
		<Button onclick={() => (createDialogOpen = true)} class="hidden cursor-pointer md:flex">
			<Plus class="mr-2 h-4 w-4" /> Add Customer
		</Button>
	</div>

	<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
		<div class="relative w-full max-w-sm">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input placeholder="Search customers..." class="pr-9 pl-10" bind:value={searchQuery} />
			{#if searchQuery}
				<button
					onclick={() => (searchQuery = '')}
					class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Users class="h-4 w-4" />
			{#if isNative}
				<span>{nativePagination.total} customers</span>
			{:else}
			{#await data.streamed}
				<Skeleton class="h-4 w-20" />
			{:then streamed}
				<span>{streamed.pagination.total} customers</span>
			{/await}
			{/if}
		</div>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Contact</Table.Head>
						<Table.Head class="text-center">Orders</Table.Head>
						<Table.Head class="text-right">Total Spent</Table.Head>
						<Table.Head>Last Order</Table.Head>
						<Table.Head class="w-12"></Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if isNative}
						{#each nativeCustomers as customer}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={(e) => {
									if (!(e.target as HTMLElement).closest('button, form'))
										goto(`/customers/${customer.id}`);
								}}
							>
								<Table.Cell>
									<div class="font-bold">{customer.name}</div>
									<div class="font-mono text-[10px] text-muted-foreground">
										{customer.id.substring(0, 8)}
									</div>
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-col gap-0.5 text-xs">
										{#if customer.phone}<div>{customer.phone}</div>{/if}
										{#if customer.email}<div class="max-w-[150px] truncate text-muted-foreground">
												{customer.email}
											</div>{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-center">{customer.orderCount}</Table.Cell>
								<Table.Cell class="text-right font-bold text-primary"
									>{formatCurrency(customer.totalSpent)}</Table.Cell
								>
								<Table.Cell class="text-xs text-muted-foreground"
									>{customer.lastOrderDate
										? formatDateTime(customer.lastOrderDate)
										: 'Never'}</Table.Cell
								>
								<Table.Cell>
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={customer.id} />
										<Button
											variant="ghost"
											size="icon"
											type="button"
											class="h-8 w-8 text-destructive"
											onclick={async (e) => {
												if (await confirmState.confirm('Delete customer?'))
													e.currentTarget.closest('form')?.requestSubmit();
											}}
										>
											<Trash class="h-4 w-4" />
										</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
						{#if nativeCustomers.length === 0}
							<Table.Row
								><Table.Cell colspan={6} class="h-48 text-center text-muted-foreground italic"
									>No customers found.</Table.Cell
								></Table.Row
							>
						{/if}
					{:else}
					{#await data.streamed}
						{#each Array(8) as _}
							<Table.Row>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-10" /></Table.Cell>
							</Table.Row>
						{/each}
					{:then streamed}
						{#each streamed.customers as customer}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={(e) => {
									if (!(e.target as HTMLElement).closest('button, form'))
										goto(`/customers/${customer.id}`);
								}}
							>
								<Table.Cell>
									<div class="font-bold">{customer.name}</div>
									<div class="font-mono text-[10px] text-muted-foreground">
										{customer.id.substring(0, 8)}
									</div>
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-col gap-0.5 text-xs">
										{#if customer.phone}<div>{customer.phone}</div>{/if}
										{#if customer.email}<div class="max-w-[150px] truncate text-muted-foreground">
												{customer.email}
											</div>{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-center">{customer.orderCount}</Table.Cell>
								<Table.Cell class="text-right font-bold text-primary"
									>{formatCurrency(customer.totalSpent)}</Table.Cell
								>
								<Table.Cell class="text-xs text-muted-foreground"
									>{customer.lastOrderDate
										? formatDateTime(customer.lastOrderDate)
										: 'Never'}</Table.Cell
								>
								<Table.Cell>
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={customer.id} />
										<Button
											variant="ghost"
											size="icon"
											type="button"
											class="h-8 w-8 text-destructive"
											onclick={async (e) => {
												if (await confirmState.confirm('Delete customer?'))
													e.currentTarget.closest('form')?.requestSubmit();
											}}
										>
											<Trash class="h-4 w-4" />
										</Button>
									</form>
								</Table.Cell>
							</Table.Row>
						{/each}
						{#if streamed.customers.length === 0}
							<Table.Row
								><Table.Cell colspan={6} class="h-48 text-center text-muted-foreground italic"
									>No customers found.</Table.Cell
								></Table.Row
							>
						{/if}
					{/await}
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="border-t p-4">
			{#if isNative}
				<div class="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
					<p class="text-sm text-muted-foreground">
						Showing {nativeCustomers.length} of {nativePagination.total}
					</p>
					{#if nativePagination.totalPages > 1}
						<div class="flex items-center gap-1">
							<Button
								variant="outline"
								size="icon"
								disabled={nativePagination.currentPage <= 1}
								onclick={() => goToPage(nativePagination.currentPage - 1)}
								class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
							>
							<Button
								variant="outline"
								size="icon"
								disabled={nativePagination.currentPage >= nativePagination.totalPages}
								onclick={() => goToPage(nativePagination.currentPage + 1)}
								class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
							>
						</div>
					{/if}
				</div>
			{:else}
			{#await data.streamed}
				<Skeleton class="h-8 w-full" />
			{:then streamed}
				<div class="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
					<p class="text-sm text-muted-foreground">
						Showing {streamed.customers.length} of {streamed.pagination.total}
					</p>
					{#if streamed.pagination.totalPages > 1}
						<div class="flex items-center gap-1">
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
			{/if}
		</Card.Footer>
	</Card.Root>
</div>

<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header><Dialog.Title>Add New Customer</Dialog.Title></Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="name">Name</Label><Input id="name" name="name" required />
			</div>
			<div class="space-y-2"><Label for="phone">Phone</Label><Input id="phone" name="phone" /></div>
			<div class="space-y-2">
				<Label for="email">Email</Label><Input id="email" name="email" type="email" />
			</div>
			<Button type="submit" class="w-full" disabled={loading}
				>{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}Create</Button
			>
		</form>
	</Dialog.Content>
</Dialog.Root>

<div class="fixed right-4 bottom-20 z-40 md:hidden">
	<Button
		onclick={() => (createDialogOpen = true)}
		size="icon"
		class="h-14 w-14 rounded-full shadow-2xl"><Plus class="h-7 w-7" /></Button
	>
</div>
