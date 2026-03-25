<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import DatePicker from '$lib/components/ui/DatePicker.svelte';
	import * as Select from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import { formatCurrency, formatDate } from '$lib/format';
	import { ChevronLeft, ChevronRight, Search, X, ShoppingBag } from '@lucide/svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';

	let { data } = $props();

	// Cache last streamed result so we don't flash skeletons on every filter/pagination
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
	let nativeOrders = $state<any[]>([]);
	let nativePagination = $state({ currentPage: 1, totalPages: 1, totalOrders: 0, perPage: 20 });

	async function loadNativeOrders() {
		if (!isNative || !powersync.ready) return;
		const perPage = 20;
		const currentPageNum = parseInt(page.url.searchParams.get('page') ?? '1');
		const offset = (currentPageNum - 1) * perPage;
		let where = 'WHERE 1=1';
		const params: any[] = [];

		if (dateFrom) {
			where += ' AND o.created_at >= ?';
			params.push(dateFrom + ' 00:00:00');
		}
		if (dateTo) {
			where += ' AND o.created_at <= ?';
			params.push(dateTo + ' 23:59:59');
		}
		if (statusFilter) {
			where += ' AND o.status = ?';
			params.push(statusFilter);
		}
		if (searchQuery) {
			where +=
				' AND (o.id LIKE ? OR CAST(o.order_number AS TEXT) LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)';
			const p = `%${searchQuery}%`;
			params.push(p, p, p, p);
		}

		try {
			// 1. Get synced orders from PowerSync tables
			const [countResult, syncedOrders] = await Promise.all([
				powersync.db.get(
					`SELECT count(*) as count FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ${where}`,
					params
				),
				powersync.db.getAll(
					`
					SELECT o.id, o.order_number as orderNumber, o.total_amount as totalAmount,
						o.status, o.payment_method as paymentMethod, o.created_at as createdAt,
						c.name as customerName, u.name as userName
					FROM orders o
					LEFT JOIN customers c ON o.customer_id = c.id
					LEFT JOIN users u ON o.user_id = u.id
					${where}
					ORDER BY o.created_at DESC LIMIT ? OFFSET ?
				`,
					[...params, perPage, offset]
				)
			]);

			// 2. Get PENDING mutations from PowerSync's internal upload queue
			// This ensures local-first visibility before the server syncs back
			let pendingOrders: any[] = [];
			try {
				const uploadQueue = await powersync.getUploadQueue();
				const pending =
					uploadQueue?.filter(
						(m: any) => m.table === 'orders' && (m.op === 'PUT' || m.op === 'PATCH')
					) || [];

				pendingOrders = pending.map((m: any) => {
					const data = m.data;
					return {
						id: data.id || m.id,
						orderNumber: data.order_number || null,
						totalAmount: data.total_amount,
						status: 'syncing…',
						paymentMethod: data.payment_method,
						createdAt: data.created_at,
						customerName: 'Pending…',
						userName: data.user_id === data.user?.id ? data.user?.name : 'Local User'
					};
				});
			} catch (e) {
				console.warn('[Orders] Could not fetch upload queue:', e);
			}

			// 3. Merge and deduplicate (pending only on page 1, synced take priority)
			const syncedIds = new Set(syncedOrders.map((o: any) => o.id));
			const uniquePending =
				currentPageNum === 1 ? pendingOrders.filter((o: any) => !syncedIds.has(o.id)) : [];

			const merged = [...uniquePending, ...syncedOrders];

			// Re-sort by date
			merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

			const total = (countResult as any)?.count ?? 0;
			nativeOrders = merged.slice(0, perPage);
			nativePagination = {
				currentPage: currentPageNum,
				totalPages: Math.ceil((total + pendingOrders.length) / perPage),
				totalOrders: total + pendingOrders.length,
				perPage
			};
		} catch (e) {
			console.error('[Orders] Load failed:', e);
		}
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			powersync.dataVersion; // re-run when sync completes with new data
			page.url.searchParams.toString(); // re-run on page/filter URL changes
			loadNativeOrders();
		}
	});

	let dateFrom = $state('');
	let dateTo = $state('');
	let statusFilter = $state('');
	let searchQuery = $state('');
	let searchTimeout: NodeJS.Timeout;

	$effect(() => {
		if (!data.filters) return;
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
		dateFrom ===
			formatDateStr(new Date(new Date().setDate(new Date().getDate() - new Date().getDay()))) &&
			dateTo === formatDateStr(new Date())
	);
	const isThisMonth = $derived(
		dateFrom === formatDateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)) &&
			dateTo === formatDateStr(new Date())
	);
	const hasFilters = $derived(!!(dateFrom || dateTo || statusFilter || searchQuery));
