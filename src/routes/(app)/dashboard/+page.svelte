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

	let { data } = $props();
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

		<div
			class="min-w-[150px] flex-1 animate-in delay-300 duration-300 fill-mode-both fade-in slide-in-from-bottom-2"
		>
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
		</Card.Content>
	</Card.Root>
</div>
