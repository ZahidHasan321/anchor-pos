<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';

	import DatePicker from '$lib/components/ui/DatePicker.svelte';
	import { Label } from '$lib/components/ui/label';
	import { Separator } from '$lib/components/ui/separator';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
		RotateCcw,
		Percent,
		Loader2,
		FileText
	} from '@lucide/svelte';
	import { formatCurrency, getCurrencySymbol, formatDate, formatDateTime } from '$lib/format';
	import { goto } from '$app/navigation';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
	import { Chart, registerables } from 'chart.js';
	import { exportReportPDF, type ReportPDFData } from '$lib/export-report-pdf';
	Chart.register(...registerables);

	let { data } = $props();

	// Native state for Electron (PowerSync SQLite)
	let nativeSummaries = $state<any>(null);
	let nativeTopProducts = $state<any[] | null>(null);
	let nativeCategoryBreakdown = $state<any[] | null>(null);
	let nativePaymentBreakdown = $state<any[] | null>(null);
	let nativeRefundSummary = $state<any[] | null>(null);
	let nativeExpenseBreakdown = $state<any[] | null>(null);
	let nativeStockUpdates = $state<any[] | null>(null);
	let nativeChartData = $state<any[] | null>(null);
	let nativeStaffPerformance = $state<any[] | null>(null);
	let nativeTopCustomers = $state<any[] | null>(null);

	$effect(() => {
		if (!isNative || !powersync.ready) return;
		powersync.dataVersion;

		const startDate = data.startDate;
		const endDate = data.endDate;
		const chartGrouping = data.chartGrouping;

		nativeSummaries = null;
		nativeTopProducts = null;
		nativeCategoryBreakdown = null;
		nativePaymentBreakdown = null;
		nativeRefundSummary = null;
		nativeExpenseBreakdown = null;
		nativeStockUpdates = null;
		nativeChartData = null;
		nativeStaffPerformance = null;
		nativeTopCustomers = null;

		const startIso = `${startDate} 00:00:00+00`;
		const endIso = `${endDate} 23:59:59+00`;

		// Summaries
		Promise.all([
			powersync.db.get(
				`SELECT count(*) as count, coalesce(sum(total_amount), 0) as total, coalesce(avg(total_amount), 0) as avg_order, coalesce(sum(discount_amount), 0) as total_discount FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at <= ?`,
				[startIso, endIso]
			),
			powersync.db.get(
				`SELECT coalesce(sum(amount), 0) as total FROM cashbook WHERE type = 'out' AND category = 'expense' AND created_at >= ? AND created_at <= ?`,
				[startIso, endIso]
			),
			powersync.db.get(
				`SELECT coalesce(sum(oi.quantity), 0) as total_qty, coalesce(sum(oi.cost_at_sale * oi.quantity), 0) as total_cost FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id WHERE o.status = 'completed' AND oi.status = 'completed' AND o.created_at >= ? AND o.created_at <= ?`,
				[startIso, endIso]
			),
			powersync.db.get(
				`SELECT coalesce(sum(coalesce(nullif(pv.cost_price, 0), p.cost_price, 0) * pv.stock_quantity), 0) as total_cost, coalesce(sum(pv.price * pv.stock_quantity), 0) as total_retail FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id`,
				[]
			),
			powersync.db.get(
				`SELECT coalesce(sum(change_amount), 0) as total_stocked FROM stock_logs WHERE change_amount > 0 AND created_at >= ? AND created_at <= ?`,
				[startIso, endIso]
			)
		]).then(([sales, expenses, items, inventory, stockSum]) => {
			const s = sales as any;
			const e = expenses as any;
			const i = items as any;
			const inv = inventory as any;
			const grossProfit = (s?.total ?? 0) - (i?.total_cost ?? 0);
			nativeSummaries = {
				salesSummary: {
					count: s?.count ?? 0,
					total: s?.total ?? 0,
					avgOrder: s?.avg_order ?? 0,
					totalDiscount: s?.total_discount ?? 0
				},
				expenseSummary: { total: e?.total ?? 0 },
				itemsSold: i?.total_qty ?? 0,
				grossProfit,
				netProfit: grossProfit - (e?.total ?? 0),
				inventoryRetailValue: inv?.total_retail ?? 0,
				inventoryCostValue: inv?.total_cost ?? 0,
				totalStocked: (stockSum as any)?.total_stocked ?? 0
			};
		});

		// Top products
		powersync.db
			.getAll(
				`SELECT p.id as product_id, oi.product_name, sum(oi.quantity) as total_qty, sum(oi.price_at_sale * oi.quantity * (1 - oi.discount / 100)) as total_revenue FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id LEFT JOIN product_variants pv ON oi.variant_id = pv.id LEFT JOIN products p ON pv.product_id = p.id WHERE oi.status = 'completed' AND o.created_at >= ? AND o.created_at <= ? GROUP BY oi.product_name, p.id ORDER BY total_qty DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeTopProducts = (res as any[]).map((r: any) => ({
					productId: r.product_id,
					productName: r.product_name,
					totalQty: r.total_qty,
					totalRevenue: r.total_revenue
				}));
			});

		// Category breakdown
		powersync.db
			.getAll(
				`SELECT coalesce(p.category, 'Unknown') as category, sum(oi.quantity) as total_qty, sum(oi.price_at_sale * oi.quantity * (1 - oi.discount / 100)) as total_revenue FROM order_items oi INNER JOIN orders o ON oi.order_id = o.id LEFT JOIN product_variants pv ON oi.variant_id = pv.id LEFT JOIN products p ON pv.product_id = p.id WHERE o.status = 'completed' AND oi.status = 'completed' AND o.created_at >= ? AND o.created_at <= ? GROUP BY p.category ORDER BY total_revenue DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeCategoryBreakdown = (res as any[]).map((r: any) => ({
					category: r.category,
					totalQty: r.total_qty,
					totalRevenue: r.total_revenue
				}));
			});

		// Payment breakdown
		Promise.all([
			powersync.db.get(
				`SELECT 'cash' as method, count(*) as count, coalesce(sum(coalesce(cash_amount, CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at <= ? AND (coalesce(cash_amount, 0) > 0 OR payment_method = 'cash')`,
				[startIso, endIso]
			),
			powersync.db.get(
				`SELECT 'card' as method, count(*) as count, coalesce(sum(coalesce(card_amount, CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at <= ? AND (coalesce(card_amount, 0) > 0 OR payment_method = 'card')`,
				[startIso, endIso]
			),
			powersync.db.get(
				`SELECT 'mobile' as method, count(*) as count, coalesce(sum(coalesce(mobile_amount, CASE WHEN payment_method = 'mobile' THEN total_amount ELSE 0 END)), 0) as total FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at <= ? AND (coalesce(mobile_amount, 0) > 0 OR payment_method = 'mobile')`,
				[startIso, endIso]
			)
		]).then(([cash, card, mobile]) => {
			nativePaymentBreakdown = [cash, card, mobile].filter(Boolean) as any[];
		});

		// Refund summary
		powersync.db
			.getAll(
				`SELECT status, count(*) as count, coalesce(sum(total_amount), 0) as total FROM orders WHERE status IN ('refunded', 'void') AND created_at >= ? AND created_at <= ? GROUP BY status`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeRefundSummary = res as any[];
			});

		// Expense breakdown
		powersync.db
			.getAll(
				`SELECT description, coalesce(sum(amount), 0) as total, count(*) as count FROM cashbook WHERE type = 'out' AND created_at >= ? AND created_at <= ? GROUP BY description ORDER BY total DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeExpenseBreakdown = res as any[];
			});

		// Stock updates
		powersync.db
			.getAll(
				`SELECT sl.id, p.id as product_id, p.name as product_name, pv.size, sl.change_amount, sl.reason, u.name as user_name, sl.created_at FROM stock_logs sl INNER JOIN product_variants pv ON sl.variant_id = pv.id INNER JOIN products p ON pv.product_id = p.id INNER JOIN users u ON sl.user_id = u.id WHERE sl.reason != 'sale' AND sl.created_at >= ? AND sl.created_at <= ? ORDER BY sl.created_at DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeStockUpdates = (res as any[]).map((r: any) => ({
					id: r.id,
					productId: r.product_id,
					productName: r.product_name,
					size: r.size,
					changeAmount: r.change_amount,
					reason: r.reason,
					userName: r.user_name,
					createdAt: r.created_at
				}));
			});

		// Staff performance
		powersync.db
			.getAll(
				`SELECT u.id as user_id, u.name as cashier_name, count(*) as order_count, coalesce(sum(o.total_amount), 0) as total_sales, coalesce(avg(o.total_amount), 0) as avg_order FROM orders o INNER JOIN users u ON o.user_id = u.id WHERE o.status = 'completed' AND o.created_at >= ? AND o.created_at <= ? GROUP BY u.id ORDER BY total_sales DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeStaffPerformance = (res as any[]).map((r: any) => ({
					cashierName: r.cashier_name,
					orderCount: r.order_count,
					totalSales: r.total_sales,
					avgOrder: r.avg_order
				}));
			});

		// Top customers
		powersync.db
			.getAll(
				`SELECT c.id as customer_id, c.name as customer_name, c.phone as customer_phone, count(*) as order_count, coalesce(sum(o.total_amount), 0) as total_spent FROM orders o INNER JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed' AND o.created_at >= ? AND o.created_at <= ? GROUP BY c.id ORDER BY total_spent DESC LIMIT 10`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeTopCustomers = (res as any[]).map((r: any) => ({
					customerName: r.customer_name,
					customerPhone: r.customer_phone,
					orderCount: r.order_count,
					totalSpent: r.total_spent
				}));
			});

		// Chart data
		const groupingFmt: Record<string, string> = {
			hour: "strftime('%Y-%m-%d %H', created_at)",
			day: "strftime('%Y-%m-%d', created_at)",
			month: "strftime('%Y-%m', created_at)",
			year: "strftime('%Y', created_at)"
		};
		const chartExpr = groupingFmt[chartGrouping] ?? groupingFmt.day;
		powersync.db
			.getAll(
				`SELECT ${chartExpr} as date, coalesce(sum(total_amount), 0) as amount, count(*) as count FROM orders WHERE status = 'completed' AND created_at >= ? AND created_at <= ? GROUP BY ${chartExpr} ORDER BY date`,
				[startIso, endIso]
			)
			.then((res: any) => {
				nativeChartData = res as any[];
			});
	});

	// Effective data: native (PowerSync SQLite) in Electron, server (PostgreSQL) on web
	const effectiveSummaries = $derived(
		isNative
			? nativeSummaries !== null
				? Promise.resolve(nativeSummaries)
				: new Promise<any>(() => {})
			: data.summaries
	);
	const effectiveTopProducts = $derived(
		isNative
			? nativeTopProducts !== null
				? Promise.resolve(nativeTopProducts)
				: new Promise<any>(() => {})
			: data.topProducts
	);
	const effectiveCategoryBreakdown = $derived(
		isNative
			? nativeCategoryBreakdown !== null
				? Promise.resolve(nativeCategoryBreakdown)
				: new Promise<any>(() => {})
			: data.categoryBreakdown
	);
	const effectivePaymentBreakdown = $derived(
		isNative
			? nativePaymentBreakdown !== null
				? Promise.resolve(nativePaymentBreakdown)
				: new Promise<any>(() => {})
			: data.paymentBreakdown
	);
	const effectiveRefundSummary = $derived(
		isNative
			? nativeRefundSummary !== null
				? Promise.resolve(nativeRefundSummary)
				: new Promise<any>(() => {})
			: data.refundSummary
	);
	const effectiveExpenseBreakdown = $derived(
		isNative
			? nativeExpenseBreakdown !== null
				? Promise.resolve(nativeExpenseBreakdown)
				: new Promise<any>(() => {})
			: data.expenseBreakdown
	);
	const effectiveStockUpdates = $derived(
		isNative
			? nativeStockUpdates !== null
				? Promise.resolve(nativeStockUpdates)
				: new Promise<any>(() => {})
			: data.stockUpdates
	);
	const effectiveChartData = $derived(
		isNative
			? nativeChartData !== null
				? Promise.resolve(nativeChartData)
				: new Promise<any>(() => {})
			: data.chartData
	);
	const effectiveStaffPerformance = $derived(
		isNative
			? nativeStaffPerformance !== null
				? Promise.resolve(nativeStaffPerformance)
				: new Promise<any>(() => {})
			: data.staffPerformance
	);
	const effectiveTopCustomers = $derived(
		isNative
			? nativeTopCustomers !== null
				? Promise.resolve(nativeTopCustomers)
				: new Promise<any>(() => {})
			: data.topCustomers
	);

	let chartCanvas = $state<HTMLCanvasElement | null>(null);
	let chartInstance: Chart | null = null;
	let windowWidth = $state(typeof window !== 'undefined' ? window.innerWidth : 1024);


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
		const isMobile = window.innerWidth < 640;
		const dataPoints = chartData.length;

		// Use line chart on mobile when there are many data points (e.g. 30 days)
		const useLineChart = isMobile && dataPoints > 6;

		chartInstance = new Chart(ctx, {
			type: useLineChart ? 'line' : 'bar',
			data: {
				labels: chartData.map((d: any) => d.date),
				datasets: [
					{
						label: 'Revenue',
						data: chartData.map((d: any) => Number(d.amount)),
						...(useLineChart
							? {
									borderColor: primaryColor,
									backgroundColor: primaryColor + '20',
									fill: true,
									tension: 0.3,
									pointRadius: dataPoints > 20 ? 0 : 3,
									pointHitRadius: 10,
									borderWidth: 2
								}
							: {
									backgroundColor: primaryColor,
									borderRadius: isMobile ? 2 : 4,
									borderSkipped: false,
									maxBarThickness: isMobile ? 20 : 40
								})
					}
				]
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: useLineChart ? { mode: 'index', intersect: false } : undefined,
				plugins: {
					legend: { display: false },
					tooltip: {
						backgroundColor: popoverBg,
						titleColor: popoverFg,
						bodyColor: popoverFg,
						borderColor: gridColor,
						borderWidth: 1,
						padding: isMobile ? 8 : 12,
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
							font: { size: isMobile ? 8 : 10 },
							maxRotation: isMobile && dataPoints > 10 ? 45 : 0,
							autoSkip: true,
							maxTicksLimit: isMobile ? 5 : data.chartGrouping === 'hour' ? 12 : 15
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
							font: { size: isMobile ? 8 : 10 },
							maxTicksLimit: isMobile ? 5 : 8,
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
		const onResize = () => { windowWidth = window.innerWidth; };
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	$effect(() => {
		// Re-run when chart data, canvas, or viewport width changes
		const canvas = chartCanvas;
		const _w = windowWidth; // track width so chart type updates on resize
		effectiveChartData.then((cd: any[]) => {
			if (canvas && cd && cd.length > 0) {
				requestAnimationFrame(() => updateChart(cd));
			}
		});
		return () => {
			if (chartInstance) {
				chartInstance.destroy();
				chartInstance = null;
			}
		};
	});

	// "View all" detail dialogs — shared state per type
	type DetailType = 'expenses' | 'products' | 'customers' | 'inventory';
	let detailDialog = $state<{ open: boolean; type: DetailType; title: string; items: any[]; loading: boolean }>({
		open: false, type: 'expenses', title: '', items: [], loading: false
	});

	async function openDetailDialog(type: DetailType, title: string) {
		detailDialog = { open: true, type, title, items: [], loading: true };
		try {
			const res = await fetch(`/api/reports/details?type=${type}&from=${data.startDate}&to=${data.endDate}&page=1`);
			detailDialog.items = (await res.json()) || [];
		} finally {
			detailDialog.loading = false;
		}
	}

	const categoryBarColors = [
		'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500',
		'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500',
		'bg-teal-500', 'bg-pink-500', 'bg-lime-500', 'bg-fuchsia-500'
	];

	async function handleExportPDF() {
		const [
			summaries,
			paymentBreakdown,
			categoryBreakdown,
			topProducts,
			expenseBreakdown,
			refundSummary,
			staffPerformance,
			topCustomers
		] = await Promise.all([
			effectiveSummaries,
			effectivePaymentBreakdown,
			effectiveCategoryBreakdown,
			effectiveTopProducts,
			effectiveExpenseBreakdown,
			effectiveRefundSummary,
			effectiveStaffPerformance,
			effectiveTopCustomers
		]);

		const fmtPdf = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
		exportReportPDF({
			storeName: data.storeName,
			periodLabel,
			dateRange: `${fmtPdf(data.startDate)} to ${fmtPdf(data.endDate)}`,
			summaries,
			paymentBreakdown: paymentBreakdown as any[],
			categoryBreakdown: categoryBreakdown as any[],
			topProducts: topProducts as any[],
			expenseBreakdown: expenseBreakdown as any[],
			refundSummary: refundSummary as any[],
			staffPerformance: staffPerformance as any[],
			topCustomers: (topCustomers as any[])?.map((c: any) => ({
				customerName: c.customerName,
				orderCount: c.orderCount,
				totalSpent: c.totalSpent
			}))
		});
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

<div class="space-y-5 overflow-x-hidden p-3 pb-20 sm:p-4 md:p-6">
	<!-- Header -->
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			<h1 class="text-xl font-bold tracking-tight sm:text-2xl">Reports</h1>
			<p class="text-xs text-muted-foreground sm:text-sm">
				{periodLabel} &middot; {formatDate(data.startDate)} to {formatDate(data.endDate)}
			</p>
		</div>
		<Button variant="outline" size="sm" onclick={handleExportPDF} class="shrink-0 cursor-pointer">
			<FileText class="mr-2 h-4 w-4" /> Export PDF
		</Button>
	</div>

	<!-- Period Selector -->
	<div
		class="sm:sticky sm:top-0 sm:z-20 space-y-3 rounded-lg border bg-card p-3 shadow-sm sm:p-4"
	>
		<div class="flex flex-wrap gap-1.5">
			{#each periods as p}
				<Button
					variant={data.period === p.value ? 'default' : 'ghost'}
					size="sm"
					class="cursor-pointer text-xs"
					onclick={() => selectPeriod(p.value)}
				>
					{p.label}
				</Button>
			{/each}
		</div>

		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<div class="grid flex-1 grid-cols-2 gap-2">
				<div class="min-w-0 space-y-1">
					<Label for="from" class="text-[11px] font-semibold text-muted-foreground">From</Label>
					<DatePicker id="from" bind:value={customFrom} class="w-full" />
				</div>
				<div class="min-w-0 space-y-1">
					<Label for="to" class="text-[11px] font-semibold text-muted-foreground">To</Label>
					<DatePicker id="to" bind:value={customTo} class="w-full" />
				</div>
			</div>
			<Button
				size="sm"
				onclick={applyCustomRange}
				class="w-full cursor-pointer text-xs sm:w-auto">Apply</Button
			>
		</div>
	</div>

	<!-- ==================== SALES OVERVIEW ==================== -->
	<div>
		<h2
			class="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:text-sm"
		>
			Sales Overview
		</h2>
		<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 md:grid-cols-3 2xl:grid-cols-6">
			{#await effectiveSummaries}
				{#each Array(6) as _}
					<div class="space-y-3 rounded-lg border bg-card p-3 sm:p-4">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-8 w-full" />
						<Skeleton class="h-3 w-16" />
					</div>
				{/each}
			{:then summaries}
				<div class="rounded-lg border bg-card p-3 sm:p-4">
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

				<div class="rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Items Sold</span>
						<div class="hidden rounded-md bg-indigo-500/10 p-1.5 sm:block">
							<ShoppingBag class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl">
						{summaries.itemsSold}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Avg {formatCurrency(summaries.salesSummary.avgOrder)}/order
					</p>
				</div>

				<div class="rounded-lg border bg-card p-3 sm:p-4">
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
						class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl {summaries.grossProfit >=
						0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(summaries.grossProfit)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						Revenue - COGS
						{#if summaries.salesSummary.total > 0}
							&middot; <span class="font-semibold"
								>{pct(summaries.grossProfit, summaries.salesSummary.total)}% margin</span
							>
						{/if}
					</p>
				</div>

				<div class="rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Net Profit</span>
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
						class="mt-1.5 text-lg font-bold break-all sm:mt-2 sm:text-2xl {(summaries.netProfit ??
							0) >= 0
							? 'text-emerald-600'
							: 'text-red-600'}"
					>
						{formatCurrency(summaries.netProfit ?? 0)}
					</div>
					<p class="mt-0.5 text-[10px] text-muted-foreground sm:mt-1 sm:text-xs">
						After expenses
						{#if summaries.salesSummary.total > 0}
							&middot; <span class="font-semibold"
								>{pct(summaries.netProfit ?? 0, summaries.salesSummary.total)}% of revenue</span
							>
						{/if}
					</p>
				</div>

				<div class="rounded-lg border bg-card p-3 sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[11px] font-medium text-muted-foreground sm:text-xs">Discounts</span>
						<div class="hidden rounded-md bg-amber-500/10 p-1.5 sm:block">
							<Percent class="h-3.5 w-3.5 text-amber-600" />
						</div>
					</div>
					<div class="mt-1.5 text-lg font-bold break-all text-amber-600 sm:mt-2 sm:text-2xl">
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
			{#await effectiveChartData}
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
				{#await Promise.all([effectiveSummaries, effectivePaymentBreakdown])}
					{#each Array(3) as _}
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
					{#if totalSales > 0}
						<div class="space-y-4">
							{#each ['cash', 'card', 'mobile'] as method}
								{@const mData = paymentMap.get(method) as any}
								<div class="space-y-1.5">
									<div class="flex items-center justify-between text-xs sm:text-sm">
										<div class="flex items-center gap-2">
											<div
												class="h-2.5 w-2.5 rounded-full {method === 'cash'
													? 'bg-emerald-500'
													: method === 'card'
														? 'bg-blue-500'
														: 'bg-rose-500'}"
											></div>
											<span class="font-medium capitalize">{method}</span>
										</div>
										<span class="font-bold tabular-nums">{formatCurrency(mData?.total ?? 0)}</span>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
										<div
											class="h-full {method === 'cash'
												? 'bg-emerald-500'
												: method === 'card'
													? 'bg-blue-500'
													: 'bg-rose-500'}"
											style="width: {pct(mData?.total ?? 0, totalSales)}%"
										></div>
									</div>
									<p class="text-[10px] text-muted-foreground">
										{mData?.count ?? 0}
										{method === 'cash' ? 'receipts' : 'transactions'} &middot; {pct(
											mData?.total ?? 0,
											totalSales
										)}%
									</p>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<div class="mb-3 rounded-full bg-muted p-3">
								<DollarSign class="h-6 w-6 text-muted-foreground/50" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No sales in this period</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<div class="flex items-center justify-between">
					<Card.Title class="text-sm sm:text-base">Expenses</Card.Title>
					{#await effectiveSummaries}
						<Skeleton class="h-6 w-20" />
					{:then summaries}
						<span class="text-base font-bold text-orange-600 sm:text-lg">
							{formatCurrency(summaries.expenseSummary.total)}
						</span>
					{/await}
				</div>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#await effectiveExpenseBreakdown}
					<div class="space-y-4">
						{#each Array(3) as _}<Skeleton class="h-4 w-full" />{/each}
					</div>
				{:then expenseBreakdown}
					{#if expenseBreakdown && (expenseBreakdown as any[]).length > 0}
						{@const items = expenseBreakdown as any[]}
						{@const maxExpense = Math.max(...items.map((e: any) => Number(e.total)), 1)}
						<div class="space-y-3">
							{#each items as exp}
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
											style="width: {(Number(exp.total) / maxExpense) * 100}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
						{#if items.length >= 5}
							<button
								onclick={() => openDetailDialog('expenses', 'All Expenses')}
								class="mt-3 w-full cursor-pointer rounded-md py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-muted active:scale-[0.98]"
							>
								View all expenses
							</button>
						{/if}
					{:else}
						<div class="flex flex-col items-center justify-center py-8 text-center">
							<div class="mb-2 rounded-full bg-muted p-3">
								<DollarSign class="h-5 w-5 text-muted-foreground/40" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No expenses recorded</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="text-sm sm:text-base">Refunds & Voids</Card.Title>
			</Card.Header>
			<Card.Content class="px-3 sm:px-6">
				{#await effectiveRefundSummary}
					<div class="grid grid-cols-2 gap-2">
						<Skeleton class="h-16 w-full" />
						<Skeleton class="h-16 w-full" />
					</div>
				{:then refundSummary}
					{@const totalRefunds = !refundSummary
						? 0
						: (refundSummary as any[]).reduce((s: number, r: any) => s + Number(r.total), 0)}
					{@const totalRefundCount = !refundSummary
						? 0
						: (refundSummary as any[]).reduce((s: number, r: any) => s + Number(r.count), 0)}
					{#if totalRefundCount > 0}
						<div class="space-y-3">
							<div class="grid grid-cols-2 gap-2">
								<div class="rounded bg-red-500/5 p-2 text-center">
									<div class="text-lg font-bold text-red-600">
										{totalRefundCount}
									</div>
									<p class="text-[10px] text-muted-foreground">Returns</p>
								</div>
								<div class="rounded bg-red-500/5 p-2 text-center">
									<div class="text-lg font-bold text-red-600">
										{formatCurrency(totalRefunds)}
									</div>
									<p class="text-[10px] text-muted-foreground">Lost</p>
								</div>
							</div>
							<Separator />
							{#each refundSummary as r}
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

	<!-- ==================== STAFF & CUSTOMERS ==================== -->
	<div class="grid gap-4 lg:grid-cols-2">
		<Card.Root class="pb-0">
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="flex items-center gap-2 text-sm">
					<UserCheck class="h-4 w-4 text-muted-foreground" /> Staff Performance
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				{#await effectiveStaffPerformance}
					<div class="space-y-3 p-4">
						{#each Array(3) as _}<Skeleton class="h-6 w-full" />{/each}
					</div>
				{:then staffPerformance}
					{#if staffPerformance && (staffPerformance as any[]).length > 0}
						<Table.Root>
							<Table.Header>
								<Table.Row class="text-xs">
									<Table.Head class="pl-6">Cashier</Table.Head>
									<Table.Head class="text-right">Orders</Table.Head>
									<Table.Head class="text-right">Sales</Table.Head>
									<Table.Head class="pr-6 text-right">Avg</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each staffPerformance as any[] as staff}
									<Table.Row class="text-sm">
										<Table.Cell class="pl-6 font-medium">{staff.cashierName}</Table.Cell>
										<Table.Cell class="text-right">{staff.orderCount}</Table.Cell>
										<Table.Cell class="text-right font-semibold break-all"
											>{formatCurrency(staff.totalSales)}</Table.Cell
										>
										<Table.Cell class="pr-6 text-right text-xs text-muted-foreground"
											>{formatCurrency(staff.avgOrder)}</Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{:else}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-2 rounded-full bg-muted p-3">
								<UserCheck class="h-5 w-5 text-muted-foreground/40" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No sales by staff yet</p>
							<p class="mt-1 text-xs text-muted-foreground/60">Staff performance will show here</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root class="pb-0">
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="flex items-center gap-2 text-sm">
					<Users class="h-4 w-4 text-muted-foreground" /> Top Customers
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				{#await effectiveTopCustomers}
					<div class="space-y-3 p-4">
						{#each Array(3) as _}<Skeleton class="h-6 w-full" />{/each}
					</div>
				{:then topCustomers}
					{#if topCustomers && (topCustomers as any[]).length > 0}
						<Table.Root>
							<Table.Header>
								<Table.Row class="text-xs">
									<Table.Head class="pl-6">Customer</Table.Head>
									<Table.Head class="text-right">Orders</Table.Head>
									<Table.Head class="pr-6 text-right">Spent</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each topCustomers as any[] as cust}
									<Table.Row class="text-sm">
										<Table.Cell class="pl-6">
											<div class="font-medium">{cust.customerName}</div>
											{#if cust.customerPhone}
												<div class="text-[10px] text-muted-foreground">
													{cust.customerPhone}
												</div>
											{/if}
										</Table.Cell>
										<Table.Cell class="text-right">{cust.orderCount}</Table.Cell>
										<Table.Cell class="pr-6 text-right font-semibold break-all"
											>{formatCurrency(cust.totalSpent)}</Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
						{#if (topCustomers as any[]).length >= 5}
							<button
								onclick={() => openDetailDialog('customers', 'All Customers')}
								class="w-full cursor-pointer border-t py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted active:bg-muted"
							>
								View all customers
							</button>
						{/if}
					{:else}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-2 rounded-full bg-muted p-3">
								<Users class="h-5 w-5 text-muted-foreground/40" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No customer data yet</p>
							<p class="mt-1 text-xs text-muted-foreground/60">Customers will appear as orders are placed</p>
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
				{#await effectiveCategoryBreakdown}
					<div class="space-y-3">
						{#each Array(5) as _}<Skeleton class="h-6 w-full" />{/each}
					</div>
				{:then categoryBreakdown}
					{@const sorted = !categoryBreakdown ? [] : (categoryBreakdown as any[])
						.filter((c: any) => Number(c.totalRevenue) > 0)
						.sort((a: any, b: any) => Number(b.totalRevenue) - Number(a.totalRevenue))}
					{@const maxRev = sorted.length > 0 ? Number(sorted[0].totalRevenue) : 1}
					{@const totalRev = sorted.reduce((s: number, c: any) => s + Number(c.totalRevenue), 0)}
					{#if sorted.length > 0}
						<div class="space-y-2.5">
							{#each sorted as cat, i}
								{@const rev = Number(cat.totalRevenue)}
								{@const pctVal = totalRev > 0 ? Math.round((rev / totalRev) * 100) : 0}
								<div class="group">
									<div class="mb-1 flex items-baseline justify-between gap-2">
										<span class="text-xs font-medium">{cat.category}</span>
										<div class="flex items-baseline gap-1.5">
											<span class="text-[10px] tabular-nums text-muted-foreground">{pctVal}%</span>
											<span class="text-xs font-bold tabular-nums">{formatCurrency(rev)}</span>
										</div>
									</div>
									<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
										<div
											class="h-full rounded-full transition-all duration-500 {categoryBarColors[i % categoryBarColors.length]}"
											style="width: {(rev / maxRev) * 100}%"
										></div>
									</div>
								</div>
							{/each}
						</div>
					{:else}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-2 rounded-full bg-muted p-3">
								<Layers class="h-5 w-5 text-muted-foreground/40" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No category data</p>
							<p class="mt-1 text-xs text-muted-foreground/60">Sales will be grouped by category here</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>

		<Card.Root>
			<Card.Header class="px-3 pb-3 sm:px-6">
				<Card.Title class="flex items-center gap-2 text-sm">
					<TrendingUp class="h-4 w-4 text-muted-foreground" /> Top Selling Products
				</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				{#await effectiveTopProducts}
					<div class="space-y-3 p-4">
						{#each Array(5) as _}<Skeleton class="h-6 w-full" />{/each}
					</div>
				{:then topProducts}
					{#if topProducts && (topProducts as any[]).length > 0}
						<Table.Root>
							<Table.Header
								><Table.Row class="text-xs">
									<Table.Head class="pl-6">Product</Table.Head>
									<Table.Head class="text-right">Qty</Table.Head>
									<Table.Head class="pr-6 text-right">Revenue</Table.Head>
								</Table.Row></Table.Header
							>
							<Table.Body>
								{#each topProducts as any[] as p}
									<Table.Row
										class="cursor-pointer text-sm hover:bg-muted/50"
										onclick={() => goto(`/inventory/${p.productId}`)}
									>
										<Table.Cell class="pl-6 font-medium">{p.productName}</Table.Cell>
										<Table.Cell class="text-right">{p.totalQty}</Table.Cell>
										<Table.Cell class="pr-6 text-right font-semibold break-all"
											>{formatCurrency(p.totalRevenue)}</Table.Cell
										>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
						{#if (topProducts as any[]).length >= 5}
							<button
								onclick={() => openDetailDialog('products', 'All Products')}
								class="w-full cursor-pointer border-t py-2.5 text-center text-xs font-medium text-primary transition-colors hover:bg-muted active:bg-muted"
							>
								View all products
							</button>
						{/if}
					{:else}
						<div class="flex flex-col items-center justify-center py-10 text-center">
							<div class="mb-2 rounded-full bg-muted p-3">
								<Package class="h-5 w-5 text-muted-foreground/40" />
							</div>
							<p class="text-sm font-medium text-muted-foreground">No products sold yet</p>
							<p class="mt-1 text-xs text-muted-foreground/60">Top sellers will appear here</p>
						</div>
					{/if}
				{/await}
			</Card.Content>
		</Card.Root>
	</div>
</div>

<!-- Detail "View All" Dialog -->
<Dialog.Root bind:open={detailDialog.open}>
	<Dialog.Content class="max-h-[80vh] sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{detailDialog.title}</Dialog.Title>
			<Dialog.Description class="text-xs text-muted-foreground">
				{data.startDate} to {data.endDate}
			</Dialog.Description>
		</Dialog.Header>
		<div class="max-h-[55vh] overflow-y-auto">
			{#if detailDialog.loading}
				<div class="space-y-3 p-2">
					{#each Array(5) as _}<Skeleton class="h-6 w-full" />{/each}
				</div>
			{:else if detailDialog.items.length > 0}
				{#if detailDialog.type === 'expenses'}
					{@const maxVal = Math.max(...detailDialog.items.map((e) => Number(e.total)), 1)}
					{@const totalVal = detailDialog.items.reduce((s: number, e: any) => s + Number(e.total), 0)}
					<div class="space-y-3 p-1">
						{#each detailDialog.items as item, i}
							<div class="space-y-1">
								<div class="flex items-center justify-between gap-3 text-sm">
									<div class="flex items-center gap-2 min-w-0">
										<span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">{i + 1}</span>
										<span class="truncate font-medium">{item.description}</span>
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<span class="text-[10px] tabular-nums text-muted-foreground">{item.count}x</span>
										<span class="font-bold tabular-nums">{formatCurrency(item.total)}</span>
									</div>
								</div>
								<div class="ml-7 h-1.5 w-auto overflow-hidden rounded-full bg-muted">
									<div class="h-full bg-orange-500/70" style="width: {(Number(item.total) / maxVal) * 100}%"></div>
								</div>
							</div>
						{/each}
						<Separator />
						<div class="flex items-center justify-between px-1 text-sm font-bold">
							<span>Total</span>
							<span class="text-orange-600">{formatCurrency(totalVal)}</span>
						</div>
					</div>
				{:else if detailDialog.type === 'products'}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="pl-4">#</Table.Head>
								<Table.Head>Product</Table.Head>
								<Table.Head class="text-right">Qty</Table.Head>
								<Table.Head class="pr-4 text-right">Revenue</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each detailDialog.items as item, i}
								<Table.Row>
									<Table.Cell class="pl-4 text-muted-foreground">{i + 1}</Table.Cell>
									<Table.Cell class="font-medium">{item.productName}</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{Number(item.totalQty)}</Table.Cell>
									<Table.Cell class="pr-4 text-right font-bold tabular-nums">{formatCurrency(item.totalRevenue)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{:else if detailDialog.type === 'customers'}
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="pl-4">Customer</Table.Head>
								<Table.Head class="text-right">Orders</Table.Head>
								<Table.Head class="pr-4 text-right">Spent</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each detailDialog.items as item}
								<Table.Row>
									<Table.Cell class="pl-4">
										<div class="font-medium">{item.customerName}</div>
										{#if item.customerPhone}
											<div class="text-[10px] text-muted-foreground">{item.customerPhone}</div>
										{/if}
									</Table.Cell>
									<Table.Cell class="text-right tabular-nums">{Number(item.orderCount)}</Table.Cell>
									<Table.Cell class="pr-4 text-right font-bold tabular-nums">{formatCurrency(item.totalSpent)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				{/if}
			{:else}
				<p class="py-8 text-center text-sm text-muted-foreground">No data found</p>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
