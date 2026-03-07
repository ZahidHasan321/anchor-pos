<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		ShoppingBag,
		TrendingUp,
		AlertTriangle,
		Receipt,
		ArrowRight,
		BarChart3,
		Package,
		Trophy
	} from '@lucide/svelte';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';

	let { data } = $props();

	const isNative = $derived(browser && !!(window as any).electron);

	// Electron: client-side PowerSync reactive data
	let nativeStats = $state<any>(null);
	let nativeStockAlerts = $state<any>(null);
	let nativeRecentOrders = $state<any[]>([]);
	let nativeTopProducts = $state<any[]>([]);

	$effect(() => {
		if (!isNative || !powersync.ready) return;
		powersync.dataVersion; // re-run when sync completes with new data

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		// PowerSync stores created_at as PostgreSQL ::text cast (e.g. "2026-03-04 00:00:00+00")
		// which uses space separator, not "T". Use matching format for lexicographic comparison.
		const toDbDate = (d: Date) => d.toISOString().replace('T', ' ').replace('.000Z', '+00');
		const todayIso = toDbDate(today);
		const monthIso = toDbDate(firstDayOfMonth);

		// Stats
		Promise.all([
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [monthIso]),
			powersync.db.get(`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT coalesce(sum(oi.cost_at_sale * oi.quantity), 0) as total FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id WHERE o.status = 'completed' AND o.created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT coalesce(sum(coalesce(NULLIF(pv.cost_price, 0), p.cost_price, 0) * pv.stock_quantity), 0) as total FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id`)
		]).then(([todaySales, monthlySales, todayExpenses, todayCogs, inventoryValue]) => {
			nativeStats = {
				todaySales: todaySales || { count: 0, total: 0 },
				monthlySales: monthlySales || { count: 0, total: 0 },
				todayExpenses: todayExpenses || { total: 0 },
				todayProfit: ((todaySales as any)?.total ?? 0) - ((todayCogs as any)?.total ?? 0),
				inventoryValue: (inventoryValue as any)?.total ?? 0
			};
		});

		// Stock alerts
		Promise.all([
			powersync.db.getAll(`SELECT p.id, p.name, pv.size, pv.stock_quantity as stock FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= 5 LIMIT 10`),
			powersync.db.get(`SELECT count(*) as count FROM product_variants WHERE stock_quantity > 0 AND stock_quantity <= 5`)
		]).then(([items, count]) => {
			nativeStockAlerts = { lowStockItems: items, lowStockCount: (count as any)?.count ?? 0 };
		});

		// Recent orders
		powersync.db.getAll('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10')
			.then((orders: any) => nativeRecentOrders = orders as any[]);

		// Top products
		powersync.db.getAll(`
			SELECT product_name as name, variant_label as variantLabel,
				sum(quantity) as totalQty, sum(quantity * price_at_sale) as totalRevenue
			FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id
			WHERE o.status = 'completed' AND o.created_at >= ?
			GROUP BY product_name, variant_label ORDER BY totalQty DESC LIMIT 10
		`, [monthIso]).then((products: any) => nativeTopProducts = (products as any[]).map(p => ({
			...p, totalQty: p.totalQty, totalRevenue: p.totalRevenue
		})));
	});
</script>

