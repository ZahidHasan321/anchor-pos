<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DateInput } from '$lib/components/ui/date-input';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
	import { formatCurrency, getCurrencySymbol, formatDate, formatDateTime } from '$lib/format';
	import { globalSettings } from '$lib/settings.svelte';
	import { goto } from '$app/navigation';
	import { Chart, registerables } from 'chart.js';
	Chart.register(...registerables);

	let { data } = $props();

	// Dialog states
	let detailType = $state<'products' | 'staff' | 'customers' | 'inventory' | 'expenses' | null>(
		null
	);
	let detailData = $state<any[]>([]);
	let isDetailLoading = $state(false);
	let isDialogOpen = $state(false);
	let detailPage = $state(1);
	let hasMoreDetails = $state(true);

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;

	function updateChart(chartData: any[]) {
		if (!chartCanvas) return;
		if (chartInstance) chartInstance.destroy();

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
				labels: chartData.map((d: any) => d.date),
				datasets: [
					{
						label: 'Revenue',
						data: chartData.map((d: any) => d.amount),
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
								const dayData = chartData[context.dataIndex];
								return [`Revenue: ${formatCurrency(val || 0)}`, `Orders: ${dayData.count}`];
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
								if (Number(val) >= 1000) return `${getCurrencySymbol()}${Number(val) / 1000}k`;
								return `${getCurrencySymbol()}${val}`;
							}
						}
					}
				}
			}
		});
	}

	$effect(() => {
		data.chartData.then((cd: any[]) => {
			if (cd && cd.length > 0) updateChart(cd);
		});
		return () => {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
		};
	});

	async function openDetail(
		type: 'products' | 'staff' | 'customers' | 'inventory' | 'expenses',
		page = 1
	) {
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

	function pct(value: number, total: number): number {
		return total > 0 ? Math.round((value / total) * 100) : 0;
	}

	const periodLabel = $derived(
		periods.find((p) => p.value === data.period)?.label ?? 'Custom Range'
	);
</script>

<svelte:head>
	<title>Reports — Clothing POS</title>
</svelte:head>

<div class="screen-ui space-y-5 p-3 pb-20 sm:p-4 md:p-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-bold tracking-tight sm:text-2xl">Reports</h1>
			<p class="text-xs text-muted-foreground sm:text-sm">
				{periodLabel} &middot; {formatDate(data.startDate)} to {formatDate(data.endDate)}
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
				<DateInput id="from" bind:value={customFrom} class="h-8 w-[150px] text-xs" />
			</div>
			<div class="space-y-1">
				<Label for="to" class="text-[11px] font-semibold text-muted-foreground">To</Label>
				<DateInput id="to" bind:value={customTo} class="h-8 w-[150px] text-xs" />
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
		<div class="flex flex-wrap gap-2.5 sm:gap-3">
			{#await data.summaries}
				{#each Array(3) as _}
					<div class="min-w-[180px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
				<div class="min-w-[180px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
					<Skeleton class="h-4 w-24" />
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-3 w-16" />
				</div>
				<div class="min-w-[180px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
					<Skeleton class="h-4 w-24" />
					<Skeleton class="h-8 w-full" />
					<Skeleton class="h-3 w-16" />
				</div>
			{:then summaries}
				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Total Revenue</span
						>
						<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
							<DollarSign class="h-3.5 w-3.5 text-blue-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl">
						{formatCurrency(summaries.salesSummary.total)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{summaries.salesSummary.count} orders
					</p>
				</div>

				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Items Sold</span>
						<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
							<ShoppingBag class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl">{summaries.itemsSold}</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Avg {formatCurrency(summaries.salesSummary.avgOrder)}/order
					</p>
				</div>

				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Gross Profit</span
						>
						<div
							class="hidden rounded-md p-1.5 sm:block {summaries.grossProfit >= 0
								? 'bg-emerald-500/10'
								: 'bg-red-500/10'}"
						>
							{#if summaries.grossProfit >= 0}
								<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
							{:else}
								<TrendingDown class="h-3.5 w-3.5 text-red-600" />
							{/if}
						</div>
					</div>
					<div
						class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl {summaries.grossProfit >= 0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(summaries.grossProfit)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Revenue - COGS
					</p>
				</div>

				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Net Profit</span
						>
						<div
							class="hidden rounded-md p-1.5 sm:block {(summaries.netProfit ?? 0) >= 0
								? 'bg-emerald-500/10'
								: 'bg-red-500/10'}"
						>
							{#if (summaries.netProfit ?? 0) >= 0}
								<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
							{:else}
								<TrendingDown class="h-3.5 w-3.5 text-red-600" />
							{/if}
						</div>
					</div>
					<div
						class="mt-1.5 text-lg font-bold sm:mt-2 sm:text-2xl {(summaries.netProfit ?? 0) >= 0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(summaries.netProfit ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Gross Profit - Expenses
					</p>
				</div>

				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Total Stocked</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<Plus class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold text-emerald-600 sm:mt-2 sm:text-2xl">
						{summaries.totalStocked}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">Units added</p>
				</div>

				<div class="min-w-[180px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Discounts</span>
						<div class="hidden rounded-md bg-amber-500/10 p-1.5 sm:block">
							<Percent class="h-3.5 w-3.5 text-amber-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold text-amber-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(summaries.salesSummary.totalDiscount)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						{summaries.salesSummary.total > 0
							? `${pct(summaries.salesSummary.totalDiscount, summaries.salesSummary.total + summaries.salesSummary.totalDiscount)}% of gross`
							: 'No sales'}
					</p>
				</div>
			{/await}
		</div>
	</div>

	<!-- ==================== INVENTORY ASSETS ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Current Inventory Assets
		</h2>
		<div class="flex flex-wrap gap-2.5 sm:gap-3">
			{#await data.summaries}
				{#each Array(2) as _}
					<div class="min-w-[200px] flex-1 space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
					</div>
				{/each}
			{:then summaries}
				<div class="min-w-[200px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Retail Value</span
						>
						<div class="hidden rounded-md bg-emerald-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-emerald-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(summaries.inventoryRetailValue)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Potential revenue from stock
					</p>
				</div>

				<div class="min-w-[200px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Inventory Value</span
						>
						<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
							<Package class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-indigo-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(summaries.inventoryCostValue)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Total capital tied in stock
					</p>
				</div>

				<div class="min-w-[200px] flex-1 rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs"
							>Potential Profit</span
						>
						<div class="hidden rounded-md bg-blue-500/10 p-1.5 sm:block">
							<TrendingUp class="h-3.5 w-3.5 text-blue-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-blue-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(summaries.inventoryRetailValue - summaries.inventoryCostValue)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Retail - Inventory Value
					</p>
				</div>
			{/await}
		</div>
	</div>

	<!-- ==================== DAILY REVENUE CHART ==================== -->
	<Card.Root>
		<Card.Header class="px-3 pb-2 sm:px-6">
			<Card.Title class="flex items-center gap-2 text-sm sm:text-base">
				<BarChart3 class="h-4 w-4 text-muted-foreground" />
				Revenue Trend
				<span class="ml-1 text-xs font-normal text-muted-foreground">
					({data.chartGrouping})
				</span>
			</Card.Title>
		</Card.Header>
		<Card.Content class="px-3 sm:px-6">
			{#await data.chartData}
				<div class="flex h-[180px] flex-col items-center justify-end gap-2 pb-4 sm:h-[240px]">
					<div class="flex w-full items-end justify-between gap-2 px-4">
						{#each Array(12) as _, i}
							<Skeleton class="w-full" style="height: {Math.random() * 100 + 20}%" />
						{/each}
					</div>
				</div>
			{:then cd}
				{#if !cd || cd.length === 0 || cd.every((d: any) => d.amount === 0)}
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
			{/await}
		</Card.Content>
	</Card.Root>

	<!-- ==================== PAYMENT, EXPENSES, REFUNDS ==================== -->
	<div class="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="text-sm sm:text-base">Payment Methods</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 px-3 sm:space-y-4 sm:px-6">
				{#await Promise.all([data.summaries, data.paymentBreakdown])}
					{#each Array(2) as _}
						<div class="space-y-2">
							<div class="flex justify-between">
								<Skeleton class="h-4 w-16" /><Skeleton class="h-4 w-20" />
							</div>
							<Skeleton class="h-2 w-full" />
						</div>
					{/each}
				{:then [summaries, paymentBreakdown]}
					{@const paymentMap = new Map((paymentBreakdown as any[]).map((p: any) => [p.method, p]))}
					{@const totalSales = summaries.salesSummary.total}
					{#each ['cash', 'card', 'split'] as method}
						{@const mData = paymentMap.get(method) as any}
						{#if mData}
							<div class="space-y-1.5">
								<div class="flex items-center justify-between text-xs sm:text-sm">
									<div class="flex items-center gap-2">
										<div
											class="h-2.5 w-2.5 rounded-full {method === 'cash'
												? 'bg-emerald-500'
												: method === 'card'
													? 'bg-blue-500'
													: 'bg-violet-500'}"
										></div>
										<span class="font-medium capitalize">{method}</span>
									</div>
									<span class="tabular-nums">{formatCurrency(mData.total)}</span>
								</div>
								<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
									<div
										class="h-full {method === 'cash'
											? 'bg-emerald-500'
											: method === 'card'
												? 'bg-blue-500'
												: 'bg-violet-500'}"
										style="width: {pct(mData.total, totalSales)}%"
									></div>
								</div>
								<p class="text-[10px] text-muted-foreground">
									{mData.count} orders &middot; {pct(mData.total, totalSales)}%
								</p>
							</div>
						{/if}
					{/each}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="text-sm sm:text-base">Expenses</Card.Title>
					{#await data.summaries}
						<Skeleton class="h-6 w-20" />
					{:then summaries}
						<span class="text-base font-bold text-orange-600 sm:text-lg">
							{formatCurrency(summaries.expenseSummary.total)}
						</span>
					{/await}
				</div>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#await data.expenseBreakdown}
					<div class="space-y-4">
						{#each Array(3) as _}<Skeleton class="h-4 w-full" />{/each}
					</div>
				{:then expenseBreakdown}
					{#if expenseBreakdown && (expenseBreakdown as any[]).length > 0}
						{@const maxExpense = Math.max(...(expenseBreakdown as any[]).map((e: any) => e.total), 1)}
						<div class="space-y-3">
							{#each (expenseBreakdown as any[]).slice(0, 5) as exp}
								<div class="space-y-1">
									<div class="flex items-center justify-between gap-2 text-xs sm:text-sm">
										<span class="truncate">{exp.description}</span>
										<span class="text-muted-foreground tabular-nums"
											>{formatCurrency(exp.total)}</span
										>
									</div>
									<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
										<div
											class="h-full bg-orange-500/70"
											style="width: {(exp.total / maxExpense) * 100}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<p class="py-4 text-center text-sm text-muted-foreground">No expenses recorded.</p>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="text-sm sm:text-base">Refunds & Voids</Card.Title>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#await data.refundSummary}
					<div class="grid grid-cols-2 gap-2">
						<Skeleton class="h-16 w-full" />
						<Skeleton class="h-16 w-full" />
					</div>
				{:then refundSummary}
					{@const totalRefunds = !refundSummary ? 0 : (refundSummary as any[]).reduce(
						(s: number, r: any) => s + r.total,
						0
					)}
					{@const totalRefundCount = !refundSummary ? 0 : (refundSummary as any[]).reduce(
						(s: number, r: any) => s + r.count,
						0
					)}
					{#if totalRefundCount > 0}
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-2">
								<div class="rounded bg-red-500/5 p-2 text-center">
									<div class="text-lg font-bold text-red-600">{totalRefundCount}</div>
									<p class="text-[10px] text-muted-foreground">Returns</p>
								</div>
								<div class="rounded bg-red-500/5 p-2 text-center">
									<div class="text-lg font-bold text-red-600">{formatCurrency(totalRefunds)}</div>
									<p class="text-[10px] text-muted-foreground">Lost</p>
								</div>
							</div>
							<Separator />
							{#each (refundSummary as any[]) as r}
								<div class="flex items-center justify-between text-xs">
									<span class="text-muted-foreground capitalize">{r.status}</span>
									<span>{formatCurrency(r.total)} ({r.count})</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-4 text-muted-foreground/30">
							<RotateCcw class="h-7 w-7" />
							<p class="text-xs">No refunds</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- ==================== PERFORMANCE TABLES ==================== -->
	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="flex items-center gap-2 text-sm">
					<Layers class="h-4 w-4 text-muted-foreground" /> Sales by Category
				</Card.Title>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#await data.categoryBreakdown}
					<div class="space-y-4">
						{#each Array(4) as _}<Skeleton class="h-8 w-full" />{/each}
					</div>
				{:then categoryBreakdown}
					{@const totalRev =
						!categoryBreakdown ? 1 : (categoryBreakdown as any[]).reduce((s: number, c: any) => s + c.totalRevenue, 0) || 1}
					<div class="space-y-3">
						{#each (categoryBreakdown as any[]) || [] as cat}
							<div class="space-y-1">
								<div class="flex items-center justify-between text-xs sm:text-sm">
									<span class="font-medium">{cat.category}</span>
									<span class="tabular-nums"
										>{formatCurrency(cat.totalRevenue)} ({pct(cat.totalRevenue, totalRev)}%)</span
									>
								</div>
								<div class="h-1.5 overflow-hidden rounded-full bg-muted">
									<div
										class="h-full bg-primary/70"
										style="width: {(cat.totalRevenue / totalRev) * 100}%"
									></div>
								</div>
							</div>
						{:else}
							<p class="py-6 text-center text-sm text-muted-foreground">No data.</p>
						{/each}
					</div>
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="flex items-center gap-2 text-sm">
						<TrendingUp class="h-4 w-4 text-muted-foreground" /> Top Selling Products
					</Card.Title>
				</div>
			</Card.Header>
			<Card.Content class="p-0">
				{#await data.topProducts}
					<div class="space-y-3 p-4">
						{#each Array(5) as _}<Skeleton class="h-6 w-full" />{/each}
					</div>
				{:then topProducts}
					<Table.Root>
						<Table.Header
							><Table.Row class="text-xs">
								<Table.Head class="pl-6">Product</Table.Head>
								<Table.Head class="text-right">Qty</Table.Head>
								<Table.Head class="pr-6 text-right">Revenue</Table.Head>
							</Table.Row></Table.Header
						>
						<Table.Body>
							{#each (topProducts as any[])?.slice(0, 5) || [] as p}
								<Table.Row
									class="cursor-pointer text-sm hover:bg-muted/50"
									onclick={() => goto(`/inventory/${p.productId}`)}
								>
									<Table.Cell class="pl-6 font-medium">{p.productName}</Table.Cell>
									<Table.Cell class="text-right">{p.totalQty}</Table.Cell>
									<Table.Cell class="pr-6 text-right font-semibold"
										>{formatCurrency(p.totalRevenue)}</Table.Cell
									>
								</Table.Row>
							{:else}
								<Table.Row
									><Table.Cell colspan={3} class="text-center py-6 text-muted-foreground"
										>No products sold.</Table.Cell
									></Table.Row
								>
							{/each}
						</Table.Body>
					</Table.Root>
				{/await}
			</Card.Content>
		</Card.Root>
	</div>

	<!-- ==================== ACTIVITY & STAFF ==================== -->
	<Card.Root>
		<Card.Header class="px-3 pb-3 sm:px-6">
			<Card.Title class="flex items-center gap-2 text-sm">
				<Package class="h-4 w-4 text-muted-foreground" /> Recent Stock Updates
			</Card.Title>
		</Card.Header>
		<Card.Content class="p-0">
			{#await data.stockUpdates}
				<div class="space-y-3 p-4">
					{#each Array(3) as _}<Skeleton class="h-10 w-full" />{/each}
				</div>
			{:then stockUpdates}
				<Table.Root>
					<Table.Header>
						<Table.Row class="text-xs">
							<Table.Head class="pl-6">Date</Table.Head>
							<Table.Head>Product</Table.Head>
							<Table.Head class="text-right">Change</Table.Head>
							<Table.Head class="pr-6">User</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
							{#each (stockUpdates as any[]) || [] as update}
								<Table.Row class="text-sm">
									<Table.Cell class="pl-6 text-[11px] text-muted-foreground"
										>{formatDateTime(update.createdAt)}</Table.Cell
									>
									<Table.Cell class="font-medium">{update.productName} ({update.size})</Table.Cell>
									<Table.Cell
										class="text-right font-bold {update.changeAmount > 0
											? 'text-emerald-600'
											: 'text-red-600'}"
									>
										{update.changeAmount > 0 ? '+' : ''}{update.changeAmount}
									</Table.Cell>
									<Table.Cell class="pr-6 text-xs text-muted-foreground">{update.userName}</Table.Cell
									>
								</Table.Row>
							{:else}
								<Table.Row
									><Table.Cell colspan={4} class="py-6 text-center text-sm text-muted-foreground"
										>No activity.</Table.Cell
									></Table.Row
								>
							{/each}
						</Table.Body>
				</Table.Root>
			{/await}
		</Card.Content>
	</Card.Root>
</div>

<!-- Simplified Print Layout -->
<div class="print-report">
	{#await data.summaries}
		<p>Loading report data for printing...</p>
	{:then summaries}
		<div class="print-header">
			<h1>{data.storeName}</h1>
			<h2>Sales Report</h2>
			<p>{periodLabel} &middot; {formatDate(data.startDate)} to {formatDate(data.endDate)}</p>
		</div>
		<div class="print-divider-double"></div>
		<h3>SUMMARY</h3>
		<table class="print-summary">
			<tbody>
				<tr
					><td>Total Revenue</td><td class="right"
						>{formatCurrency(summaries.salesSummary.total)}</td
					></tr
				>
				<tr><td>Total Orders</td><td class="right">{summaries.salesSummary.count}</td></tr>
				<tr><td>Items Sold</td><td class="right">{summaries.itemsSold}</td></tr>
				<tr class="print-row-bold"
					><td>Gross Profit</td><td class="right">{formatCurrency(summaries.grossProfit)}</td></tr
				>
				<tr class="print-row-bold"
					><td>Net Profit</td><td class="right">{formatCurrency(summaries.netProfit ?? 0)}</td></tr
				>
			</tbody>
		</table>
		<div class="print-divider-double"></div>
		<p class="print-footer">End of Report</p>
	{/await}
</div>

<style>
	.print-report {
		display: none;
	}
	@media print {
		.screen-ui {
			display: none !important;
		}
		.print-report {
			display: block !important;
			font-family: monospace;
		}
		.right {
			text-align: right;
		}
		.print-row-bold {
			font-weight: bold;
			border-top: 1px solid #000;
		}
	}
</style>
