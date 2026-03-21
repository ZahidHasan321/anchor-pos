<script lang="ts">
	import { enhance } from '$app/forms';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
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
	import { formatCurrency } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createDebounced } from '$lib/debounce.svelte';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();

	// Cache streamed data to avoid skeleton flash on filter/pagination changes
	let cachedStreamed = $state<any>(null);
	let isLoading = $state(false);

	$effect(() => {
		isLoading = true;
		data.streamed.then((result: any) => {
			cachedStreamed = result;
			isLoading = false;
		});
	});

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
			powersync.db.getAll(
				`
            SELECT c.id, c.name, c.phone, c.email,
                (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') as orderCount,
                COALESCE((SELECT SUM(o.total_amount) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed'), 0) as totalSpent,
                (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') as lastOrderDate
            FROM customers c
            ${where}
            ORDER BY totalSpent DESC
            LIMIT ? OFFSET ?
        `,
				[...params, perPage, offset]
			)
		]);

		const total = (countResult as any)?.count ?? 0;
		nativeCustomers = (customerList as any[]).map((c) => ({
			...c,
			lastOrderDate: c.lastOrderDate ? new Date(c.lastOrderDate) : null
		}));
		nativePagination = { currentPage: pg, totalPages: Math.ceil(total / perPage), total, perPage };
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			powersync.dataVersion; // re-run when sync completes with new data
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

