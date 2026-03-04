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

		if (dateFrom) { where += ' AND o.created_at >= ?'; params.push(dateFrom + ' 00:00:00'); }
		if (dateTo) { where += ' AND o.created_at <= ?'; params.push(dateTo + ' 23:59:59'); }
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
			powersync.dataVersion; // re-run when sync completes with new data
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

{#snippet orderCard(order: any)}
	<div
		role="button"
		tabindex="0"
		class="relative rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-muted/50 cursor-pointer"
		onclick={() => goto(`/orders/${order.id}`)}
		onkeydown={(e) => e.key === 'Enter' && goto(`/orders/${order.id}`)}
	>
		<div class="mb-3 flex items-start justify-between">
			<div class="space-y-1">
				<div class="font-bold text-sm tracking-tight">#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}</div>
				<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span>{formatDate(order.createdAt)}</span>
					<span class="h-1 w-1 rounded-full bg-muted-foreground/30"></span>
					<span>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
				</div>
			</div>
			<Badge
				variant={order.status === 'completed' ? 'secondary' : 'destructive'}
				class="h-5 px-2 text-[9px] font-bold uppercase tracking-wider"
			>
				{order.status}
			</Badge>
		</div>
		<div class="flex items-end justify-between">
			<div class="space-y-0.5">
				<div class="text-xs font-semibold">{order.customerName ?? 'Walk-in'}</div>
				<div class="text-[10px] text-muted-foreground capitalize">
					{order.paymentMethod} <span class="mx-1 opacity-30">|</span> {order.userName}
				</div>
			</div>
			<div class="text-base font-black tracking-tight text-primary">
				{formatCurrency(order.totalAmount)}
			</div>
		</div>
	</div>
{/snippet}

<svelte:head><title>Order History — Clothing POS</title></svelte:head>

<div class="space-y-6 p-4 sm:p-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div>
			<h1 class="text-2xl font-black tracking-tight sm:text-3xl">Order History</h1>
			<p class="text-xs text-muted-foreground sm:text-sm">Manage and view your store's orders.</p>
		</div>
		<div class="relative w-full lg:w-96">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="text"
				placeholder="Search order #, customer, phone..."
				class="h-11 border-primary/20 bg-muted/20 pr-10 pl-10 focus-visible:ring-primary/30"
				bind:value={searchQuery}
				oninput={handleSearchInput}
			/>
			{#if searchQuery}
				<button
					onclick={() => (searchQuery = '', applyFilters())}
					class="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Filters -->
	<Card.Root class="border-primary/10 shadow-sm overflow-hidden">
		<Card.Content class="p-0">
			<div class="flex flex-col lg:flex-row lg:items-stretch">
				<!-- Date Section -->
				<div class="flex-1 border-b p-4 lg:border-b-0 lg:border-r">
					<div class="mb-3 flex items-center justify-between">
						<Label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Date Range</Label>
						<div class="flex rounded-md border bg-muted/30 p-0.5">
							<Button
								variant={isToday ? 'secondary' : 'ghost'}
								size="sm"
								onclick={setToday}
								class="h-6 px-2 text-[10px]">Today</Button
							>
							<Button
								variant={isThisWeek ? 'secondary' : 'ghost'}
								size="sm"
								onclick={setThisWeek}
								class="h-6 px-2 text-[10px]">Week</Button
							>
							<Button
								variant={isThisMonth ? 'secondary' : 'ghost'}
								size="sm"
								onclick={setThisMonth}
								class="h-6 px-2 text-[10px]">Month</Button
							>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<DateInput
							bind:value={dateFrom}
							onchange={applyFilters}
							class="h-9 flex-1 text-xs"
						/>
						<span class="text-[10px] font-bold text-muted-foreground/50 uppercase">to</span>
						<DateInput
							bind:value={dateTo}
							onchange={applyFilters}
							class="h-9 flex-1 text-xs"
						/>
					</div>
				</div>

				<!-- Status & Clear Section -->
				<div class="flex items-center gap-3 bg-muted/5 p-4 sm:flex-row">
					<div class="flex-1 space-y-1.5">
						<Label class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
						<Select.Root
							type="single"
							bind:value={statusFilter}
							onValueChange={(v) => {
								statusFilter = v;
								applyFilters();
							}}
						>
							<Select.Trigger class="h-9 w-full text-xs sm:w-40 bg-background"
								>{statusFilter || 'All Status'}</Select.Trigger
							>
							<Select.Content>
								<Select.Item value="" class="text-xs">All Status</Select.Item>
								<Select.Item value="completed" class="text-xs">Completed</Select.Item>
								<Select.Item value="refunded" class="text-xs">Refunded</Select.Item>
								<Select.Item value="void" class="text-xs">Void</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					{#if dateFrom || dateTo || statusFilter || searchQuery}
						<div class="mt-auto">
							<Button
								variant="outline"
								size="sm"
								onclick={clearFilters}
								class="h-9 border-destructive/20 px-3 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
							>
								<X class="mr-1.5 h-3.5 w-3.5" /> Clear
							</Button>
						</div>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Orders List -->
	<div class="space-y-4">
		{#if isNative}
			<!-- Mobile View (Native) -->
			<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
				{#each nativeOrders as order}
					{@render orderCard(order)}
				{/each}
				{#if nativeOrders.length === 0}
					<div class="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground sm:col-span-2">
						<p class="text-sm italic">No orders found.</p>
					</div>
				{/if}
			</div>

			<!-- Desktop View (Native) -->
			<Card.Root class="hidden lg:block overflow-hidden">
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header class="bg-muted/30">
							<Table.Row>
								<Table.Head class="w-[120px]">Order #</Table.Head>
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
							{#each nativeOrders as order}
								<Table.Row
									class="cursor-pointer group"
									onclick={() => goto(`/orders/${order.id}`)}
								>
									<Table.Cell class="font-black text-primary">
										#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
									</Table.Cell>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="text-sm font-medium">{formatDate(order.createdAt)}</span>
											<span class="text-[10px] text-muted-foreground"
												>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
											>
										</div>
									</Table.Cell>
									<Table.Cell>
										<span class="text-sm font-medium">{order.customerName ?? 'Walk-in'}</span>
									</Table.Cell>
									<Table.Cell class="text-xs text-muted-foreground">{order.userName}</Table.Cell>
									<Table.Cell class="text-xs capitalize">{order.paymentMethod}</Table.Cell>
									<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
									<Table.Cell>
										<Badge
											variant={order.status === 'completed' ? 'secondary' : 'destructive'}
											class="text-[10px] font-bold uppercase tracking-wider"
										>
											{order.status}
										</Badge>
									</Table.Cell>
									<Table.Cell class="text-right">
										<Button variant="ghost" size="icon" href="/orders/{order.id}" class="opacity-0 group-hover:opacity-100 transition-opacity">
											<Eye class="h-4 w-4" />
										</Button>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
					{#if nativeOrders.length === 0}
						<div class="flex h-48 items-center justify-center text-muted-foreground italic">
							No orders found.
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

		{:else}
			{#await data.streamed}
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each Array(6) as _}
						<Skeleton class="h-32 w-full rounded-xl" />
					{/each}
				</div>
			{:then streamed}
				<!-- Mobile View (Streamed) -->
				<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
					{#each streamed.orders as order}
						{@render orderCard(order)}
					{/each}
					{#if streamed.orders.length === 0}
						<div class="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground sm:col-span-2">
							<p class="text-sm italic">No orders found.</p>
						</div>
					{/if}
				</div>

				<!-- Desktop View (Streamed) -->
				<Card.Root class="hidden lg:block overflow-hidden">
					<Card.Content class="p-0">
						<Table.Root>
							<Table.Header class="bg-muted/30">
								<Table.Row>
									<Table.Head class="w-[120px]">Order #</Table.Head>
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
								{#each streamed.orders as order}
									<Table.Row
										class="cursor-pointer group"
										onclick={() => goto(`/orders/${order.id}`)}
									>
										<Table.Cell class="font-black text-primary">
											#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
										</Table.Cell>
										<Table.Cell>
											<div class="flex flex-col">
												<span class="text-sm font-medium">{formatDate(order.createdAt)}</span>
												<span class="text-[10px] text-muted-foreground"
													>{new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span
												>
											</div>
										</Table.Cell>
										<Table.Cell>
											<span class="text-sm font-medium">{order.customerName ?? 'Walk-in'}</span>
										</Table.Cell>
										<Table.Cell class="text-xs text-muted-foreground">{order.userName}</Table.Cell>
										<Table.Cell class="text-xs capitalize">{order.paymentMethod}</Table.Cell>
										<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
										<Table.Cell>
											<Badge
												variant={order.status === 'completed' ? 'secondary' : 'destructive'}
												class="text-[10px] font-bold uppercase tracking-wider"
											>
												{order.status}
											</Badge>
										</Table.Cell>
										<Table.Cell class="text-right">
											<Button variant="ghost" size="icon" href="/orders/{order.id}" class="opacity-0 group-hover:opacity-100 transition-opacity">
												<Eye class="h-4 w-4" />
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
						{#if streamed.orders.length === 0}
							<div class="flex h-48 items-center justify-center text-muted-foreground italic">
								No orders found.
							</div>
						{/if}
					</Card.Content>
				</Card.Root>
			{/await}
		{/if}

		<!-- Pagination Footer -->
		<Card.Root class="border-t-0 rounded-t-none">
			<Card.Footer class="p-4">
				{#if isNative}
					<div class="flex w-full items-center justify-between">
						<p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{nativeOrders.length} of {nativePagination.totalOrders} Records
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
								<div class="flex h-8 items-center px-3 text-[10px] font-bold border rounded-md bg-muted/30">
									{nativePagination.currentPage} / {nativePagination.totalPages}
								</div>
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
						<p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
							{streamed.orders.length} of {streamed.pagination.totalOrders} Records
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
								<div class="flex h-8 items-center px-3 text-[10px] font-bold border rounded-md bg-muted/30">
									{streamed.pagination.currentPage} / {streamed.pagination.totalPages}
								</div>
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
</div>
