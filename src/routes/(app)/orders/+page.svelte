<script lang="ts">
	import { goto } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { DateInput } from '$lib/components/ui/date-input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Separator } from '$lib/components/ui/separator';
	import * as Table from '$lib/components/ui/table';
	import { formatCurrency, formatDate } from '$lib/format';
	import { ChevronLeft, ChevronRight, Eye, Search, X } from '@lucide/svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';

	let { data } = $props();
	const isNative = $derived(browser && !!(window as any).electron);

	// Electron: client-side PowerSync data
	let nativeOrders = $state<any[]>([]);
	let nativePagination = $state({ currentPage: 1, totalPages: 1, totalOrders: 0, perPage: 20 });

	async function loadNativeOrders() {
		if (!isNative || !powersync.ready) return;
		const perPage = 20;
		const page = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1');
		const offset = (page - 1) * perPage;
		let where = 'WHERE 1=1';
		const params: any[] = [];

		if (dateFrom) { where += ' AND o.created_at >= ?'; params.push(dateFrom + 'T00:00:00'); }
		if (dateTo) { where += ' AND o.created_at <= ?'; params.push(dateTo + 'T23:59:59.999'); }
		if (statusFilter) { where += ' AND o.status = ?'; params.push(statusFilter); }
		if (searchQuery) {
			where += ' AND (o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
			const p = `%${searchQuery}%`;
			params.push(p, p, p, p);
		}

		const [countResult, orders] = await Promise.all([
			powersync.db.get(`SELECT count(*) as count FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ${where}`, params),
			powersync.db.getAll(`
				SELECT o.id, o.order_number as orderNumber, o.total_amount as totalAmount,
					o.status, o.payment_method as paymentMethod, o.created_at as createdAt,
					c.name as customerName, u.name as userName
				FROM orders o
				LEFT JOIN customers c ON o.customer_id = c.id
				LEFT JOIN users u ON o.user_id = u.id
				${where}
				ORDER BY o.created_at DESC LIMIT ? OFFSET ?
			`, [...params, perPage, offset])
		]);

		const total = (countResult as any)?.count ?? 0;
		nativeOrders = orders as any[];
		nativePagination = { currentPage: page, totalPages: Math.ceil(total / perPage), totalOrders: total, perPage };
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			loadNativeOrders();
		}
	});

	let dateFrom = $state('');
	let dateTo = $state('');
	let statusFilter = $state('');
	let searchQuery = $state('');
	let searchTimeout: NodeJS.Timeout;

	$effect(() => {
		dateFrom = data.filters.from;
		dateTo = data.filters.to;
		statusFilter = data.filters.status;
		searchQuery = data.filters.search || '';
	});

	function applyFilters() {
		const params = new URLSearchParams();
		if (dateFrom) params.set('from', dateFrom);
		if (dateTo) params.set('to', dateTo);
		if (statusFilter) params.set('status', statusFilter);
		if (searchQuery) params.set('search', searchQuery);
		params.set('page', '1');
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function handleSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			applyFilters();
		}, 500);
	}

	function clearFilters() {
		dateFrom = '';
		dateTo = '';
		statusFilter = '';
		searchQuery = '';
		goto('/orders');
	}

	function goToPage(page: number) {
		const params = new URLSearchParams();
		if (dateFrom) params.set('from', dateFrom);
		if (dateTo) params.set('to', dateTo);
		if (statusFilter) params.set('status', statusFilter);
		if (searchQuery) params.set('search', searchQuery);
		params.set('page', page.toString());
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function formatDateStr(date: Date) {
		return date.toISOString().split('T')[0];
	}

	function setToday() {
		const s = formatDateStr(new Date());
		dateFrom = s;
		dateTo = s;
		applyFilters();
	}
	function setThisWeek() {
		const now = new Date();
		const start = new Date(now);
		start.setDate(now.getDate() - now.getDay());
		dateFrom = formatDateStr(start);
		dateTo = formatDateStr(now);
		applyFilters();
	}
	function setThisMonth() {
		const now = new Date();
		const start = new Date(now.getFullYear(), now.getMonth(), 1);
		dateFrom = formatDateStr(start);
		dateTo = formatDateStr(now);
		applyFilters();
	}

	const isToday = $derived(
		dateFrom === formatDateStr(new Date()) && dateTo === formatDateStr(new Date())
	);
	const isThisWeek = $derived(
		dateFrom === formatDateStr(new Date(new Date().setDate(new Date().getDate() - new Date().getDay()))) && 
		dateTo === formatDateStr(new Date())
	);
	const isThisMonth = $derived(
		dateFrom === formatDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) && 
		dateTo === formatDateStr(new Date())
	);
