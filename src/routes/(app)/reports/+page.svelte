<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		TrendingUp,
		TrendingDown,
		ShoppingBag,
		BarChart3,
		DollarSign,
		Users,
		UserCheck,
		Layers,
		Package,
		Plus,
		RotateCcw,
		Printer,
		Percent,
		Loader2,
		ExternalLink
	} from '@lucide/svelte';
	import { formatBDT, formatDate, formatDateTime } from '$lib/format';
	import { goto } from '$app/navigation';
	import { Chart, registerables } from 'chart.js';
	Chart.register(...registerables);

	let { data } = $props();

	// Dialog states
	let detailType = $state<'products' | 'staff' | 'customers' | 'inventory' | null>(null);
	let detailData = $state<any[]>([]);
	let isDetailLoading = $state(false);
	let isDialogOpen = $state(false);
	let detailPage = $state(1);
	let hasMoreDetails = $state(true);

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;

	$effect(() => {
		if (chartCanvas && data.chartData) {
			if (chartInstance) {
				chartInstance.destroy();
			}

			const ctx = chartCanvas.getContext('2d');
			if (!ctx) return;

			const style = getComputedStyle(document.documentElement);
			const primaryColor = style.getPropertyValue('--primary').trim() || '#3b82f6';
			const mutedColor = style.getPropertyValue('--muted-foreground').trim() || '#64748b';
			const gridColor = style.getPropertyValue('--border').trim() || '#e2e8f0';
			const popoverBg = style.getPropertyValue('--popover').trim() || '#fff';
			const popoverFg = style.getPropertyValue('--popover-foreground').trim() || '#000';

			chartInstance = new Chart(ctx, {
				type: 'bar',
				data: {
					labels: data.chartData.map((d: any) => d.date),
					datasets: [
						{
							label: 'Revenue',
							data: data.chartData.map((d: any) => d.amount),
							backgroundColor: primaryColor,
							borderRadius: 4,
							borderSkipped: false,
							maxBarThickness: 40
						}
					]
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
							padding: 12,
							displayColors: false,
							callbacks: {
								label: (context) => {
									const val = context.parsed.y;
									const dayData = data.chartData[context.dataIndex];
									return [`Revenue: ${formatBDT(val || 0)}`, `Orders: ${dayData.count}`];
								}
							}
						}
					},
					scales: {
						x: {
							grid: { display: false },
							ticks: {
								color: mutedColor,
								font: { size: 10 },
								maxRotation: 0,
								autoSkip: true,
								maxTicksLimit: data.chartGrouping === 'hour' ? 12 : 15
							}
						},
						y: {
							beginAtZero: true,
							grid: {
								color: gridColor,
								drawTicks: false
							},
							ticks: {
								color: mutedColor,
								font: { size: 10 },
								callback: (val) => {
									if (Number(val) >= 1000) return `৳${Number(val) / 1000}k`;
									return `৳${val}`;
								}
							}
						}
					}
				}
			});
		}

		return () => {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
		};
	});

	async function openDetail(type: 'products' | 'staff' | 'customers' | 'inventory', page = 1) {
		if (page === 1) {
			detailType = type;
			isDialogOpen = true;
			detailData = [];
		}
		detailPage = page;
		isDetailLoading = true;
		try {
			const res = await fetch(
				`/api/reports/details?type=${type}&from=${data.startDate}&to=${data.endDate}&page=${page}`
			);
			if (res.ok) {
				const newData = await res.json();
				if (page === 1) {
					detailData = newData;
				} else {
					detailData = [...detailData, ...newData];
				}
				hasMoreDetails = newData.length === 20;
			}
		} catch (e) {
			console.error('Failed to fetch details:', e);
		} finally {
			isDetailLoading = false;
		}
	}

	const periods = [
		{ value: 'today', label: 'Today' },
		{ value: 'week', label: '7 Days' },
		{ value: 'month', label: 'This Month' },
		{ value: 'year', label: 'This Year' },
		{ value: 'all', label: 'All Time' }
	];

	let customFrom = $state('');
	let customTo = $state('');

	$effect(() => {
		customFrom = data.startDate;
		customTo = data.endDate;
	});

	function selectPeriod(period: string) {
		goto(`/reports?period=${period}`);
	}

	function applyCustomRange() {
		goto(`/reports?period=custom&from=${customFrom}&to=${customTo}`);
	}

	const maxChartValue = $derived(Math.max(...data.chartData.map((d: any) => d.amount), 1));

	// Payment breakdown
	const paymentMap = $derived(new Map(data.paymentBreakdown.map((p: any) => [p.method, p])));
	const cashData = $derived(paymentMap.get('cash'));
	const cardData = $derived(paymentMap.get('card'));
	const splitData = $derived(paymentMap.get('split'));
	const totalSales = $derived(data.salesSummary.total);

	function pct(value: number, total: number): number {
		return total > 0 ? Math.round((value / total) * 100) : 0;
	}

	// Category chart
	const maxCategoryRevenue = $derived(
		Math.max(...(data.categoryBreakdown?.map((c: any) => c.totalRevenue) ?? [0]), 1)
	);

	const totalRefunds = $derived(
		(data.refundSummary ?? []).reduce((sum: number, r: any) => sum + r.total, 0)
	);
	const totalRefundCount = $derived(
		(data.refundSummary ?? []).reduce((sum: number, r: any) => sum + r.count, 0)
	);

	const maxExpenseTotal = $derived(
		Math.max(...(data.expenseBreakdown?.map((e: any) => e.total) ?? [0]), 1)
	);

	// Period label
	const periodLabel = $derived(
		periods.find((p) => p.value === data.period)?.label ?? 'Custom Range'
	);

	// Display slices (Top 5)
	const displayProducts = $derived(data.topProducts.slice(0, 5));
	const displayStaff = $derived(data.cashierPerformance.slice(0, 5));
	const displayCustomers = $derived(data.topCustomers.slice(0, 5));