</script>

{#snippet orderCard(order: any)}
	<div
		role="button"
		tabindex="0"
		class="relative cursor-pointer rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-muted/50"
		onclick={() => goto(`/orders/${order.id}`)}
		onkeydown={(e) => e.key === 'Enter' && goto(`/orders/${order.id}`)}
	>
		<div class="mb-3 flex items-start justify-between">
			<div class="space-y-1">
				<div class="text-sm font-bold tracking-tight">
					#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
				</div>
				<div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
					<span>{formatDate(order.createdAt)}</span>
					<span class="h-1 w-1 rounded-full bg-muted-foreground/30"></span>
					<span
						>{new Date(order.createdAt).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit'
						})}</span
					>
				</div>
			</div>
			<Badge
				variant={order.status === 'completed' ? 'secondary' : 'destructive'}
				class="h-5 px-2 text-[9px] font-bold tracking-wider uppercase"
			>
				{order.status}
			</Badge>
		</div>
		<div class="flex items-end justify-between">
			<div class="space-y-0.5">
				<div class="text-xs font-semibold">{order.customerName ?? 'Walk-in'}</div>
				<div class="text-[10px] text-muted-foreground capitalize">
					{order.paymentMethod} <span class="mx-1 opacity-30">|</span>
					{order.userName}
				</div>
			</div>
			<div class="text-base font-black tracking-tight text-primary">
				{formatCurrency(order.totalAmount)}
			</div>
		</div>
	</div>
{/snippet}

<svelte:head><title>Order History — Clothing POS</title></svelte:head>

