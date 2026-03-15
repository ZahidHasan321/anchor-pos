<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		ShoppingBag,
		TrendingUp,
		ArrowUpRight,
		ArrowDownRight,
		BarChart3,
		Trophy,
		Wallet
	} from '@lucide/svelte';
	import { formatCurrency } from '$lib/format';
	import { Button } from '$lib/components/ui/button';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';
	import { Chart, registerables } from 'chart.js';

	Chart.register(...registerables);

	let { data } = $props();

	const isNative = $derived(browser && (!!(window as any).electron || !!(window as any).Capacitor));

	// Native (PowerSync) reactive data
	let nativeStats = $state<any>(null);
	let nativeStockAlerts = $state<any>(null);
	let nativeTopProducts = $state<any[]>([]);
	let nativeLast7Days = $state<any[]>([]);
	let nativeTodayPayments = $state<any[]>([]);

	// Chart refs
	let barCanvas = $state<HTMLCanvasElement | null>(null);
	let doughnutCanvas = $state<HTMLCanvasElement | null>(null);
	let barChart: Chart | null = null;
	let doughnutChart: Chart | null = null;

	function comparePercent(current: number, previous: number): { value: number; up: boolean } {
		if (previous === 0) return { value: current > 0 ? 100 : 0, up: current >= 0 };
		const pct = ((current - previous) / previous) * 100;
		return { value: Math.abs(Math.round(pct)), up: pct >= 0 };
	}

	function fillMissingDays(rows: { day: string; total: number }[]): { day: string; total: number }[] {
		const map = new Map(rows.map(r => [r.day, r.total]));
		const result: { day: string; total: number }[] = [];
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		for (let i = 6; i >= 0; i--) {
			const dt = new Date(d);
			dt.setDate(dt.getDate() - i);
			const key = dt.toISOString().slice(0, 10);
			result.push({ day: key, total: map.get(key) ?? 0 });
		}
		return result;
	}

	function getChartColors() {
		const style = getComputedStyle(document.documentElement);
		const primaryColor = style.getPropertyValue('--primary').trim() || '#3b82f6';
		const mutedColor = style.getPropertyValue('--muted-foreground').trim() || '#64748b';
		const gridColor = style.getPropertyValue('--border').trim() || '#e2e8f0';
		const popoverBg = style.getPropertyValue('--popover').trim() || '#fff';
		const popoverFg = style.getPropertyValue('--popover-foreground').trim() || '#000';
		return { primaryColor, mutedColor, gridColor, popoverBg, popoverFg };
	}

	function renderBarChart(chartData: { day: string; total: number }[]) {
		if (!barCanvas) return;
		barChart?.destroy();
		const filled = fillMissingDays(chartData);
		const { primaryColor, mutedColor, gridColor, popoverBg, popoverFg } = getChartColors();

		const labels = filled.map(d => {
			const dt = new Date(d.day + 'T00:00:00');
			return dt.toLocaleDateString(undefined, { weekday: 'short' });
		});

		barChart = new Chart(barCanvas, {
			type: 'bar',
			data: {
				labels,
				datasets: [{
					data: filled.map(d => d.total),
					backgroundColor: primaryColor,
					borderRadius: 4,
					borderSkipped: false,
					maxBarThickness: 40
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: popoverBg,
						titleColor: popoverFg,
						bodyColor: popoverFg,
						borderColor: gridColor,
						borderWidth: 1,
						callbacks: {
							label: (ctx) => formatCurrency(ctx.parsed.y)
						}
					}
				},
				scales: {
					y: {
						beginAtZero: true,
						grid: { color: gridColor },
						ticks: { color: mutedColor, callback: (v) => formatCurrency(Number(v)) }
					},
					x: {
						grid: { display: false },
						ticks: { color: mutedColor }
					}
				}
			}
		});
	}

	function renderDoughnutChart(payments: { method: string; total: number }[]) {
		if (!doughnutCanvas) return;
		doughnutChart?.destroy();

		const { mutedColor, popoverBg, popoverFg, gridColor } = getChartColors();

		const colorMap: Record<string, string> = {
			cash: '#10b981',
			card: '#3b82f6',
			mobile: '#f59e0b'
		};

		const filtered = payments.filter(p => p.total > 0);
		if (filtered.length === 0) {
			doughnutChart = null;
			return;
		}

		doughnutChart = new Chart(doughnutCanvas, {
			type: 'doughnut',
			data: {
				labels: filtered.map(p => p.method.charAt(0).toUpperCase() + p.method.slice(1)),
				datasets: [{
					data: filtered.map(p => p.total),
					backgroundColor: filtered.map(p => colorMap[p.method] || '#6b7280'),
					borderWidth: 0
				}]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				cutout: '60%',
				plugins: {
					legend: {
						position: 'bottom',
						labels: {
							color: mutedColor,
							usePointStyle: true,
							pointStyle: 'circle',
							padding: 16
						}
					},
					tooltip: {
						backgroundColor: popoverBg,
						titleColor: popoverFg,
						bodyColor: popoverFg,
						borderColor: gridColor,
						borderWidth: 1,
						callbacks: {
							label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}`
						}
					}
				}
			}
		});
	}

	// PowerSync native queries
	$effect(() => {
		if (!isNative || !powersync.ready) return;
		powersync.dataVersion;

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);
		const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
		const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
		const lastDayOfPrevMonth = new Date(today.getFullYear(), today.getMonth(), 0).getDate();
		const compareDayOfMonth = Math.min(today.getDate(), lastDayOfPrevMonth);
		const lastMonthEnd = new Date(today.getFullYear(), today.getMonth() - 1, compareDayOfMonth + 1);
		const sevenDaysAgo = new Date(today);
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);

		const toDbDate = (d: Date) => d.toISOString().replace('T', ' ').replace('.000Z', '+00');
		const todayIso = toDbDate(today);
		const yesterdayIso = toDbDate(yesterday);
		const monthIso = toDbDate(firstDayOfMonth);
		const lastMonthStartIso = toDbDate(lastMonthStart);
		const lastMonthEndIso = toDbDate(lastMonthEnd);
		const sevenDaysAgoIso = toDbDate(sevenDaysAgo);

		// Stats
		Promise.all([
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ?`, [monthIso]),
			powersync.db.get(`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND category = 'expense' AND created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT coalesce(sum(oi.cost_at_sale * oi.quantity), 0) as total FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id WHERE o.status = 'completed' AND oi.status = 'completed' AND o.created_at >= ?`, [todayIso]),
			powersync.db.get(`SELECT coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at < ?`, [yesterdayIso, todayIso]),
			powersync.db.get(`SELECT coalesce(sum(total_amount), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at < ?`, [lastMonthStartIso, lastMonthEndIso])
		]).then(([todaySales, monthlySales, todayExpenses, todayCogs, yesterdaySales, lastMonthSamePeriod]) => {
			const grossProfit = ((todaySales as any)?.total ?? 0) - ((todayCogs as any)?.total ?? 0);
			nativeStats = {
				todaySales: todaySales || { count: 0, total: 0 },
				monthlySales: monthlySales || { count: 0, total: 0 },
				todayExpenses: todayExpenses || { total: 0 },
				todayProfit: grossProfit - ((todayExpenses as any)?.total ?? 0),
				yesterdaySales: yesterdaySales || { total: 0 },
				lastMonthSamePeriod: lastMonthSamePeriod || { total: 0 }
			};
		});

		// Stock alerts
		Promise.all([
			powersync.db.getAll(`SELECT p.id, p.name, pv.size, pv.stock_quantity as stock FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id WHERE pv.stock_quantity > 0 AND pv.stock_quantity <= 5 LIMIT 10`),
			powersync.db.get(`SELECT count(*) as count FROM product_variants WHERE stock_quantity > 0 AND stock_quantity <= 5`)
		]).then(([items, count]) => {
			nativeStockAlerts = { lowStockItems: items, lowStockCount: (count as any)?.count ?? 0 };
		});

		// Top products
		powersync.db.getAll(`
			SELECT product_name as name, variant_label as variantLabel,
				sum(quantity) as totalQty, sum(quantity * price_at_sale) as totalRevenue
			FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id
			WHERE o.status = 'completed' AND oi.status = 'completed' AND o.created_at >= ?
			GROUP BY product_name, variant_label ORDER BY totalQty DESC LIMIT 10
		`, [monthIso]).then((products: any) => nativeTopProducts = (products as any[]).map(p => ({
			...p, totalQty: p.totalQty, totalRevenue: p.totalRevenue
		})));

		// Last 7 days
		powersync.db.getAll(`
			SELECT substr(created_at, 1, 10) as day, coalesce(sum(total_amount), 0) as total
			FROM orders WHERE status = 'completed' AND created_at >= ?
			GROUP BY substr(created_at, 1, 10)
			ORDER BY day
		`, [sevenDaysAgoIso]).then((rows: any) => nativeLast7Days = rows as any[]);

		// Payment breakdown
		Promise.all([
			powersync.db.get(`SELECT 'cash' as method, coalesce(sum(coalesce(cash_amount, CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND (coalesce(cash_amount, 0) > 0 OR payment_method = 'cash')`, [todayIso]),
			powersync.db.get(`SELECT 'card' as method, coalesce(sum(coalesce(card_amount, CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND (coalesce(card_amount, 0) > 0 OR payment_method = 'card')`, [todayIso]),
			powersync.db.get(`SELECT 'mobile' as method, coalesce(sum(coalesce(mobile_amount, CASE WHEN payment_method = 'mobile' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND (coalesce(mobile_amount, 0) > 0 OR payment_method = 'mobile')`, [todayIso])
		]).then(([cash, card, mobile]) => {
			nativeTodayPayments = [cash, card, mobile].filter(Boolean) as any[];
		});
	});

	// Chart lifecycle — bar chart
	$effect(() => {
		const chartData = isNative ? nativeLast7Days : null;
		if (isNative && chartData && barCanvas) {
			renderBarChart(chartData);
		}
		return () => { barChart?.destroy(); barChart = null; };
	});

	// Chart lifecycle — bar chart (web)
	$effect(() => {
		if (!isNative && barCanvas) {
			data.last7Days.then((rows: any) => renderBarChart(rows));
		}
	});

	// Chart lifecycle — doughnut chart
	$effect(() => {
		const payments = isNative ? nativeTodayPayments : null;
		if (isNative && payments && doughnutCanvas) {
			renderDoughnutChart(payments);
		}
		return () => { doughnutChart?.destroy(); doughnutChart = null; };
	});

	// Chart lifecycle — doughnut chart (web)
	$effect(() => {
		if (!isNative && doughnutCanvas) {
			data.todayPayments.then((rows: any) => renderDoughnutChart(rows));
		}
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

	<!-- Row 1: 3 KPI Cards -->
	{#snippet kpiCards(stats: any)}
		{@const todayVsYesterday = comparePercent(stats.todaySales?.total ?? 0, stats.yesterdaySales?.total ?? 0)}
		{@const monthVsLast = comparePercent(stats.monthlySales?.total ?? 0, stats.lastMonthSamePeriod?.total ?? 0)}
		<div class="grid gap-2.5 sm:grid-cols-3 sm:gap-4">
			<div
				class="animate-in rounded-lg border bg-card p-3 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Today's Sales</span>
					<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
						<ShoppingBag class="h-3.5 w-3.5 text-emerald-600" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold break-all text-emerald-600 sm:mt-2 sm:text-2xl">
					{formatCurrency(stats.todaySales?.total ?? 0)}
				</div>
				<div class="mt-0.5 flex items-center gap-2 sm:mt-1">
					<span class="text-[10px] text-muted-foreground sm:text-xs">
						{stats.todaySales?.count ?? 0} orders
					</span>
					{#if todayVsYesterday.value > 0}
						<span class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium {todayVsYesterday.up ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}">
							{#if todayVsYesterday.up}<ArrowUpRight class="h-3 w-3" />{:else}<ArrowDownRight class="h-3 w-3" />{/if}
							{todayVsYesterday.value}% vs yesterday
						</span>
					{/if}
				</div>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Net Profit</span>
					<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
						<Wallet class="h-3.5 w-3.5 text-emerald-600" />
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
					Revenue - COGS - Expenses
				</p>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Monthly Sales</span>
					<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
						<TrendingUp class="h-3.5 w-3.5 text-blue-600" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold break-all text-blue-600 sm:mt-2 sm:text-2xl">
					{formatCurrency(stats.monthlySales?.total ?? 0)}
				</div>
				<div class="mt-0.5 flex items-center gap-2 sm:mt-1">
					<span class="text-[10px] text-muted-foreground sm:text-xs">
						{stats.monthlySales?.count ?? 0} orders
					</span>
					{#if monthVsLast.value > 0}
						<span class="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium {monthVsLast.up ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}">
							{#if monthVsLast.up}<ArrowUpRight class="h-3 w-3" />{:else}<ArrowDownRight class="h-3 w-3" />{/if}
							{monthVsLast.value}% vs last month
						</span>
					{/if}
				</div>
			</div>
		</div>
	{/snippet}

	{#if isNative}
		{#if nativeStats === null}
			<div class="grid gap-2.5 sm:grid-cols-3 sm:gap-4">
				{#each Array(3) as _}
					<div class="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
			</div>
		{:else}
			{@render kpiCards(nativeStats)}
		{/if}
	{:else}
		{#await data.stats}
			<div class="grid gap-2.5 sm:grid-cols-3 sm:gap-4">
				{#each Array(3) as _}
					<div class="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
			</div>
		{:then stats}
			{@render kpiCards(stats)}
		{/await}
	{/if}

	<!-- Row 2: 2 Charts -->
	<div class="grid gap-4 md:grid-cols-2">
		<Card.Root>
			<Card.Header>
				<Card.Title>Last 7 Days Revenue</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if isNative}
					{#if nativeLast7Days.length === 0 && nativeStats === null}
						<Skeleton class="h-[200px] w-full" />
					{:else}
						<div class="h-[200px]">
							<canvas bind:this={barCanvas}></canvas>
						</div>
					{/if}
				{:else}
					{#await data.last7Days}
						<Skeleton class="h-[200px] w-full" />
					{:then _}
						<div class="h-[200px]">
							<canvas bind:this={barCanvas}></canvas>
						</div>
					{/await}
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header>
				<Card.Title>Today's Payment Split</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if isNative}
					{#if nativeTodayPayments.length === 0 && nativeStats === null}
						<Skeleton class="h-[200px] w-full" />
					{:else if nativeTodayPayments.every((p: any) => (p?.total ?? 0) === 0)}
						<div class="flex h-[200px] items-center justify-center text-sm text-muted-foreground italic">
							No sales yet today
						</div>
					{:else}
						<div class="h-[200px]">
							<canvas bind:this={doughnutCanvas}></canvas>
						</div>
					{/if}
				{:else}
					{#await data.todayPayments}
						<Skeleton class="h-[200px] w-full" />
					{:then payments}
						{#if payments.every((p: any) => (p?.total ?? 0) === 0)}
							<div class="flex h-[200px] items-center justify-center text-sm text-muted-foreground italic">
								No sales yet today
							</div>
						{:else}
							<div class="h-[200px]">
								<canvas bind:this={doughnutCanvas}></canvas>
							</div>
						{/if}
					{/await}
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Row 3: 2 Tables -->
	<div class="grid gap-4 md:grid-cols-2">
		<Card.Root class="h-full">
			<Card.Header class="flex flex-row items-center justify-between">
				<div class="flex items-center gap-2">
					<Trophy class="h-4 w-4 text-amber-500" />
					<Card.Title>Top Selling Products</Card.Title>
				</div>
				<span class="text-[10px] text-muted-foreground sm:text-xs">This month</span>
			</Card.Header>
			<Card.Content class="p-0 sm:p-6">
				{#if isNative}
					{#if nativeTopProducts.length === 0 && nativeStats === null}
						<div class="space-y-4 p-4 sm:p-0">
							{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
						</div>
					{:else}
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head class="pl-4 sm:pl-0">Product</Table.Head>
										<Table.Head class="text-right">Qty</Table.Head>
										<Table.Head class="pr-4 text-right sm:pr-0">Revenue</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each nativeTopProducts as product, i}
										<Table.Row>
											<Table.Cell class="py-2.5 pl-4 sm:pl-0">
												<div class="flex items-center gap-2">
													<span
														class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {i <
														3
															? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
															: 'bg-muted text-muted-foreground'}"
													>
														{i + 1}
													</span>
													<div class="min-w-0">
														<div class="truncate text-xs font-medium sm:text-sm">{product.name}</div>
														<div class="truncate text-[10px] text-muted-foreground">{product.variantLabel}</div>
													</div>
												</div>
											</Table.Cell>
											<Table.Cell class="py-2.5 text-right font-mono text-xs sm:text-sm">{product.totalQty}</Table.Cell>
											<Table.Cell class="py-2.5 pr-4 text-right font-bold text-xs sm:pr-0 sm:text-sm"
												>{formatCurrency(product.totalRevenue)}</Table.Cell
											>
										</Table.Row>
									{/each}
									{#if nativeTopProducts.length === 0}
										<Table.Row
											><Table.Cell
												colspan={3}
												class="py-8 text-center text-muted-foreground italic text-xs"
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
						<div class="space-y-4 p-4 sm:p-0">
							{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
						</div>
					{:then products}
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head class="pl-4 sm:pl-0">Product</Table.Head>
										<Table.Head class="text-right">Qty</Table.Head>
										<Table.Head class="pr-4 text-right sm:pr-0">Revenue</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each products as product, i}
										<Table.Row>
											<Table.Cell class="py-2.5 pl-4 sm:pl-0">
												<div class="flex items-center gap-2">
													<span
														class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold {i <
														3
															? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
															: 'bg-muted text-muted-foreground'}"
													>
														{i + 1}
													</span>
													<div class="min-w-0">
														<div class="truncate text-xs font-medium sm:text-sm">{product.name}</div>
														<div class="truncate text-[10px] text-muted-foreground">{product.variantLabel}</div>
													</div>
												</div>
											</Table.Cell>
											<Table.Cell class="py-2.5 text-right font-mono text-xs sm:text-sm">{product.totalQty}</Table.Cell>
											<Table.Cell class="py-2.5 pr-4 text-right font-bold text-xs sm:pr-0 sm:text-sm"
												>{formatCurrency(product.totalRevenue)}</Table.Cell
											>
										</Table.Row>
									{/each}
									{#if products.length === 0}
										<Table.Row
											><Table.Cell
												colspan={3}
												class="py-8 text-center text-muted-foreground italic text-xs"
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

		<Card.Root class="h-full">
			<Card.Header class="flex flex-row items-center justify-between">
				<Card.Title>Low Stock Items</Card.Title>
				<Button variant="ghost" size="sm" href="/inventory" class="cursor-pointer text-xs"
					>View All</Button
				>
			</Card.Header>
			<Card.Content class="p-0 sm:p-6">
				{#if isNative}
					{#if nativeStockAlerts === null}
						<div class="space-y-4 p-4 sm:p-0">
							{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
						</div>
					{:else}
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Body>
									{#each nativeStockAlerts.lowStockItems as item}
										<Table.Row>
											<Table.Cell class="py-2.5 pl-4 sm:pl-0">
												<div class="text-xs font-medium sm:text-sm">{item.name}</div>
												<div class="text-[10px] text-muted-foreground">{item.size}</div>
											</Table.Cell>
											<Table.Cell class="py-2.5 pr-4 text-right sm:pr-0"
												><Badge variant="destructive" class="px-1.5 h-5 text-[10px]">{item.stock}</Badge></Table.Cell
											>
										</Table.Row>
									{/each}
									{#if nativeStockAlerts.lowStockItems.length === 0}
										<Table.Row
											><Table.Cell class="py-8 text-center text-muted-foreground italic text-xs"
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
						<div class="space-y-4 p-4 sm:p-0">
							{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
						</div>
					{:then alerts}
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Body>
									{#each alerts.lowStockItems as item}
										<Table.Row>
											<Table.Cell class="py-2.5 pl-4 sm:pl-0">
												<div class="text-xs font-medium sm:text-sm">{item.name}</div>
												<div class="text-[10px] text-muted-foreground">{item.size}</div>
											</Table.Cell>
											<Table.Cell class="py-2.5 pr-4 text-right sm:pr-0"
												><Badge variant="destructive" class="px-1.5 h-5 text-[10px]">{item.stock}</Badge></Table.Cell
											>
										</Table.Row>
									{/each}
									{#if alerts.lowStockItems.length === 0}
										<Table.Row
											><Table.Cell class="py-8 text-center text-muted-foreground italic text-xs"
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
