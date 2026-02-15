<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { Search, Eye, ChevronLeft, ChevronRight, X } from '@lucide/svelte';
	import { formatBDT, formatDate } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import { goto } from '$app/navigation';

	let { data } = $props();

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
		goto(`?${params.toString()}`, { keepFocus: true });
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
		goto(`?${params.toString()}`);
	}

	function formatDateStr(date: Date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Quick date shortcuts
	function setToday() {
		const todayStr = formatDateStr(new Date());
		dateFrom = todayStr;
		dateTo = todayStr;
		applyFilters();
	}

	function setThisWeek() {
		const now = new Date();
		const start = new Date(now);
		start.setDate(now.getDate() - now.getDay()); // Start on Sunday
		
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

	function handleBarcodeSearch(e: KeyboardEvent) {
		if (e.key === 'Enter' && searchQuery.trim()) {
			const query = searchQuery.trim().toLowerCase();
			
			// 1. Try to find if it matches an orderNumber in current page data
			const match = data.orders.find(o => o.orderNumber.toString() === query || o.id.toLowerCase() === query);
			if (match) {
				goto(`/orders/${match.id}`);
				searchQuery = '';
				return;
			}

			// 2. Otherwise try direct navigation (for full UUID barcode scans)
			goto(`/orders/${query}`);
			searchQuery = '';
		}
	}
</script>

<svelte:head>
	<title>Order History — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-3 sm:p-6">
	<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Order History</h1>
			<p class="text-sm text-muted-foreground">
				Manage and view your store's orders.
			</p>
		</div>
		<div class="relative w-full sm:w-96">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
			<Input
				type="text"
				placeholder="Search customer, phone or scan barcode..."
				class="h-11 pl-10 pr-24 border-primary/50 focus-visible:ring-primary shadow-sm"
				bind:value={searchQuery}
				oninput={handleSearchInput}
				onkeydown={handleBarcodeSearch}
			/>
			<div class="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="cursor-pointer text-muted-foreground hover:text-foreground"
						title="Clear search"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
				<div class="text-[10px] font-bold text-muted-foreground uppercase bg-muted px-1.5 py-0.5 rounded">
					Enter
				</div>
			</div>
		</div>
	</div>

	<!-- Filters -->
	<Card.Root>
		<Card.Content class="p-3 sm:p-4">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
				<!-- Date Range & Shortcuts Group -->
				<div class="flex flex-col gap-4 sm:flex-row sm:items-end flex-1">
					<div class="space-y-2">
						<Label class="text-xs font-semibold text-muted-foreground">Date Range</Label>
						<div class="flex items-center gap-2">
							<Input 
								type="date" 
								bind:value={dateFrom} 
								onchange={applyFilters}
								class="w-full sm:w-[140px] h-9 cursor-pointer text-xs" 
							/>
							<span class="text-muted-foreground text-xs">to</span>
							<Input 
								type="date" 
								bind:value={dateTo} 
								onchange={applyFilters}
								class="w-full sm:w-[140px] h-9 cursor-pointer text-xs" 
							/>
						</div>
					</div>

					<!-- Shortcuts -->
					<div class="flex h-9 border rounded-md p-0.5 bg-muted/30 w-fit">
						<Button variant="ghost" size="sm" onclick={setToday} class="h-full px-3 text-[10px] sm:text-xs cursor-pointer">Today</Button>
						<Separator orientation="vertical" class="h-4 my-auto" />
						<Button variant="ghost" size="sm" onclick={setThisWeek} class="h-full px-3 text-[10px] sm:text-xs cursor-pointer">Week</Button>
						<Separator orientation="vertical" class="h-4 my-auto" />
						<Button variant="ghost" size="sm" onclick={setThisMonth} class="h-full px-3 text-[10px] sm:text-xs cursor-pointer">Month</Button>
					</div>
				</div>

				<!-- Status & Clear Action Group -->
				<div class="flex items-end gap-2 sm:gap-3">
					<div class="space-y-2 flex-1 sm:flex-none">
						<Label class="text-xs font-semibold text-muted-foreground">Status</Label>
						<Select.Root 
							type="single" 
							bind:value={statusFilter} 
							onValueChange={(v) => { statusFilter = v; applyFilters(); }}
						>
							<Select.Trigger class="w-full sm:w-[140px] h-9 text-xs">
								{statusFilter ? statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1) : 'All Status'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" class="cursor-pointer text-xs">All Status</Select.Item>
								<Select.Item value="completed" class="cursor-pointer text-xs">Completed</Select.Item>
								<Select.Item value="refunded" class="cursor-pointer text-xs">Refunded</Select.Item>
								<Select.Item value="void" class="cursor-pointer text-xs">Void</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
					
					{#if dateFrom || dateTo || statusFilter || searchQuery}
						<Button 
							variant="outline" 
							size="sm" 
							onclick={clearFilters} 
							class="h-9 cursor-pointer text-muted-foreground hover:text-destructive flex gap-2 px-3 text-xs"
						>
							<X class="h-3.5 w-3.5" />
							<span class="hidden sm:inline">Clear Filters</span>
							<span class="sm:hidden">Clear</span>
						</Button>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Orders Table -->
	<Card.Root>
		<Card.Content class="p-0 overflow-hidden">
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[800px] lg:min-w-full">
				<Table.Header>
					<Table.Row>
						<Table.Head>Order ID</Table.Head>
						<Table.Head>Date & Time</Table.Head>
						<Table.Head>Customer</Table.Head>
						<Table.Head>Cashier</Table.Head>
						<Table.Head>Payment</Table.Head>
						<Table.Head>Amount</Table.Head>
						<Table.Head>Status</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.orders as order}
						<Table.Row 
							class="cursor-pointer transition-colors hover:bg-muted/50"
							onclick={() => goto(`/orders/${order.id}`)}
						>
							<Table.Cell class="font-bold">
								#{order.orderNumber}
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col">
									<span class="font-medium">{formatDate(order.createdAt)}</span>
									<span class="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleTimeString()}</span>
								</div>
							</Table.Cell>
							<Table.Cell>
								{#if order.customerId}
									<div class="flex flex-col">
										<a
											href="/customers/{order.customerId}"
											class="font-medium text-primary hover:underline"
										>
											{order.customerName ?? 'Unknown'}
										</a>
										{#if order.customerPhone}
											<span class="text-xs text-muted-foreground">{order.customerPhone}</span>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">Walk-in</span>
								{/if}
							</Table.Cell>
							<Table.Cell class="text-xs">{order.userName}</Table.Cell>
							<Table.Cell class="capitalize">{order.paymentMethod}</Table.Cell>
							<Table.Cell class="font-bold">{formatBDT(order.totalAmount)}</Table.Cell>
							<Table.Cell>
								<Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}>
									{order.status}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-right">
								<Button
									variant="ghost"
									size="icon"
									href="/orders/{order.id}"
									class="cursor-pointer"
								>
									<Eye class="h-4 w-4" />
								</Button>
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if data.orders.length === 0}
						<Table.Row>
							<Table.Cell colspan={8} class="h-48 text-center text-muted-foreground italic">
								No orders found matching your filters.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
			</div>
		</Card.Content>
		<Card.Footer class="border-t p-4">
			<div class="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
				<p class="text-sm text-muted-foreground">
					Showing {data.orders.length} of {data.pagination.totalOrders} orders
				</p>
				
				{#if data.pagination.totalPages > 1}
					<div class="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage <= 1}
							onclick={() => goToPage(data.pagination.currentPage - 1)}
							class="h-8 w-8 cursor-pointer"
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						{#each Array.from({ length: Math.min(data.pagination.totalPages, 5) }, (_, i) => {
							let start = Math.max(1, data.pagination.currentPage - 2);
							if (start + 4 > data.pagination.totalPages) {
								start = Math.max(1, data.pagination.totalPages - 4);
							}
							return start + i;
						}) as pageNum}
							<Button
								variant={pageNum === data.pagination.currentPage ? 'default' : 'outline'}
								size="icon"
								onclick={() => goToPage(pageNum)}
								class="h-8 w-8 cursor-pointer"
							>
								{pageNum}
							</Button>
						{/each}
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage >= data.pagination.totalPages}
							onclick={() => goToPage(data.pagination.currentPage + 1)}
							class="h-8 w-8 cursor-pointer"
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				{/if}
			</div>
		</Card.Footer>
	</Card.Root>
</div>