<div class="space-y-4 p-4 sm:space-y-5 sm:p-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Order History</h1>
	</div>

	<!-- Unified Filter Bar -->
	<div class="space-y-3">
		<!-- Row 1: Search + Status + Clear -->
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
			<div class="relative flex-1">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					type="text"
					placeholder="Search order #, customer, phone…"
					class="pl-10"
					bind:value={searchQuery}
					oninput={handleSearchInput}
				/>
				{#if searchQuery}
					<button
						onclick={() => ((searchQuery = ''), applyFilters())}
						class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label="Clear search"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
			<div class="flex items-center gap-2">
				<Select.Root
					type="single"
					bind:value={statusFilter}
					onValueChange={(v) => { statusFilter = v; applyFilters(); }}
				>
					<Select.Trigger class="w-full text-xs sm:w-36 capitalize">
						{statusFilter || 'All Status'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="" class="text-xs">All Status</Select.Item>
						<Select.Item value="completed" class="text-xs">Completed</Select.Item>
						<Select.Item value="refunded" class="text-xs">Refunded</Select.Item>
						<Select.Item value="void" class="text-xs">Void</Select.Item>
					</Select.Content>
				</Select.Root>
				{#if hasFilters}
					<Button
						variant="ghost"
						size="sm"
						onclick={clearFilters}
						class="shrink-0 cursor-pointer text-xs text-muted-foreground hover:text-destructive"
					>
						<X class="mr-1 h-3.5 w-3.5" /> Reset
					</Button>
				{/if}
			</div>
		</div>

		<!-- Row 2: Date presets + custom range -->
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-1.5">
				<Button
					variant={isToday ? 'default' : 'outline'}
					size="sm"
					onclick={setToday}
					class="cursor-pointer text-xs">Today</Button
				>
				<Button
					variant={isThisWeek ? 'default' : 'outline'}
					size="sm"
					onclick={setThisWeek}
					class="cursor-pointer text-xs">This Week</Button
				>
				<Button
					variant={isThisMonth ? 'default' : 'outline'}
					size="sm"
					onclick={setThisMonth}
					class="cursor-pointer text-xs">This Month</Button
				>
			</div>
			<div class="flex items-center gap-2">
				<DatePicker bind:value={dateFrom} onchange={applyFilters} class="min-w-0 flex-1 sm:w-36 sm:flex-none" />
				<span class="shrink-0 text-[10px] font-bold text-muted-foreground/40 uppercase">to</span>
				<DatePicker bind:value={dateTo} onchange={applyFilters} class="min-w-0 flex-1 sm:w-36 sm:flex-none" />
			</div>
		</div>
	</div>

	{#snippet orderTable(orders: any[])}
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-[100px] pl-4">Order #</Table.Head>
					<Table.Head>Date</Table.Head>
					<Table.Head>Customer</Table.Head>
					<Table.Head>Payment</Table.Head>
					<Table.Head class="text-right">Amount</Table.Head>
					<Table.Head class="pr-4 text-right">Status</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each orders as order}
					<Table.Row
						class="group cursor-pointer"
						onclick={() => goto(`/orders/${order.id}`)}
					>
						<Table.Cell class="pl-4 font-bold tabular-nums text-primary">
							#{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
						</Table.Cell>
						<Table.Cell>
							<span class="text-sm">{new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })}</span>
						</Table.Cell>
						<Table.Cell>
							<div>
								<span class="text-sm font-medium">{order.customerName ?? 'Walk-in'}</span>
								{#if order.userName}
									<span class="ml-1.5 text-[10px] text-muted-foreground">by {order.userName}</span>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-xs capitalize">{order.paymentMethod}</Table.Cell>
						<Table.Cell class="text-right font-bold tabular-nums">{formatCurrency(order.totalAmount)}</Table.Cell>
						<Table.Cell class="pr-4 text-right">
							<Badge
								variant={order.status === 'completed' ? 'secondary' : 'destructive'}
								class="text-[10px] font-bold tracking-wider uppercase"
							>
								{order.status}
							</Badge>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/snippet}

	{#snippet emptyOrders()}
		<div class="flex flex-col items-center justify-center py-16 text-center sm:col-span-2">
			<div class="mb-2 rounded-full bg-muted p-3">
				<ShoppingBag class="h-5 w-5 text-muted-foreground/40" />
			</div>
			<p class="text-sm font-medium text-muted-foreground">No orders found</p>
			{#if hasFilters}
				<p class="mt-1 text-xs text-muted-foreground/60">Try adjusting your filters</p>
			{:else}
				<p class="mt-1 text-xs text-muted-foreground/60">Orders will appear here after the first sale</p>
			{/if}
		</div>
	{/snippet}

	{#snippet pagination(itemCount: number, pag: any)}
		{#if pag.totalPages > 1 || itemCount > 0}
			<div class="flex items-center justify-between border-t px-4 py-3">
				<p class="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
					{itemCount} of {pag.totalOrders} orders
				</p>
				{#if pag.totalPages > 1}
					<div class="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Previous page"
							disabled={pag.currentPage <= 1}
							onclick={() => goToPage(pag.currentPage - 1)}
						><ChevronLeft class="h-4 w-4" /></Button>
						<span class="min-w-[4rem] text-center text-xs tabular-nums text-muted-foreground">
							{pag.currentPage} / {pag.totalPages}
						</span>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label="Next page"
							disabled={pag.currentPage >= pag.totalPages}
							onclick={() => goToPage(pag.currentPage + 1)}
						><ChevronRight class="h-4 w-4" /></Button>
					</div>
				{/if}
			</div>
		{/if}
	{/snippet}

	<!-- Orders List -->
	{#if isNative}
		<!-- Mobile cards -->
		<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
			{#each nativeOrders as order}
				{@render orderCard(order)}
			{:else}
				{@render emptyOrders()}
			{/each}
		</div>
		<!-- Desktop table -->
		<Card.Root class="hidden py-0 lg:block">
			<Card.Content class="p-0">
				{#if nativeOrders.length > 0}
					{@render orderTable(nativeOrders)}
				{:else}
					{@render emptyOrders()}
				{/if}
			</Card.Content>
			{@render pagination(nativeOrders.length, nativePagination)}
		</Card.Root>
	{:else if !cachedStreamed}
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}
				<Skeleton class="h-32 w-full rounded-xl" />
			{/each}
		</div>
	{:else}
		{@const streamed = cachedStreamed}
		<div class="relative">
			{#if isLoading}
				<div class="pointer-events-none absolute inset-0 z-10 animate-pulse rounded-lg bg-background/50"></div>
			{/if}
			<!-- Mobile cards -->
			<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
				{#each streamed.orders as order}
					{@render orderCard(order)}
				{:else}
					{@render emptyOrders()}
				{/each}
			</div>
			<!-- Desktop table + pagination in one card -->
			<Card.Root class="hidden py-0 lg:block">
				<Card.Content class="p-0">
					{#if streamed.orders.length > 0}
						{@render orderTable(streamed.orders)}
					{:else}
						{@render emptyOrders()}
					{/if}
				</Card.Content>
				{@render pagination(streamed.orders.length, streamed.pagination)}
			</Card.Root>
		</div>
	{/if}
</div>