{#snippet customerRow(customer: any)}
	<Table.Row
		class="group cursor-pointer hover:bg-muted/50"
		onclick={(e) => {
			if (!(e.target as HTMLElement).closest('button, form'))
				goto(`/customers/${customer.id}`);
		}}
	>
		<Table.Cell>
			<div class="font-bold">{customer.name}</div>
			{#if customer.phone}
				<div class="text-xs text-muted-foreground lg:hidden">{customer.phone}</div>
			{/if}
		</Table.Cell>
		<Table.Cell class="hidden lg:table-cell">
			<div class="flex flex-col gap-0.5 text-xs">
				{#if customer.phone}<div class="flex items-center gap-1.5"><Phone class="h-3 w-3 text-muted-foreground/50" />{customer.phone}</div>{/if}
				{#if customer.email}<div class="flex items-center gap-1.5 text-muted-foreground"><Mail class="h-3 w-3 text-muted-foreground/50" /><span class="max-w-[150px] truncate">{customer.email}</span></div>{/if}
			</div>
		</Table.Cell>
		<Table.Cell class="text-center tabular-nums">{customer.orderCount}</Table.Cell>
		<Table.Cell class="text-right font-bold tabular-nums text-primary"
			>{formatCurrency(customer.totalSpent)}</Table.Cell
		>
		<Table.Cell class="hidden text-xs text-muted-foreground sm:table-cell"
			>{customer.lastOrderDate
				? new Date(customer.lastOrderDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })
				: '—'}</Table.Cell
		>
		<Table.Cell class="hidden lg:table-cell">
			<form method="POST" action="?/delete" use:enhance>
				<input type="hidden" name="id" value={customer.id} />
				<Button
					variant="ghost"
					size="icon"
					type="button"
					class="h-8 w-8 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
					aria-label="Delete customer"
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
{/snippet}

{#snippet emptyState()}
	<Table.Row>
		<Table.Cell colspan={6}>
			<div class="flex flex-col items-center justify-center py-12 text-center">
				<div class="mb-2 rounded-full bg-muted p-3">
					<Users class="h-5 w-5 text-muted-foreground/40" />
				</div>
				<p class="text-sm font-medium text-muted-foreground">No customers found</p>
				{#if searchQuery}
					<p class="mt-1 text-xs text-muted-foreground/60">Try a different search term</p>
				{:else}
					<p class="mt-1 text-xs text-muted-foreground/60">Add your first customer to get started</p>
				{/if}
			</div>
		</Table.Cell>
	</Table.Row>
{/snippet}

{#snippet paginationFooter(items: any[], pagination: any)}
	<Card.Footer class="border-t p-4">
		<div class="flex w-full items-center justify-between">
			<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
				{items.length} of {pagination.total} Customers
			</p>
			{#if pagination.totalPages > 1}
				<div class="flex gap-1">
					<Button
						variant="outline"
						size="icon"
						disabled={pagination.currentPage <= 1}
						onclick={() => goToPage(pagination.currentPage - 1)}
						aria-label="Previous page"
						class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
					>
					<div class="flex h-8 items-center rounded-md border bg-muted/30 px-3 text-[10px] font-bold">
						{pagination.currentPage} / {pagination.totalPages}
					</div>
					<Button
						variant="outline"
						size="icon"
						disabled={pagination.currentPage >= pagination.totalPages}
						onclick={() => goToPage(pagination.currentPage + 1)}
						aria-label="Next page"
						class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
					>
				</div>
			{/if}
		</div>
	</Card.Footer>
{/snippet}

<div class="space-y-4 p-3 pb-24 sm:p-6 md:pb-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
		<Button onclick={() => (createDialogOpen = true)} class="hidden cursor-pointer md:flex">
			<Plus class="mr-2 h-4 w-4" /> Add Customer
		</Button>
	</div>

	<!-- Search bar -->
	<div class="flex items-center gap-3">
		<div class="relative flex-1 max-w-md">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input placeholder="Search by name or phone…" class="pl-10" bind:value={searchQuery} />
			{#if searchQuery}
				<button
					onclick={() => (searchQuery = '')}
					class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					aria-label="Clear search"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			{/if}
		</div>
		<div class="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
			<Users class="h-3.5 w-3.5" />
			{#if isNative}
				<span>{nativePagination.total}</span>
			{:else if cachedStreamed}
				<span>{cachedStreamed.pagination.total}</span>
			{:else}
				<Skeleton class="h-4 w-8" />
			{/if}
		</div>
	</div>

	<!-- Table -->
	<div class="relative">
		{#if isLoading && cachedStreamed}
			<div class="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-lg bg-background/50"></div>
		{/if}
		<Card.Root class="py-0">
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Name</Table.Head>
							<Table.Head class="hidden lg:table-cell">Contact</Table.Head>
							<Table.Head class="text-center">Orders</Table.Head>
							<Table.Head class="text-right">Spent</Table.Head>
							<Table.Head class="hidden sm:table-cell">Last Order</Table.Head>
							<Table.Head class="hidden w-12 lg:table-cell"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if isNative}
							{#each nativeCustomers as customer}
								{@render customerRow(customer)}
							{/each}
							{#if nativeCustomers.length === 0}
								{@render emptyState()}
							{/if}
						{:else if !cachedStreamed}
							{#each Array(8) as _}
								<Table.Row>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell class="hidden lg:table-cell"><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-6 w-8 mx-auto" /></Table.Cell>
									<Table.Cell><Skeleton class="h-6 w-16 ml-auto" /></Table.Cell>
									<Table.Cell class="hidden sm:table-cell"><Skeleton class="h-6 w-24" /></Table.Cell>
									<Table.Cell class="hidden lg:table-cell"><Skeleton class="h-8 w-8" /></Table.Cell>
								</Table.Row>
							{/each}
						{:else}
							{#each cachedStreamed.customers as customer}
								{@render customerRow(customer)}
							{/each}
							{#if cachedStreamed.customers.length === 0}
								{@render emptyState()}
							{/if}
						{/if}
					</Table.Body>
				</Table.Root>
			</Card.Content>
			{#if isNative}
				{@render paginationFooter(nativeCustomers, nativePagination)}
			{:else if cachedStreamed}
				{@render paginationFooter(cachedStreamed.customers, cachedStreamed.pagination)}
			{/if}
		</Card.Root>
	</div>
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
		aria-label="Add new customer"
		class="h-14 w-14 rounded-full shadow-2xl"><Plus class="h-7 w-7" /></Button
	>
</div>