<svelte:head>
	<title>Dashboard — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-4 sm:p-6">
	<div
		class="flex animate-in flex-col gap-4 duration-500 fade-in slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between"
	>
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
			<p class="text-sm text-muted-foreground sm:text-base">Overview of your store's performance.</p>
		</div>
		<Button variant="outline" href="/reports" class="w-full cursor-pointer sm:w-auto">
			<BarChart3 class="mr-2 h-4 w-4" /> Full Reports
		</Button>
	</div>

	<!-- Summary Cards -->
	<div class="flex flex-wrap gap-2.5 sm:gap-4">
		{#if isNative}
			{#if nativeStats === null}
				{#each Array(4) as _}
					<div class="min-w-[140px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
			{:else}
				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Sales</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<ShoppingBag class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-emerald-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(nativeStats.todaySales?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{nativeStats.todaySales?.count ?? 0} orders today
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Monthly Sales</span
						>
						<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-blue-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-blue-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(nativeStats.monthlySales?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{nativeStats.monthlySales?.count ?? 0} orders this month
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Expenses</span
						>
						<div class="hidden rounded-md bg-red-500/10 p-1.5 sm:block">
							<Receipt class="h-3.5 w-3.5 text-red-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-red-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(nativeStats.todayExpenses?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Recorded in cashbook
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-175 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Profit</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div
						class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl {nativeStats.todayProfit >= 0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(nativeStats.todayProfit ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Revenue - COGS
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-200 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Inventory Value</span
						>
						<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
							<Package class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-indigo-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(nativeStats.inventoryValue)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">At cost</p>
				</div>
			{/if}
		{:else}
			{#await data.stats}
				{#each Array(4) as _}
					<div class="min-w-[140px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
			{:then stats}
				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Sales</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<ShoppingBag class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-emerald-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(stats.todaySales?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{stats.todaySales?.count ?? 0} orders today
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Monthly Sales</span
						>
						<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-blue-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-blue-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(stats.monthlySales?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{stats.monthlySales?.count ?? 0} orders this month
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Expenses</span
						>
						<div class="hidden rounded-md bg-red-500/10 p-1.5 sm:block">
							<Receipt class="h-3.5 w-3.5 text-red-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-red-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(stats.todayExpenses?.total ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Recorded in cashbook
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-175 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Today's Profit</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div
						class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl {stats.todayProfit >= 0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(stats.todayProfit ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Revenue - COGS
					</p>
				</div>

				<div
					class="min-w-[140px] flex-1 animate-in rounded-lg border bg-card p-3 delay-200 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
				>
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Inventory Value</span
						>
						<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
							<Package class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-indigo-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(stats.inventoryValue)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">At cost</p>
				</div>
			{/await}
		{/if}

		<div
			class="min-w-[140px] flex-1 animate-in delay-300 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
		>
			{#if isNative}
				{#if nativeStockAlerts === null}
					<div class="min-w-[140px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{:else}
					<a
						href="/inventory?stock=low"
						class="block h-full rounded-lg border bg-card p-3 transition-transform hover:scale-[1.02] active:scale-[0.98] sm:p-4"
					>
						<div class="flex items-center justify-between">
							<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
								>Low Stock Alerts</span
							>
							<div class="hidden rounded-md bg-amber-500/10 p-1.5 sm:block">
								<AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
							</div>
						</div>
						<div class="mt-1.5 text-lg font-bold break-all text-amber-600 sm:mt-2 sm:text-2xl">
							{nativeStockAlerts.lowStockCount}
						</div>
						<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
							Items with low stock
						</p>
					</a>
				{/if}
			{:else}
				{#await data.stockAlerts}
					<div class="min-w-[140px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{:then alerts}
					<a
						href="/inventory?stock=low"
						class="block h-full rounded-lg border bg-card p-3 transition-transform hover:scale-[1.02] active:scale-[0.98] sm:p-4"
					>
						<div class="flex items-center justify-between">
							<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
								>Low Stock Alerts</span
							>
							<div class="hidden rounded-md bg-amber-500/10 p-1.5 sm:block">
								<AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
							</div>
						</div>
						<div class="mt-1.5 text-lg font-bold break-all text-amber-600 sm:mt-2 sm:text-2xl">
							{alerts.lowStockCount}
						</div>
						<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
							Items with low stock
						</p>
					</a>
				{/await}
			{/if}
		</div>
	</div>

	<!-- Tables Section -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
		<div class="lg:col-span-4">
			<Card.Root class="h-full">
				<Card.Header class="flex flex-row items-center justify-between">
					<div class="flex items-center gap-2">
						<Trophy class="h-4 w-4 text-amber-500" />
						<Card.Title>Top Selling Products</Card.Title>
					</div>
					<span class="text-xs text-muted-foreground">This month</span>
				</Card.Header>
				<Card.Content>
					{#if isNative}
						{#if nativeTopProducts.length === 0 && nativeStats === null}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:else}
							<div class="-mx-6 overflow-x-auto px-6">
								<Table.Root class="min-w-[400px]">
									<Table.Header>
										<Table.Row>
											<Table.Head>Product</Table.Head>
											<Table.Head class="text-right">Qty</Table.Head>
											<Table.Head class="text-right">Revenue</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each nativeTopProducts as product, i}
											<Table.Row>
												<Table.Cell class="py-2">
													<div class="flex items-center gap-2">
														<span
															class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold {i <
															3
																? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
																: 'bg-muted text-muted-foreground'}"
														>
															{i + 1}
														</span>
														<div>
															<div class="font-medium">{product.name}</div>
															<div class="text-xs text-muted-foreground">{product.variantLabel}</div>
														</div>
													</div>
												</Table.Cell>
												<Table.Cell class="py-2 text-right font-mono">{product.totalQty}</Table.Cell>
												<Table.Cell class="py-2 text-right font-bold"
													>{formatCurrency(product.totalRevenue)}</Table.Cell
												>
											</Table.Row>
										{/each}
										{#if nativeTopProducts.length === 0}
											<Table.Row
												><Table.Cell
													colspan={3}
													class="py-8 text-center text-muted-foreground italic"
													>No sales this month yet.</Table.Cell
												></Table.Row
											>
										{/if}
									</Table.Body>
								</Table.Root>
							</div>
						{/if}
					{:else}
						{#await data.topProducts}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:then products}
							<div class="-mx-6 overflow-x-auto px-6">
								<Table.Root class="min-w-[400px]">
									<Table.Header>
										<Table.Row>
											<Table.Head>Product</Table.Head>
											<Table.Head class="text-right">Qty</Table.Head>
											<Table.Head class="text-right">Revenue</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each products as product, i}
											<Table.Row>
												<Table.Cell class="py-2">
													<div class="flex items-center gap-2">
														<span
															class="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold {i <
															3
																? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
																: 'bg-muted text-muted-foreground'}"
														>
															{i + 1}
														</span>
														<div>
															<div class="font-medium">{product.name}</div>
															<div class="text-xs text-muted-foreground">{product.variantLabel}</div>
														</div>
													</div>
												</Table.Cell>
												<Table.Cell class="py-2 text-right font-mono">{product.totalQty}</Table.Cell>
												<Table.Cell class="py-2 text-right font-bold"
													>{formatCurrency(product.totalRevenue)}</Table.Cell
												>
											</Table.Row>
										{/each}
										{#if products.length === 0}
											<Table.Row
												><Table.Cell
													colspan={3}
													class="py-8 text-center text-muted-foreground italic"
													>No sales this month yet.</Table.Cell
												></Table.Row
											>
										{/if}
									</Table.Body>
								</Table.Root>
							</div>
						{/await}
					{/if}
				</Card.Content>
			</Card.Root>
		</div>

		<div class="lg:col-span-3">
			<Card.Root class="h-full">
				<Card.Header class="flex flex-row items-center justify-between">
					<Card.Title>Low Stock Items</Card.Title>
					<Button variant="ghost" size="sm" href="/inventory" class="cursor-pointer text-xs"
						>View All</Button
					>
				</Card.Header>
				<Card.Content>
					{#if isNative}
						{#if nativeStockAlerts === null}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:else}
							<div class="-mx-6 overflow-x-auto px-6">
								<Table.Root class="min-w-[400px]">
									<Table.Body>
										{#each nativeStockAlerts.lowStockItems as item}
											<Table.Row>
												<Table.Cell class="py-2">
													<div class="font-medium">{item.name}</div>
													<div class="text-xs text-muted-foreground">{item.size}</div>
												</Table.Cell>
												<Table.Cell class="py-2 text-right"
													><Badge variant="destructive">{item.stock}</Badge></Table.Cell
												>
											</Table.Row>
										{/each}
										{#if nativeStockAlerts.lowStockItems.length === 0}
											<Table.Row
												><Table.Cell class="py-8 text-center text-muted-foreground italic"
													>No low stock items.</Table.Cell
												></Table.Row
											>
										{/if}
									</Table.Body>
								</Table.Root>
							</div>
						{/if}
					{:else}
						{#await data.stockAlerts}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:then alerts}
							<div class="-mx-6 overflow-x-auto px-6">
								<Table.Root class="min-w-[400px]">
									<Table.Body>
										{#each alerts.lowStockItems as item}
											<Table.Row>
												<Table.Cell class="py-2">
													<div class="font-medium">{item.name}</div>
													<div class="text-xs text-muted-foreground">{item.size}</div>
												</Table.Cell>
												<Table.Cell class="py-2 text-right"
													><Badge variant="destructive">{item.stock}</Badge></Table.Cell
												>
											</Table.Row>
										{/each}
										{#if alerts.lowStockItems.length === 0}
											<Table.Row
												><Table.Cell class="py-8 text-center text-muted-foreground italic"
													>No low stock items.</Table.Cell
												></Table.Row
											>
										{/if}
									</Table.Body>
								</Table.Root>
							</div>
						{/await}
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<!-- Recent Orders -->
	<Card.Root>
		<Card.Header class="flex flex-row items-center justify-between">
			<Card.Title>Recent Orders</Card.Title>
			<Button variant="ghost" size="sm" href="/orders" class="cursor-pointer text-xs">
				View All Orders <ArrowRight class="ml-2 h-3 w-3" />
			</Button>
		</Card.Header>
		<Card.Content>
			{#if isNative}
				{#if nativeRecentOrders.length === 0 && nativeStats === null}
					<div class="space-y-4">
						{#each Array(5) as _}<Skeleton class="h-12 w-full" />{/each}
					</div>
				{:else}
					<div class="-mx-6 overflow-x-auto px-6">
						<Table.Root class="min-w-[600px]">
							<Table.Header>
								<Table.Row>
									<Table.Head>Order ID</Table.Head>
									<Table.Head>Date</Table.Head>
									<Table.Head>Amount</Table.Head>
									<Table.Head>Payment</Table.Head>
									<Table.Head>Status</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each nativeRecentOrders as order}
									<Table.Row>
										<Table.Cell class="font-mono text-xs">
											<a href="/orders/{order.id}" class="hover:underline"
												>#{order.id.substring(0, 8).toUpperCase()}</a
											>
										</Table.Cell>
										<Table.Cell class="whitespace-nowrap"
											>{formatDateTime(order.created_at)}</Table.Cell
										>
										<Table.Cell class="font-bold">{formatCurrency(order.total_amount)}</Table.Cell>
										<Table.Cell class="capitalize">{order.payment_method}</Table.Cell>
										<Table.Cell
											><Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}
												>{order.status}</Badge
											></Table.Cell
										>
									</Table.Row>
								{/each}
								{#if nativeRecentOrders.length === 0}
									<Table.Row
										><Table.Cell colspan={5} class="h-24 text-center text-muted-foreground italic"
											>No orders found.</Table.Cell
										></Table.Row
									>
								{/if}
							</Table.Body>
						</Table.Root>
					</div>
				{/if}
			{:else}
				{#await data.recentOrders}
					<div class="space-y-4">
						{#each Array(5) as _}<Skeleton class="h-12 w-full" />{/each}
					</div>
				{:then orders}
					<div class="-mx-6 overflow-x-auto px-6">
						<Table.Root class="min-w-[600px]">
							<Table.Header>
								<Table.Row>
									<Table.Head>Order ID</Table.Head>
									<Table.Head>Date</Table.Head>
									<Table.Head>Amount</Table.Head>
									<Table.Head>Payment</Table.Head>
									<Table.Head>Status</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each orders as order}
									<Table.Row>
										<Table.Cell class="font-mono text-xs">
											<a href="/orders/{order.id}" class="hover:underline"
												>#{order.id.substring(0, 8).toUpperCase()}</a
											>
										</Table.Cell>
										<Table.Cell class="whitespace-nowrap"
											>{formatDateTime(order.createdAt)}</Table.Cell
										>
										<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
										<Table.Cell class="capitalize">{order.paymentMethod}</Table.Cell>
										<Table.Cell
											><Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}
												>{order.status}</Badge
											></Table.Cell
										>
									</Table.Row>
								{/each}
								{#if orders.length === 0}
									<Table.Row
										><Table.Cell colspan={5} class="h-24 text-center text-muted-foreground italic"
											>No orders found.</Table.Cell
										></Table.Row
									>
								{/if}
							</Table.Body>
						</Table.Root>
					</div>
				{/await}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