</script>

<svelte:head>
	<title>Reports — Clothing POS</title>
</svelte:head>

<!-- ============================================================ -->
<!-- SCREEN UI (hidden on print) -->
<!-- ============================================================ -->
<div class="screen-ui space-y-5 p-3 pb-20 sm:p-4 md:p-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-bold tracking-tight sm:text-2xl">Reports</h1>
			<p class="text-xs text-muted-foreground sm:text-sm">
				{periodLabel} &middot; {data.startDate} to {data.endDate}
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={() => window.print()} class="cursor-pointer">
			<Printer class="mr-2 h-4 w-4" /> Print
		</Button>
	</div>

	<!-- Period Selector -->
	<div
		class="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between"
	>
		<div class="flex flex-wrap gap-1.5">
			{#each periods as p}
				<Button
					variant={data.period === p.value ? 'default' : 'ghost'}
					size="sm"
					class="h-8 cursor-pointer text-xs"
					onclick={() => selectPeriod(p.value)}
				>
					{p.label}
				</Button>
			{/each}
		</div>

		<div class="flex flex-wrap items-end gap-2">
			<div class="space-y-1">
				<Label for="from" class="text-[11px] font-semibold text-muted-foreground">From</Label>
				<Input id="from" type="date" bind:value={customFrom} class="h-8 w-[150px] text-xs" />
			</div>
			<div class="space-y-1">
				<Label for="to" class="text-[11px] font-semibold text-muted-foreground">To</Label>
				<Input id="to" type="date" bind:value={customTo} class="h-8 w-[150px] text-xs" />
			</div>
			<Button size="sm" onclick={applyCustomRange} class="h-8 cursor-pointer text-xs">Apply</Button>
		</div>
	</div>

	<!-- ==================== SALES OVERVIEW ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Sales Overview
		</h2>
		<div class="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
			<div
				class="animate-in rounded-lg border bg-card p-3 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Total Revenue</span
					>
					<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
						<DollarSign class="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl">
					{formatBDT(data.salesSummary.total)}
				</div>
				<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
					{data.salesSummary.count} orders
				</p>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-75 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Items Sold</span>
					<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
						<ShoppingBag class="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl">{data.itemsSold}</div>
				<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
					Avg {formatBDT(data.salesSummary.avgOrder)}/order
				</p>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-150 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Gross Profit</span>
					<div
						class="hidden rounded-md p-1.5 sm:block {data.grossProfit >= 0
							? 'bg-emerald-500/10'
							: 'bg-red-500/10'}"
					>
						{#if data.grossProfit >= 0}
							<TrendingUp class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
						{:else}
							<TrendingDown class="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
						{/if}
					</div>
				</div>
				<div
					class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl {data.grossProfit >= 0
						? 'text-emerald-600'
						: 'text-red-600'}"
				>
					{formatBDT(data.grossProfit)}
				</div>
				<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
					Revenue - Expenses
				</p>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-200 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Total Stocked</span
					>
					<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
						<Plus class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold text-emerald-600 sm:mt-2 sm:text-2xl">
					{data.stockSummary.totalStocked}
				</div>
				<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">Units added</p>
			</div>

			<div
				class="animate-in rounded-lg border bg-card p-3 delay-300 duration-300 fill-mode-both fade-in slide-in-from-bottom-2 sm:p-4"
			>
				<div class="flex items-center justify-between">
					<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Discounts</span>
					<div class="hidden rounded-md bg-amber-500/10 p-1.5 sm:block">
						<Percent class="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
					</div>
				</div>
				<div class="mt-1.5 text-lg font-bold text-amber-600 sm:mt-2 sm:text-2xl">
					{formatBDT(data.salesSummary.totalDiscount)}
				</div>
				<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
					{totalSales > 0
						? `${pct(data.salesSummary.totalDiscount, totalSales + data.salesSummary.totalDiscount)}% of gross`
						: 'No sales yet'}
				</p>
			</div>
		</div>
	</div>

	<!-- ==================== DAILY REVENUE CHART ==================== -->
	<Card.Root>
		<Card.Header class="px-3 pb-2 sm:px-6">
			<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
				<BarChart3 class="h-4 w-4 text-muted-foreground" />
				Revenue Trend
				<span class="ml-1 text-xs font-normal text-muted-foreground"
					>({(
						{ hour: 'Hourly', day: 'Daily', month: 'Monthly', year: 'Yearly' } as Record<
							string,
							string
						>
					)[data.chartGrouping] ?? 'Daily'})</span
				>
			</Card.Title>
		</Card.Header>
		<Card.Content class="px-3 sm:px-6">
			{#if data.chartData.length === 0 || data.chartData.every((d: any) => d.amount === 0)}
				<div
					class="flex h-[180px] items-center justify-center text-sm text-muted-foreground sm:h-[240px]"
				>
					No sales data for this period.
				</div>
			{:else}
				<div class="h-[180px] w-full pt-4 sm:h-[240px]">
					<canvas bind:this={chartCanvas}></canvas>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	<!-- ==================== PAYMENT, EXPENSES, REFUNDS ==================== -->
	<div class="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="text-sm sm:text-base">Payment Methods</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 px-3 sm:space-y-4 sm:px-6">
				{#if data.paymentBreakdown.length === 0}
					<p class="py-4 text-center text-sm text-muted-foreground">No payments recorded.</p>
				{:else}
					{@const methods = [
						{ key: 'cash', label: 'Cash', data: cashData, color: 'bg-emerald-500' },
						{ key: 'card', label: 'Card', data: cardData, color: 'bg-blue-500' },
						{ key: 'split', label: 'Split', data: splitData, color: 'bg-violet-500' }
					]}
					{#each methods as m}
						{#if m.data}
							<div class="space-y-1.5">
								<div class="flex items-center justify-between text-xs sm:text-sm">
									<div class="flex items-center gap-2">
										<div class="h-2.5 w-2.5 rounded-full {m.color}"></div>
										<span class="font-medium">{m.label}</span>
									</div>
									<span class="tabular-nums">{formatBDT(m.data.total)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full rounded-full {m.color} animate-in transition-all duration-500 ease-out fill-mode-forwards slide-in-from-left"
										style="width: {pct(m.data.total, totalSales)}%"
									></div>
								</div>
								<p class="text-[10px] text-muted-foreground sm:text-[11px]">
									{m.data.count} orders &middot; {pct(m.data.total, totalSales)}%
								</p>
							</div>
						{/if}
					{/each}
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="text-sm sm:text-base">Expenses</Card.Title>
					<span class="text-base font-bold text-orange-600 sm:text-lg">
						{formatBDT(data.expenseSummary.total)}
					</span>
				</div>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#if data.expenseBreakdown && data.expenseBreakdown.length > 0}
					<div class="space-y-2.5 sm:space-y-3">
						{#each data.expenseBreakdown as exp}
							<div class="space-y-1">
								<div class="flex items-center justify-between gap-2 text-xs sm:text-sm">
									<span class="min-w-0 truncate">{exp.description}</span>
									<span class="shrink-0 text-muted-foreground tabular-nums">
										{formatBDT(exp.total)}
									</span>
								</div>
								<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full animate-in rounded-full bg-orange-500/70 transition-all duration-500 ease-out fill-mode-forwards slide-in-from-left"
										style="width: {(exp.total / maxExpenseTotal) * 100}%"
									></div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<p class="py-4 text-center text-sm text-muted-foreground">No expenses recorded.</p>
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="md:col-span-2 lg:col-span-1">
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="text-sm sm:text-base">Refunds & Voids</Card.Title>
					{#if totalRefundCount > 0}
						<span class="text-base font-bold text-red-600 sm:text-lg">
							{formatBDT(totalRefunds)}
						</span>
					{/if}
				</div>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#if totalRefundCount > 0}
					<div class="space-y-3">
						<div class="grid grid-cols-2 gap-2.5">
							<div class="rounded-md bg-red-500/5 p-2.5 text-center sm:p-3">
								<div class="text-lg font-bold text-red-600 sm:text-xl">{totalRefundCount}</div>
								<p class="text-[10px] text-muted-foreground sm:text-[11px]">Total Returns</p>
							</div>
							<div class="rounded-md bg-red-500/5 p-2.5 text-center sm:p-3">
								<div class="text-lg font-bold text-red-600 sm:text-xl">
									{formatBDT(totalRefunds)}
								</div>
								<p class="text-[10px] text-muted-foreground sm:text-[11px]">Amount Lost</p>
							</div>
						</div>
						<Separator />
						{#each data.refundSummary as r}
							<div class="flex items-center justify-between text-xs sm:text-sm">
								<span class="text-muted-foreground capitalize">{r.status}</span>
								<span class="font-medium">
									{formatBDT(r.total)}
									<span class="text-muted-foreground">({r.count})</span>
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-4 text-center">
						<RotateCcw class="mb-2 h-7 w-7 text-muted-foreground/30" />
						<p class="text-xs text-muted-foreground sm:text-sm">No refunds or voids</p>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- ==================== PRODUCT PERFORMANCE ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Product Performance
		</h2>
		<div class="grid gap-3 sm:gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header class="px-3 pb-3 sm:px-6">
					<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
						<Layers class="h-4 w-4 text-muted-foreground" />
						Sales by Category
					</Card.Title>
				</Card.Header>
				<Card.Content class="px-3 sm:px-6">
					{#if data.categoryBreakdown.length > 0}
						{@const barColors = [
							'#3b82f6',
							'#10b981',
							'#8b5cf6',
							'#f59e0b',
							'#f43f5e',
							'#06b6d4',
							'#f97316',
							'#14b8a6'
						]}
						<div class="space-y-2.5 sm:space-y-3">
							{#each data.categoryBreakdown as cat, i}
								{@const barColor = barColors[i % barColors.length]}
								<div class="space-y-1">
									<div class="flex items-center justify-between gap-2 text-xs sm:text-sm">
										<div class="flex min-w-0 items-center gap-2">
											<div
												class="h-2.5 w-2.5 shrink-0 rounded-full"
												style="background-color: {barColor}"
											></div>
											<span class="truncate font-medium">{cat.category}</span>
										</div>
										<div class="shrink-0 text-right">
											<span class="tabular-nums">{formatBDT(cat.totalRevenue)}</span>
											<span class="ml-1 text-[10px] text-muted-foreground sm:text-[11px]">
												({cat.totalQty} pcs)
											</span>
										</div>
									</div>
									<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div
											class="h-full animate-in rounded-full transition-all duration-500 ease-out fill-mode-forwards slide-in-from-left"
											style="width: {(cat.totalRevenue / maxCategoryRevenue) *
												100}%; background-color: {barColor}; opacity: 0.7"
										></div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">No category data.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="px-3 pb-3 sm:px-6">
					<div class="flex items-center justify-between">
						<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
							<TrendingUp class="h-4 w-4 text-muted-foreground" />
							Top Selling Products
						</Card.Title>
						{#if data.topProducts.length >= 10}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 px-2 text-[11px]"
								onclick={() => openDetail('products')}
							>
								View All <ExternalLink class="ml-1 h-3 w-3" />
							</Button>
						{/if}
					</div>
				</Card.Header>
				<Card.Content class="p-0">
					{#if displayProducts.length > 0}
						<div class="divide-y sm:hidden">
							{#each displayProducts as p, i}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex items-center justify-between px-3 py-2.5 {p.productId
										? 'cursor-pointer hover:bg-muted/50'
										: ''}"
									onclick={() => p.productId && goto(`/inventory/${p.productId}`)}
								>
									<div class="min-w-0">
										<div class="flex items-center gap-2">
											<span class="text-xs text-muted-foreground">{i + 1}.</span>
											<span class="truncate text-sm font-medium">{p.productName}</span>
										</div>
										<span class="text-[11px] text-muted-foreground">{p.totalQty} sold</span>
									</div>
									<span class="shrink-0 text-sm font-semibold tabular-nums">
										{formatBDT(p.totalRevenue)}
									</span>
								</div>
							{/each}
						</div>
						<div class="hidden sm:block">
							<Table.Root>
								<Table.Header>
									<Table.Row class="text-xs">
										<Table.Head class="w-8 pl-6">#</Table.Head>
										<Table.Head>Product</Table.Head>
										<Table.Head class="text-right">Qty</Table.Head>
										<Table.Head class="pr-6 text-right">Revenue</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each displayProducts as p, i}
										<Table.Row
											class="text-sm {p.productId ? 'cursor-pointer hover:bg-muted/50' : ''}"
											onclick={() => p.productId && goto(`/inventory/${p.productId}`)}
										>
											<Table.Cell class="pl-6 text-muted-foreground">{i + 1}</Table.Cell>
											<Table.Cell class="font-medium">{p.productName}</Table.Cell>
											<Table.Cell class="text-right tabular-nums">{p.totalQty}</Table.Cell>
											<Table.Cell class="pr-6 text-right font-semibold tabular-nums">
												{formatBDT(p.totalRevenue)}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">No products sold.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>

	<!-- ==================== INVENTORY ACTIVITY ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Inventory Activity
		</h2>
		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
						<Package class="h-4 w-4 text-muted-foreground" />
						Recent Stock Updates
					</Card.Title>
					{#if data.stockUpdates.length >= 10}
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2 text-[11px]"
							onclick={() => openDetail('inventory')}
						>
							View All <ExternalLink class="ml-1 h-3 w-3" />
						</Button>
					{/if}
				</div>
			</Card.Header>
			<Card.Content class="p-0">
				{#if data.stockUpdates.length > 0}
					<div class="divide-y sm:hidden">
						{#each data.stockUpdates as update}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="flex items-center justify-between px-3 py-2.5 {update.productId
									? 'cursor-pointer hover:bg-muted/50'
									: ''}"
								onclick={() => update.productId && goto(`/inventory/${update.productId}`)}
							>
								<div class="min-w-0">
									<div class="text-sm font-medium">
										{update.productName} ({update.size})
									</div>
									<div class="text-[11px] text-muted-foreground">
										{update.reason} &middot; {update.userName}
									</div>
								</div>
								<div class="shrink-0 text-right">
									<div
										class="text-sm font-bold {update.changeAmount > 0
											? 'text-emerald-600'
											: 'text-red-600'}"
									>
										{update.changeAmount > 0 ? '+' : ''}{update.changeAmount}
									</div>
									<div class="text-[10px] text-muted-foreground">
										{formatDateTime(update.createdAt)}
									</div>
								</div>
							</div>
						{/each}
					</div>
					<div class="hidden sm:block">
						<Table.Root>
							<Table.Header>
								<Table.Row class="text-xs">
									<Table.Head class="pl-6">Date</Table.Head>
									<Table.Head>Product</Table.Head>
									<Table.Head>Size</Table.Head>
									<Table.Head class="text-right">Change</Table.Head>
									<Table.Head>Reason</Table.Head>
									<Table.Head class="pr-6">User</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each data.stockUpdates as update}
									<Table.Row
										class="text-sm {update.productId ? 'cursor-pointer hover:bg-muted/50' : ''}"
										onclick={() => update.productId && goto(`/inventory/${update.productId}`)}
									>
										<Table.Cell class="pl-6 text-muted-foreground">
											{formatDateTime(update.createdAt)}
										</Table.Cell>
										<Table.Cell class="font-medium">{update.productName}</Table.Cell>
										<Table.Cell>{update.size}</Table.Cell>
										<Table.Cell
											class="text-right font-bold {update.changeAmount > 0
												? 'text-emerald-600'
												: 'text-red-600'}"
										>
											{update.changeAmount > 0 ? '+' : ''}{update.changeAmount}
										</Table.Cell>
										<Table.Cell class="text-muted-foreground">{update.reason}</Table.Cell>
										<Table.Cell class="pr-6">{update.userName}</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					</div>
				{:else}
					<p class="py-6 text-center text-sm text-muted-foreground">
						No stock updates in this period.
					</p>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- ==================== TEAM & CUSTOMERS ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Team & Customers
		</h2>
		<div class="grid gap-3 sm:gap-4 lg:grid-cols-2">
			<Card.Root>
				<Card.Header class="px-3 pb-3 sm:px-6">
					<div class="flex items-center justify-between">
						<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
							<UserCheck class="h-4 w-4 text-muted-foreground" />
							Sales Staff Performance
						</Card.Title>
						{#if data.cashierPerformance.length > 5}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 px-2 text-[11px]"
								onclick={() => openDetail('staff')}
							>
								View All <ExternalLink class="ml-1 h-3 w-3" />
							</Button>
						{/if}
					</div>
				</Card.Header>
				<Card.Content class="p-0">
					{#if displayStaff.length > 0}
						<div class="divide-y sm:hidden">
							{#each displayStaff as c}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex items-center justify-between px-3 py-2.5 {c.userId
										? 'cursor-pointer hover:bg-muted/50'
										: ''}"
									onclick={() => c.userId && goto(`/settings/users/${c.userId}`)}
								>
									<div>
										<div class="text-sm font-medium">{c.cashierName}</div>
										<span class="text-[11px] text-muted-foreground">
											{c.orderCount} orders &middot; Avg {formatBDT(c.avgOrder)}
										</span>
									</div>
									<span class="shrink-0 text-sm font-semibold tabular-nums">
										{formatBDT(c.totalSales)}
									</span>
								</div>
							{/each}
						</div>
						<div class="hidden sm:block">
							<Table.Root>
								<Table.Header>
									<Table.Row class="text-xs">
										<Table.Head class="pl-6">Staff</Table.Head>
										<Table.Head class="text-right">Orders</Table.Head>
										<Table.Head class="text-right">Avg</Table.Head>
										<Table.Head class="pr-6 text-right">Total</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each displayStaff as c}
										<Table.Row
											class="text-sm {c.userId ? 'cursor-pointer hover:bg-muted/50' : ''}"
											onclick={() => c.userId && goto(`/settings/users/${c.userId}`)}
										>
											<Table.Cell class="pl-6 font-medium">{c.cashierName}</Table.Cell>
											<Table.Cell class="text-right tabular-nums">{c.orderCount}</Table.Cell>
											<Table.Cell class="text-right text-muted-foreground tabular-nums">
												{formatBDT(c.avgOrder)}
											</Table.Cell>
											<Table.Cell class="pr-6 text-right font-semibold tabular-nums">
												{formatBDT(c.totalSales)}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">No staff data.</p>
					{/if}
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header class="px-3 pb-3 sm:px-6">
					<div class="flex items-center justify-between">
						<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
							<Users class="h-4 w-4 text-muted-foreground" />
							Top Customers
						</Card.Title>
						{#if data.topCustomers.length >= 10}
							<Button
								variant="ghost"
								size="sm"
								class="h-7 px-2 text-[11px]"
								onclick={() => openDetail('customers')}
							>
								View All <ExternalLink class="ml-1 h-3 w-3" />
							</Button>
						{/if}
					</div>
				</Card.Header>
				<Card.Content class="p-0">
					{#if displayCustomers.length > 0}
						<div class="divide-y sm:hidden">
							{#each displayCustomers as c}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="flex items-center justify-between px-3 py-2.5 {c.customerId
										? 'cursor-pointer hover:bg-muted/50'
										: ''}"
									onclick={() => c.customerId && goto(`/customers/${c.customerId}`)}
								>
									<div class="min-w-0">
										<div class="truncate text-sm font-medium">{c.customerName}</div>
										<span class="text-[11px] text-muted-foreground">
											{c.customerPhone || 'No phone'} &middot; {c.orderCount} orders
										</span>
									</div>
									<span class="shrink-0 pl-3 text-sm font-semibold tabular-nums">
										{formatBDT(c.totalSpent)}
									</span>
								</div>
							{/each}
						</div>
						<div class="hidden sm:block">
							<Table.Root>
								<Table.Header>
									<Table.Row class="text-xs">
										<Table.Head class="pl-6">Customer</Table.Head>
										<Table.Head class="text-right">Orders</Table.Head>
										<Table.Head class="pr-6 text-right">Spent</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each displayCustomers as c}
										<Table.Row
											class="text-sm {c.customerId ? 'cursor-pointer hover:bg-muted/50' : ''}"
											onclick={() => c.customerId && goto(`/customers/${c.customerId}`)}
										>
											<Table.Cell class="pl-6">
												<div class="font-medium">{c.customerName}</div>
												{#if c.customerPhone}
													<div class="text-[11px] text-muted-foreground">{c.customerPhone}</div>
												{/if}
											</Table.Cell>
											<Table.Cell class="text-right tabular-nums">{c.orderCount}</Table.Cell>
											<Table.Cell class="pr-6 text-right font-semibold tabular-nums">
												{formatBDT(c.totalSpent)}
											</Table.Cell>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					{:else}
						<p class="py-6 text-center text-sm text-muted-foreground">No customer data.</p>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>

<Dialog.Root bind:open={isDialogOpen}>
	<Dialog.Content class="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
		<Dialog.Header class="p-6 pb-2">
			<Dialog.Title class="text-xl">
				{#if detailType === 'products'}Top Selling Products{:else if detailType === 'staff'}Staff
					Performance{:else if detailType === 'inventory'}Stock Update Logs{:else}Top Customers{/if}
			</Dialog.Title>
			<Dialog.Description>
				Showing records for the period: {data.startDate} to {data.endDate}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-y-auto px-6 pb-6">
			{#if isDetailLoading && detailData.length === 0}
				<div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<Loader2 class="h-8 w-8 animate-spin" />
					<p class="mt-2 text-sm">Fetching detailed data...</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row class="text-xs">
							{#if detailType === 'products'}
								<Table.Head class="w-12">#</Table.Head>
								<Table.Head>Product Name</Table.Head>
								<Table.Head class="text-right">Qty Sold</Table.Head>
								<Table.Head class="text-right">Total Revenue</Table.Head>
							{:else if detailType === 'staff'}
								<Table.Head>Staff Name</Table.Head>
								<Table.Head class="text-right">Orders</Table.Head>
								<Table.Head class="text-right">Avg Order</Table.Head>
								<Table.Head class="text-right">Total Sales</Table.Head>
							{:else if detailType === 'inventory'}
								<Table.Head>Date</Table.Head>
								<Table.Head>Product</Table.Head>
								<Table.Head>Size</Table.Head>
								<Table.Head class="text-right">Change</Table.Head>
								<Table.Head>Reason</Table.Head>
							{:else}
								<Table.Head>Customer</Table.Head>
								<Table.Head>Phone</Table.Head>
								<Table.Head class="text-right">Orders</Table.Head>
								<Table.Head class="text-right">Total Spent</Table.Head>
							{/if}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each detailData as item, i}
							{@const navUrl =
								detailType === 'products' || detailType === 'inventory'
									? item.productId
										? `/inventory/${item.productId}`
										: null
									: detailType === 'staff'
										? item.userId
											? `/settings/users/${item.userId}`
											: null
										: detailType === 'customers'
											? item.customerId
												? `/customers/${item.customerId}`
												: null
											: null}
							<Table.Row
								class="text-sm {navUrl ? 'cursor-pointer hover:bg-muted/50' : ''}"
								onclick={() => navUrl && goto(navUrl)}
							>
								{#if detailType === 'products'}
									<Table.Cell class="text-muted-foreground">{i + 1}</Table.Cell>
									<Table.Cell class="font-medium">{item.productName}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{item.totalQty}</Table.Cell>
									<Table.Cell class="text-right font-semibold tabular-nums"
										>{formatBDT(item.totalRevenue)}</Table.Cell
									>
								{:else if detailType === 'staff'}
									<Table.Cell class="font-medium">{item.cashierName}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{item.orderCount}</Table.Cell>
									<Table.Cell class="text-right text-muted-foreground tabular-nums"
										>{formatBDT(item.avgOrder)}</Table.Cell
									>
									<Table.Cell class="text-right font-semibold tabular-nums"
										>{formatBDT(item.totalSales)}</Table.Cell
									>
								{:else if detailType === 'inventory'}
									<Table.Cell class="whitespace-nowrap text-muted-foreground"
										>{formatDateTime(item.createdAt)}</Table.Cell
									>
									<Table.Cell class="font-medium">{item.productName}</Table.Cell>
									<Table.Cell>{item.size}</Table.Cell>
									<Table.Cell
										class="text-right font-bold {item.changeAmount > 0
											? 'text-emerald-600'
											: 'text-red-600'}"
									>
										{item.changeAmount > 0 ? '+' : ''}{item.changeAmount}
									</Table.Cell>
									<Table.Cell class="text-xs text-muted-foreground">{item.reason}</Table.Cell>
								{:else}
									<Table.Cell class="font-medium">{item.customerName}</Table.Cell>
									<Table.Cell class="text-muted-foreground">{item.customerPhone || '-'}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{item.orderCount}</Table.Cell>
									<Table.Cell class="text-right font-semibold tabular-nums"
										>{formatBDT(item.totalSpent)}</Table.Cell
									>
								{/if}
							</Table.Row>
						{/each}
						{#if detailData.length === 0}
							<Table.Row>
								<Table.Cell colspan={5} class="py-10 text-center text-muted-foreground"
									>No data found for this period.</Table.Cell
								>
							</Table.Row>
						{/if}
					</Table.Body>
				</Table.Root>

				{#if hasMoreDetails}
					<div class="mt-4 flex justify-center">
						<Button
							variant="outline"
							size="sm"
							onclick={() => openDetail(detailType!, detailPage + 1)}
							disabled={isDetailLoading}
						>
							{#if isDetailLoading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{/if}
							Load More
						</Button>
					</div>
				{/if}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

<!-- ============================================================ -->
<!-- PRINT REPORT (hidden on screen, shown only when printing) -->
<!-- ============================================================ -->
<div class="print-report">
	<!-- Header -->
	<div class="print-header">
		<h1>{data.storeName}</h1>
		<h2>Sales Report</h2>
		<p>{periodLabel} &mdash; {data.startDate} to {data.endDate}</p>
		<p class="print-date">
			Generated on {new Date().toLocaleDateString('en-GB', {
				day: '2-digit',
				month: 'long',
				year: 'numeric'
			})}
		</p>
	</div>

	<div class="print-divider-double"></div>

	<!-- Summary -->
	<h3>SUMMARY</h3>
	<table class="print-summary">
		<tbody>
			<tr>
				<td>Total Revenue</td>
				<td class="right">{formatBDT(data.salesSummary.total)}</td>
			</tr>
			<tr>
				<td>Total Orders</td>
				<td class="right">{data.salesSummary.count}</td>
			</tr>
			<tr>
				<td>Items Sold</td>
				<td class="right">{data.itemsSold}</td>
			</tr>
			<tr>
				<td>Total Stocked</td>
				<td class="right">{data.stockSummary.totalStocked}</td>
			</tr>
			<tr>
				<td>Average Order Value</td>
				<td class="right">{formatBDT(data.salesSummary.avgOrder)}</td>
			</tr>
			<tr>
				<td>Discounts Given</td>
				<td class="right">({formatBDT(data.salesSummary.totalDiscount)})</td>
			</tr>
			<tr>
				<td>Total Expenses</td>
				<td class="right">({formatBDT(data.expenseSummary.total)})</td>
			</tr>
			<tr class="print-row-bold">
				<td>Gross Profit</td>
				<td class="right">{formatBDT(data.grossProfit)}</td>
			</tr>
		</tbody>
	</table>

	<div class="print-divider"></div>

	<!-- Payment Breakdown -->
	<h3>PAYMENT BREAKDOWN</h3>
	<table class="print-table">
		<thead>
			<tr>
				<th>Method</th>
				<th class="right">Orders</th>
				<th class="right">Amount</th>
				<th class="right">%</th>
			</tr>
		</thead>
		<tbody>
			{#each data.paymentBreakdown as p}
				<tr>
					<td class="capitalize">{p.method}</td>
					<td class="right">{p.count}</td>
					<td class="right">{formatBDT(p.total)}</td>
					<td class="right">{pct(p.total, totalSales)}%</td>
				</tr>
			{/each}
			{#if data.paymentBreakdown.length === 0}
				<tr><td colspan="4" class="center">No payments recorded</td></tr>
			{/if}
		</tbody>
	</table>

	<div class="print-divider"></div>

	<!-- Refunds -->
	{#if totalRefundCount > 0}
		<h3>REFUNDS & VOIDS</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Type</th>
					<th class="right">Count</th>
					<th class="right">Amount</th>
				</tr>
			</thead>
			<tbody>
				{#each data.refundSummary as r}
					<tr>
						<td class="capitalize">{r.status}</td>
						<td class="right">{r.count}</td>
						<td class="right">{formatBDT(r.total)}</td>
					</tr>
				{/each}
				<tr class="print-row-bold">
					<td>Total</td>
					<td class="right">{totalRefundCount}</td>
					<td class="right">{formatBDT(totalRefunds)}</td>
				</tr>
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Sales by Category -->
	{#if data.categoryBreakdown.length > 0}
		<h3>SALES BY CATEGORY</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Category</th>
					<th class="right">Qty Sold</th>
					<th class="right">Revenue</th>
				</tr>
			</thead>
			<tbody>
				{#each data.categoryBreakdown as cat}
					<tr>
						<td>{cat.category}</td>
						<td class="right">{cat.totalQty}</td>
						<td class="right">{formatBDT(cat.totalRevenue)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Top Products -->
	{#if data.topProducts.length > 0}
		<h3>TOP SELLING PRODUCTS</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th class="num">#</th>
					<th>Product</th>
					<th class="right">Qty</th>
					<th class="right">Revenue</th>
				</tr>
			</thead>
			<tbody>
				{#each data.topProducts as p, i}
					<tr>
						<td class="num">{i + 1}</td>
						<td>{p.productName}</td>
						<td class="right">{p.totalQty}</td>
						<td class="right">{formatBDT(p.totalRevenue)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Expenses -->
	{#if data.expenseBreakdown && data.expenseBreakdown.length > 0}
		<h3>EXPENSE BREAKDOWN</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Description</th>
					<th class="right">Count</th>
					<th class="right">Amount</th>
				</tr>
			</thead>
			<tbody>
				{#each data.expenseBreakdown as exp}
					<tr>
						<td>{exp.description}</td>
						<td class="right">{exp.count}</td>
						<td class="right">{formatBDT(exp.total)}</td>
					</tr>
				{/each}
				<tr class="print-row-bold">
					<td>Total Expenses</td>
					<td class="right">{data.expenseSummary.count}</td>
					<td class="right">{formatBDT(data.expenseSummary.total)}</td>
				</tr>
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Inventory Activity -->
	{#if data.stockUpdates.length > 0}
		<h3>INVENTORY ACTIVITY</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Date</th>
					<th>Product</th>
					<th>Size</th>
					<th class="right">Change</th>
					<th>Reason</th>
				</tr>
			</thead>
			<tbody>
				{#each data.stockUpdates as update}
					<tr>
						<td>{formatDate(update.createdAt).split(',')[0]}</td>
						<td>{update.productName}</td>
						<td>{update.size}</td>
						<td class="right">{update.changeAmount > 0 ? '+' : ''}{update.changeAmount}</td>
						<td>{update.reason}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Staff Performance -->
	{#if data.cashierPerformance.length > 0}
		<h3>STAFF PERFORMANCE</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Staff Name</th>
					<th class="right">Orders</th>
					<th class="right">Avg Order</th>
					<th class="right">Total Sales</th>
				</tr>
			</thead>
			<tbody>
				{#each data.cashierPerformance as c}
					<tr>
						<td>{c.cashierName}</td>
						<td class="right">{c.orderCount}</td>
						<td class="right">{formatBDT(c.avgOrder)}</td>
						<td class="right">{formatBDT(c.totalSales)}</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<div class="print-divider"></div>
	{/if}

	<!-- Top Customers -->
	{#if data.topCustomers.length > 0}
		<h3>TOP CUSTOMERS</h3>
		<table class="print-table">
			<thead>
				<tr>
					<th>Customer</th>
					<th>Phone</th>
					<th class="right">Orders</th>
					<th class="right">Total Spent</th>
				</tr>
			</thead>
			<tbody>
				{#each data.topCustomers as c}
					<tr>
						<td>{c.customerName}</td>
						<td>{c.customerPhone || '-'}</td>
						<td class="right">{c.orderCount}</td>
						<td class="right">{formatBDT(c.totalSpent)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}

	<div class="print-divider-double"></div>
	<p class="print-footer">End of Report</p>
</div>

<style>
	/* ========== PRINT REPORT: hidden on screen ========== */
	.print-report {
		display: none;
	}

	@media print {
		@page {
			margin: 0;
			size: auto;
		}

		/* Hide the entire screen UI */
		.screen-ui {
			display: none !important;
			height: 0 !important;
			max-height: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			overflow: hidden !important;
		}

		/* Hide navigation, sidebar, mobile top bar */
		:global(aside),
		:global(nav),
		:global(header),
		:global(.md\:hidden),
		:global(.print\:hidden),
		:global([data-sheet-content]),
		:global(.fixed.top-0),
		:global(.pb-20) {
			display: none !important;
			height: 0 !important;
			max-height: 0 !important;
			width: 0 !important;
			margin: 0 !important;
			padding: 0 !important;
			overflow: hidden !important;
		}

		:global(html),
		:global(body) {
			height: auto !important;
			min-height: 0 !important;
			overflow: visible !important;
			margin: 0 !important;
			padding: 0 !important;
			background: white !important;
		}

		:global(main) {
			margin: 0 !important;
			padding: 0 !important;
			height: auto !important;
			min-height: 0 !important;
			overflow: visible !important;
			display: block !important;
		}

		/* Reset any flex/min-height containers */
		:global(.flex.min-h-screen) {
			display: block !important;
			min-height: 0 !important;
			height: auto !important;
		}

		:global(.flex-1) {
			flex: none !important;
			display: block !important;
			height: auto !important;
		}

		/* Show print report */
		.print-report {
			display: block !important;
			padding: 10mm !important;
			margin: 0 !important;
			height: auto !important;
			font-family: 'Courier New', Courier, monospace;
			font-size: 11px;
			line-height: 1.4;
			color: #000;
		}

		/* Header */
		.print-header {
			text-align: center;
			margin-bottom: 4mm;
		}

		.print-header h1 {
			font-size: 16px;
			font-weight: bold;
			text-transform: uppercase;
			letter-spacing: 2px;
			margin: 0;
		}

		.print-header h2 {
			font-size: 13px;
			font-weight: normal;
			margin: 2px 0 0;
		}

		.print-header p {
			font-size: 10px;
			margin: 2px 0 0;
		}

		.print-date {
			font-size: 9px !important;
			color: #666;
		}

		/* Dividers */
		.print-divider {
			border: none;
			border-top: 1px dashed #999;
			margin: 4mm 0;
		}

		.print-divider-double {
			border: none;
			border-top: 2px solid #000;
			margin: 4mm 0;
		}

		/* Section headers */
		.print-report h3 {
			font-size: 11px;
			font-weight: bold;
			text-transform: uppercase;
			letter-spacing: 1px;
			margin: 0 0 2mm;
			padding: 0;
		}

		/* Summary table (label: value) */
		.print-summary {
			width: 100%;
			border-collapse: collapse;
		}

		.print-summary td {
			padding: 1px 0;
			font-size: 11px;
		}

		.print-summary .print-row-bold td {
			font-weight: bold;
			border-top: 1px solid #000;
			padding-top: 3px;
			margin-top: 2px;
		}

		/* Data tables */
		.print-table {
			width: 100%;
			border-collapse: collapse;
		}

		.print-table th {
			font-size: 10px;
			font-weight: bold;
			text-transform: uppercase;
			border-bottom: 1px solid #000;
			padding: 2px 4px;
			text-align: left;
		}

		.print-table td {
			font-size: 11px;
			padding: 2px 4px;
			border-bottom: 1px dotted #ccc;
		}

		.print-table .print-row-bold td {
			font-weight: bold;
			border-top: 1px solid #000;
			border-bottom: none;
			padding-top: 3px;
		}

		/* Alignment */
		.right {
			text-align: right !important;
		}

		.center {
			text-align: center !important;
			font-style: italic;
			color: #666;
		}

		.num {
			width: 20px;
			text-align: center !important;
		}

		.capitalize {
			text-transform: capitalize;
		}

		/* Footer */
		.print-footer {
			text-align: center;
			font-size: 9px;
			color: #666;
			margin-top: 2mm;
		}

		/* Page breaks */
		.print-report h3 {
			break-after: avoid;
			page-break-after: avoid;
		}

		.print-table {
			break-inside: avoid;
			page-break-inside: avoid;
		}
	}
</style>