</script>

<svelte:head><title>Order History — Clothing POS</title></svelte:head>

<div class="space-y-6 p-3 sm:p-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Order History</h1>
			<p class="text-sm text-muted-foreground">Manage and view your store's orders.</p>
		</div>
		<div class="relative w-full sm:w-96">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-primary" />
			<Input
				type="text"
				placeholder="Search orders..."
				class="h-11 border-primary/50 pr-10 pl-10"
				bind:value={searchQuery}
				oninput={handleSearchInput}
			/>
			{#if searchQuery}<button
					onclick={() => (searchQuery = '')}
					class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					><X class="h-4 w-4" /></button
				>{/if}
		</div>
	</div>

	<!-- Filters -->
	<Card.Root>
		<Card.Content class="p-3 sm:p-4">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<div class="flex flex-1 flex-col gap-4 sm:flex-row sm:items-end">
					<div class="space-y-2">
						<Label class="text-xs font-semibold text-muted-foreground">Date Range</Label>
						<div class="flex items-center gap-2">
							<DateInput
								bind:value={dateFrom}
								onchange={applyFilters}
								class="h-9 w-full text-xs sm:w-48"
							/>
							<span class="text-xs text-muted-foreground">to</span>
							<DateInput
								bind:value={dateTo}
								onchange={applyFilters}
								class="h-9 w-full text-xs sm:w-48"
							/>
						</div>
					</div>
					<div class="flex h-9 w-fit rounded-md border bg-muted/30 p-0.5">
						<Button
							variant={isToday ? 'secondary' : 'ghost'}
							size="sm"
							onclick={setToday}
							class="h-full px-3 text-[10px] sm:text-xs">Today</Button
						>
						<Separator orientation="vertical" class="my-auto h-4" />
						<Button
							variant={isThisWeek ? 'secondary' : 'ghost'}
							size="sm"
							onclick={setThisWeek}
							class="h-full px-3 text-[10px] sm:text-xs">Week</Button
						>
						<Separator orientation="vertical" class="my-auto h-4" />
						<Button
							variant={isThisMonth ? 'secondary' : 'ghost'}
							size="sm"
							onclick={setThisMonth}
							class="h-full px-3 text-[10px] sm:text-xs">Month</Button
						>
					</div>
				</div>
				<div class="flex items-end gap-2 sm:gap-3">
					<div class="flex-1 space-y-2 sm:flex-none">
						<Label class="text-xs font-semibold text-muted-foreground">Status</Label>
						<Select.Root
							type="single"
							bind:value={statusFilter}
							onValueChange={(v) => {
								statusFilter = v;
								applyFilters();
							}}
						>
							<Select.Trigger class="h-9 w-full text-xs sm:w-35"
								>{statusFilter || 'All Status'}</Select.Trigger
							>
							<Select.Content>
								<Select.Item value="" class="text-xs text-muted-foreground">All Status</Select.Item>
								<Select.Item value="completed" class="text-xs">Completed</Select.Item>
								<Select.Item value="refunded" class="text-xs">Refunded</Select.Item>
								<Select.Item value="void" class="text-xs">Void</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					{#if dateFrom || dateTo || statusFilter || searchQuery}
						<Button
							variant="outline"
							size="sm"
							onclick={clearFilters}
							class="flex h-9 gap-2 px-3 text-xs text-muted-foreground hover:text-destructive"
							><X class="h-3.5 w-3.5" /> Clear</Button
						>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Content class="overflow-x-auto p-0">
			<Table.Root class="min-w-[800px]">
				<Table.Header>
					<Table.Row>
						<Table.Head>Order #</Table.Head>
						<Table.Head>Date</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Cashier</Table.Head>
						<Table.Head>Payment</Table.Head>
						<Table.Head>Amount</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if isNative}
						{#each nativeOrders as order}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/orders/${order.id}`)}
							>
								<Table.Cell class="font-bold">
									#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
								</Table.Cell>
								<Table.Cell
									><div class="flex flex-col">
										<span class="text-sm">{formatDate(order.createdAt)}</span><span
											class="text-[10px] text-muted-foreground"
											>{new Date(order.createdAt).toLocaleTimeString()}</span
										>
									</div></Table.Cell
								>
								<Table.Cell
									><span class="text-sm">{order.customerName ?? 'Walk-in'}</span></Table.Cell
								>
								<Table.Cell class="text-[11px] text-muted-foreground">{order.userName}</Table.Cell>
								<Table.Cell class="text-xs capitalize">{order.paymentMethod}</Table.Cell>
								<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
								<Table.Cell
									><Badge
										variant={order.status === 'completed' ? 'secondary' : 'destructive'}
										class="text-[10px]">{order.status}</Badge
									></Table.Cell
								>
								<Table.Cell class="text-right"
									><Button variant="ghost" size="icon" href="/orders/{order.id}"
										><Eye class="h-4 w-4" /></Button
									></Table.Cell
								>
							</Table.Row>
						{/each}
						{#if nativeOrders.length === 0}
							<Table.Row
								><Table.Cell colspan={8} class="h-48 text-center text-muted-foreground italic"
									>No orders found.</Table.Cell
								></Table.Row
							>
						{/if}
					{:else}
					{#await data.streamed}
						{#each Array(8) as _}
							<Table.Row>
								{#each Array(8) as _}<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell
									>{/each}
							</Table.Row>
						{/each}
					{:then streamed}
						{#each streamed.orders as order}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/orders/${order.id}`)}
							>
								<Table.Cell class="font-bold">
									#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
								</Table.Cell>
								<Table.Cell
									><div class="flex flex-col">
										<span class="text-sm">{formatDate(order.createdAt)}</span><span
											class="text-[10px] text-muted-foreground"
											>{new Date(order.createdAt).toLocaleTimeString()}</span
										>
									</div></Table.Cell
								>
								<Table.Cell
									><span class="text-sm">{order.customerName ?? 'Walk-in'}</span></Table.Cell
								>
								<Table.Cell class="text-[11px] text-muted-foreground">{order.userName}</Table.Cell>
								<Table.Cell class="text-xs capitalize">{order.paymentMethod}</Table.Cell>
								<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
								<Table.Cell
									><Badge
										variant={order.status === 'completed' ? 'secondary' : 'destructive'}
										class="text-[10px]">{order.status}</Badge
									></Table.Cell
								>
								<Table.Cell class="text-right"
									><Button variant="ghost" size="icon" href="/orders/{order.id}"
										><Eye class="h-4 w-4" /></Button
									></Table.Cell
								>
							</Table.Row>
						{/each}
						{#if streamed.orders.length === 0}
							<Table.Row
								><Table.Cell colspan={8} class="h-48 text-center text-muted-foreground italic"
									>No orders found.</Table.Cell
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
				<div class="flex w-full items-center justify-between">
					<p class="text-xs text-muted-foreground">
						Showing {nativeOrders.length} of {nativePagination.totalOrders}
					</p>
					{#if nativePagination.totalPages > 1}
						<div class="flex gap-1">
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
			{#await data.streamed then streamed}
				<div class="flex w-full items-center justify-between">
					<p class="text-xs text-muted-foreground">
						Showing {streamed.orders.length} of {streamed.pagination.totalOrders}
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
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
