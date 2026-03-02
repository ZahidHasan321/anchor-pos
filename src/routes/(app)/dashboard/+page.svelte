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
	import { powersync } from '$lib/powersync';
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

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const todayIso = today.toISOString();
		const monthIso = firstDayOfMonth.toISOString();

		// Stats
		Promise.all([
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [monthIso]),
			powersync.db.get(`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT coalesce(sum(price * stock_quantity), 0) as total FROM product_variants`)
		]).then(([todaySales, monthlySales, todayExpenses, inventoryValue]) => {
			nativeStats = {
				todaySales: todaySales || { count: 0, total: 0 },
				monthlySales: monthlySales || { count: 0, total: 0 },
				todayExpenses: todayExpenses || { total: 0 },
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
			.then(orders => nativeRecentOrders = orders as any[]);

		// Top products
		powersync.db.getAll(`
			SELECT product_name as name, variant_label as variantLabel,
				sum(quantity) as totalQty, sum(quantity * price_at_sale) as totalRevenue
			FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id
			WHERE o.status = 'completed' AND o.created_at >= ?
			GROUP BY product_name, variant_label ORDER BY totalQty DESC LIMIT 10
		`, [monthIso]).then(products => nativeTopProducts = (products as any[]).map(p => ({
			...p, totalQty: p.totalQty, totalRevenue: p.totalRevenue
		})));
	});
</script>

<svelte:head>
	<title>Dashboard — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div
		class="flex animate-in items-center justify-between duration-500 fade-in slide-in-from-top-2"
	>
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
			<p class="text-muted-foreground">Overview of your store's performance.</p>
		</div>
		<Button variant="outline" href="/reports" class="cursor-pointer">
			<BarChart3 class="mr-2 h-4 w-4" /> Full Reports
		</Button>
	</div>

	<!-- Summary Cards -->
	<div class="flex flex-wrap gap-4">
		{#if isNative}
			{#if nativeStats === null}
				{#each Array(4) as _}
					<div class="min-w-[150px] flex-1">
						<Card.Root class="h-full space-y-2 p-4">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-8 w-full" />
							<Skeleton class="h-3 w-16" />
						</Card.Root>
					</div>
				{/each}
			{:else}
				<div
					class="min-w-[150px] flex-1 animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-emerald-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Today's Sales</Card.Title>
							<div class="shrink-0 rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
								<ShoppingBag class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div
								class="text-2xl font-bold break-words break-all text-emerald-600 dark:text-emerald-400"
							>
								{formatCurrency(nativeStats.todaySales?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">
								{nativeStats.todaySales?.count ?? 0} orders today
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-blue-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Monthly Sales</Card.Title>
							<div class="shrink-0 rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
								<TrendingUp class="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold break-words break-all text-blue-600 dark:text-blue-400">
								{formatCurrency(nativeStats.monthlySales?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">
								{nativeStats.monthlySales?.count ?? 0} orders this month
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-red-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Today's Expenses</Card.Title>
							<div class="shrink-0 rounded-full bg-red-100 p-2 dark:bg-red-500/20">
								<Receipt class="h-4 w-4 text-red-600 dark:text-red-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold break-words break-all text-red-600 dark:text-red-400">
								{formatCurrency(nativeStats.todayExpenses?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">Recorded in cashbook</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-200 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-indigo-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Inventory Value</Card.Title>
							<div class="shrink-0 rounded-full bg-indigo-100 p-2 dark:bg-indigo-500/20">
								<Package class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div
								class="text-2xl font-bold break-words break-all text-indigo-600 dark:text-indigo-400"
							>
								{formatCurrency(nativeStats.inventoryValue)}
							</div>
							<p class="text-xs text-muted-foreground">Total stock worth</p>
						</Card.Content>
					</Card.Root>
				</div>
			{/if}
		{:else}
			{#await data.stats}
				{#each Array(4) as _}
					<div class="min-w-[150px] flex-1">
						<Card.Root class="h-full space-y-2 p-4">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-8 w-full" />
							<Skeleton class="h-3 w-16" />
						</Card.Root>
					</div>
				{/each}
			{:then stats}
				<div
					class="min-w-[150px] flex-1 animate-in duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-emerald-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Today's Sales</Card.Title>
							<div class="shrink-0 rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
								<ShoppingBag class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div
								class="text-2xl font-bold break-words break-all text-emerald-600 dark:text-emerald-400"
							>
								{formatCurrency(stats.todaySales?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">
								{stats.todaySales?.count ?? 0} orders today
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-blue-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Monthly Sales</Card.Title>
							<div class="shrink-0 rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
								<TrendingUp class="h-4 w-4 text-blue-600 dark:text-blue-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold break-words break-all text-blue-600 dark:text-blue-400">
								{formatCurrency(stats.monthlySales?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">
								{stats.monthlySales?.count ?? 0} orders this month
							</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-red-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Today's Expenses</Card.Title>
							<div class="shrink-0 rounded-full bg-red-100 p-2 dark:bg-red-500/20">
								<Receipt class="h-4 w-4 text-red-600 dark:text-red-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div class="text-2xl font-bold break-words break-all text-red-600 dark:text-red-400">
								{formatCurrency(stats.todayExpenses?.total ?? 0)}
							</div>
							<p class="text-xs text-muted-foreground">Recorded in cashbook</p>
						</Card.Content>
					</Card.Root>
				</div>

				<div
					class="min-w-[150px] flex-1 animate-in delay-200 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
				>
					<Card.Root class="h-full border-l-4 border-l-indigo-500">
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							<Card.Title class="text-sm font-medium">Inventory Value</Card.Title>
							<div class="shrink-0 rounded-full bg-indigo-100 p-2 dark:bg-indigo-500/20">
								<Package class="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
							</div>
						</Card.Header>
						<Card.Content>
							<div
								class="text-2xl font-bold break-words break-all text-indigo-600 dark:text-indigo-400"
							>
								{formatCurrency(stats.inventoryValue)}
							</div>
							<p class="text-xs text-muted-foreground">Total stock worth</p>
						</Card.Content>
					</Card.Root>
				</div>
			{/await}
		{/if}

		<div
			class="min-w-[150px] flex-1 animate-in delay-300 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
		>
			{#if isNative}
				{#if nativeStockAlerts === null}
					<Card.Root class="h-full space-y-2 p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</Card.Root>
				{:else}
					<a
						href="/inventory?stock=low"
						class="block h-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
					>
						<Card.Root class="h-full border-l-4 border-l-amber-500">
							<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
								<Card.Title class="text-sm font-medium">Low Stock Alerts</Card.Title>
								<div class="shrink-0 rounded-full bg-amber-100 p-2 dark:bg-amber-500/20">
									<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
								</div>
							</Card.Header>
							<Card.Content>
								<div
									class="text-2xl font-bold break-words break-all text-amber-600 dark:text-amber-400"
								>
									{nativeStockAlerts.lowStockCount}
								</div>
								<p class="text-xs text-muted-foreground">Items with low stock</p>
							</Card.Content>
						</Card.Root>
					</a>
				{/if}
			{:else}
				{#await data.stockAlerts}
					<Card.Root class="h-full space-y-2 p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</Card.Root>
				{:then alerts}
					<a
						href="/inventory?stock=low"
						class="block h-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
					>
						<Card.Root class="h-full border-l-4 border-l-amber-500">
							<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
								<Card.Title class="text-sm font-medium">Low Stock Alerts</Card.Title>
								<div class="shrink-0 rounded-full bg-amber-100 p-2 dark:bg-amber-500/20">
									<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
								</div>
							</Card.Header>
							<Card.Content>
								<div
									class="text-2xl font-bold break-words break-all text-amber-600 dark:text-amber-400"
								>
									{alerts.lowStockCount}
								</div>
								<p class="text-xs text-muted-foreground">Items with low stock</p>
							</Card.Content>
						</Card.Root>
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
							<Table.Root>
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
											><Table.Cell colspan={3} class="py-8 text-center text-muted-foreground italic"
												>No sales this month yet.</Table.Cell
											></Table.Row
										>
									{/if}
								</Table.Body>
							</Table.Root>
						{/if}
					{:else}
						{#await data.topProducts}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:then products}
							<Table.Root>
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
											><Table.Cell colspan={3} class="py-8 text-center text-muted-foreground italic"
												>No sales this month yet.</Table.Cell
											></Table.Row
										>
									{/if}
								</Table.Body>
							</Table.Root>
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
							<Table.Root>
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
						{/if}
					{:else}
						{#await data.stockAlerts}
							<div class="space-y-4">
								{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
							</div>
						{:then alerts}
							<Table.Root>
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
					<Table.Root>
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
									<Table.Cell>{formatDateTime(order.created_at)}</Table.Cell>
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
				{/if}
			{:else}
				{#await data.recentOrders}
					<div class="space-y-4">
						{#each Array(5) as _}<Skeleton class="h-12 w-full" />{/each}
					</div>
				{:then orders}
					<Table.Root>
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
									<Table.Cell>{formatDateTime(order.createdAt)}</Table.Cell>
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
				{/await}
			{/if}
		</Card.Content>
	</Card.Root>
</div>
