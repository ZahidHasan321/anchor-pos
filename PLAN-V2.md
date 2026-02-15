# Clothing POS v2 — Improvement & Enhancement Plan

> **Context:** All 5 original phases are complete. This plan addresses 7 specific issues and adds new features. Each phase below is self-contained. Run `pnpm check` after EVERY phase.

**CRITICAL: Re-read the Global Rules in PLAN.md before starting. Svelte 5 runes only, `.svelte.ts` for reactive stores, no `export let`, no `async` in `db.transaction()` callbacks.**

---

## Progress Tracker

- [ ] **Phase 6:** Add Variants to Existing Products
- [ ] **Phase 7:** Free-text Stock Adjustment Reason
- [ ] **Phase 8:** Comprehensive Reports Page (Monthly / Yearly / All-Time)
- [ ] **Phase 9:** Collapsible Sticky Sidebar
- [ ] **Phase 10:** Material Color Redesign
- [ ] **Phase 11:** POS Page Redesign
- [ ] **Phase 12:** POS Customer Search by Phone
- [ ] **Phase 13:** Polish & Final Touches

---

## Phase 6: Add Variants to Existing Products

### Problem

Currently you can only create variants when creating a new product. There's no way to add more size/color variants to an existing product.

### Step 6.1: Add `addVariant` Action to Product Detail Page

**File:** `src/routes/(app)/inventory/[id]/+page.server.ts`

Add a new action called `addVariant` alongside the existing `adjustStock` and `deleteProduct` actions:

```typescript
// Add this action inside the existing `actions` object, after the adjustStock action:

addVariant: async ({ request, params, locals }) => {
  if (!locals.user || locals.user.role === 'sales') {
    return fail(403, { variantError: 'Unauthorized' });
  }

  const data = await request.formData();
  const size = (data.get('size') as string)?.trim();
  const color = (data.get('color') as string)?.trim() || null;
  const priceOverride = data.get('priceOverride') ? parseFloat(data.get('priceOverride') as string) : null;
  const initialStock = parseInt(data.get('initialStock') as string) || 0;

  if (!size) {
    return fail(400, { variantError: 'Size is required' });
  }

  // Get the product for barcode generation
  const product = db.select().from(products).where(eq(products.id, params.id)).get();
  if (!product) {
    return fail(404, { variantError: 'Product not found' });
  }

  const variantId = generateId();
  const shortId = params.id.substring(0, 4).toUpperCase();
  const catPrefix = product.category.substring(0, 3).toUpperCase();
  const barcode = `${catPrefix}-${shortId}-${size}${color ? '-' + color.substring(0, 3).toUpperCase() : ''}`;

  // Check for duplicate barcode
  const existing = db.select().from(productVariants).where(eq(productVariants.barcode, barcode)).get();
  if (existing) {
    return fail(400, { variantError: `A variant with barcode "${barcode}" already exists` });
  }

  try {
    db.transaction((tx) => {
      tx.insert(productVariants).values({
        id: variantId,
        productId: params.id,
        size,
        color,
        barcode,
        stockQuantity: initialStock,
        priceOverride
      }).run();

      if (initialStock > 0) {
        tx.insert(stockLogs).values({
          id: generateId(),
          variantId,
          changeAmount: initialStock,
          reason: 'Initial stock',
          userId: locals.user!.id,
          createdAt: new Date()
        }).run();
      }
    });

    logAuditEvent({
      userId: locals.user.id,
      userName: locals.user.name,
      action: 'ADD_VARIANT',
      entity: 'product_variant',
      entityId: variantId,
      details: `Added variant ${size}${color ? ' / ' + color : ''} to product ${product.name}`
    });
  } catch (e) {
    console.error('Failed to add variant:', e);
    return fail(500, { variantError: 'Database error' });
  }

  return { variantSuccess: true };
},
```

**IMPORTANT:** You also need to add `products` to the imports at the top of this file. Currently it only imports `products, productVariants, stockLogs`. Make sure `products` is there (it already is — verify).

### Step 6.2: Add "Add Variant" Dialog UI to Product Detail Page

**File:** `src/routes/(app)/inventory/[id]/+page.svelte`

Add a new state variable and dialog. Insert these changes:

**1. Add new state variables** (after the existing state variables around line 20):

```typescript
let variantDialogOpen = $state(false);
let newVariantSize = $state('');
let newVariantColor = $state('');
let newVariantPriceOverride = $state('');
let newVariantInitialStock = $state(0);
```

**2. Add $effect handler for variant success** (inside the existing `$effect` block, or add a new one after it):

```typescript
$effect(() => {
	if (form?.variantSuccess) {
		toast.success('Variant added successfully');
		variantDialogOpen = false;
		newVariantSize = '';
		newVariantColor = '';
		newVariantPriceOverride = '';
		newVariantInitialStock = 0;
	}
	if (form?.variantError) {
		toast.error(form.variantError);
	}
});
```

**3. Add an "Add Variant" button** next to the existing "Adjust Stock" button in the Card.Footer (around line 121):

Replace the current `<Card.Footer>`:

```svelte
<Card.Footer class="flex gap-2">
	<Button onclick={() => (stockDialogOpen = true)} class="flex-1 cursor-pointer">
		<Plus class="mr-2 h-4 w-4" /> Adjust Stock
	</Button>
	<Button
		variant="outline"
		onclick={() => (variantDialogOpen = true)}
		class="flex-1 cursor-pointer"
	>
		<Plus class="mr-2 h-4 w-4" /> Add Variant
	</Button>
</Card.Footer>
```

**4. Add the Add Variant dialog** (after the existing stock adjustment dialog, before the closing `</Dialog.Root>` of the page):

```svelte
<!-- Add Variant Dialog -->
<Dialog.Root bind:open={variantDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add New Variant</Dialog.Title>
			<Dialog.Description>Add a new size/color variant to this product.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/addVariant"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="new-size">Size</Label>
				<Input
					id="new-size"
					name="size"
					placeholder="e.g. M, L, XL, 42"
					bind:value={newVariantSize}
					required
				/>
			</div>

			<div class="space-y-2">
				<Label for="new-color">Color (Optional)</Label>
				<Input
					id="new-color"
					name="color"
					placeholder="e.g. Navy Blue"
					bind:value={newVariantColor}
				/>
			</div>

			<div class="space-y-2">
				<Label for="new-price">Price Override (Optional, ৳)</Label>
				<Input
					id="new-price"
					name="priceOverride"
					type="number"
					step="0.01"
					placeholder="Leave blank to use base price"
					bind:value={newVariantPriceOverride}
				/>
				<p class="text-xs text-muted-foreground">Base price: {formatBDT(data.product.basePrice)}</p>
			</div>

			<div class="space-y-2">
				<Label for="new-stock">Initial Stock</Label>
				<Input
					id="new-stock"
					name="initialStock"
					type="number"
					min="0"
					bind:value={newVariantInitialStock}
				/>
			</div>

			<Dialog.Footer>
				<Button type="submit" disabled={loading} class="w-full cursor-pointer">
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Add Variant
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

### Phase 6 Verification

1. Go to `/inventory/{id}` for any existing product
2. Click "Add Variant" — dialog appears
3. Enter size "XXL", initial stock 5, submit
4. New variant appears in table with correct barcode
5. `pnpm check` passes

---

## Phase 7: Free-text Stock Adjustment Reason

### Problem

The stock adjustment reason is currently a fixed dropdown (`restock`, `return`, `damage`, `theft`, `correction`). It should be a free-text input so users can type any reason.

### Step 7.1: Update Backend Validation

**File:** `src/routes/(app)/inventory/[id]/+page.server.ts`

In the `adjustStock` action, **remove** the reason validation check. Find this block (around line 47-49):

```typescript
if (!['restock', 'return', 'damage', 'theft', 'correction'].includes(reason)) {
	return fail(400, { stockError: 'Valid reason required' });
}
```

**Replace with:**

```typescript
if (!reason || !reason.trim()) {
	return fail(400, { stockError: 'Reason is required' });
}
```

Also update line 42 to trim the reason:

```typescript
const reason = (data.get('reason') as string)?.trim();
```

### Step 7.2: Replace Reason Dropdown with Text Input in UI

**File:** `src/routes/(app)/inventory/[id]/+page.svelte`

Find the "Reason" Select.Root section (around lines 222-236). **Remove** the entire `<div class="space-y-2">` block containing the reason dropdown, and replace it with:

```svelte
<div class="space-y-2">
	<Label for="adjust-reason">Reason</Label>
	<Input
		id="adjust-reason"
		name="reason"
		placeholder="e.g. Restock from supplier, Damaged in storage, Customer return"
		required
	/>
	<p class="text-xs text-muted-foreground">Describe why you're adjusting the stock.</p>
</div>
```

**Also remove** the `adjustReason` state variable (line 20: `let adjustReason = $state('restock');`) since it's no longer needed.

And remove the `Select` import from the imports if it's only used for the reason dropdown. But it's also used for the variant selector, so **keep the `Select` import**.

### Phase 7 Verification

1. Go to product detail page, click Adjust Stock
2. Reason field is now a text input, not a dropdown
3. Enter custom reason like "Supplier delivery batch #45"
4. Stock adjusts correctly, reason saved
5. `pnpm check` passes

---

## Phase 8: Comprehensive Reports Page (Monthly / Yearly / All-Time)

### Problem

Dashboard only shows today's data and a 7-day chart. There's no way to see monthly, yearly, or all-time totals. The cashbook also only filters by single day.

### Step 8.1: Create Reports Page Server

**File:** `src/routes/(app)/reports/+page.server.ts` (NEW FILE)

```typescript
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { orders, cashbook, products, productVariants, orderItems } from '$lib/server/db/schema';
import { eq, sql, gte, lt, and, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user || locals.user.role === 'sales') {
		redirect(302, '/pos');
	}

	// Determine time period from query params
	const period = url.searchParams.get('period') || 'month'; // 'today', 'week', 'month', 'year', 'all'
	const customFrom = url.searchParams.get('from');
	const customTo = url.searchParams.get('to');

	const now = new Date();
	let startDate: Date;
	let endDate: Date = new Date(now);
	endDate.setHours(23, 59, 59, 999);

	switch (period) {
		case 'today':
			startDate = new Date(now);
			startDate.setHours(0, 0, 0, 0);
			break;
		case 'week':
			startDate = new Date(now);
			startDate.setDate(now.getDate() - 7);
			startDate.setHours(0, 0, 0, 0);
			break;
		case 'month':
			startDate = new Date(now.getFullYear(), now.getMonth(), 1);
			break;
		case 'year':
			startDate = new Date(now.getFullYear(), 0, 1);
			break;
		case 'custom':
			startDate = customFrom
				? new Date(customFrom)
				: new Date(now.getFullYear(), now.getMonth(), 1);
			endDate = customTo ? new Date(customTo) : endDate;
			endDate.setHours(23, 59, 59, 999);
			break;
		case 'all':
		default:
			// Use a very old date for "all time"
			startDate = new Date(2000, 0, 1);
			break;
	}

	// Total sales in period
	const salesSummary = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
			avgOrder: sql<number>`coalesce(avg(${orders.totalAmount}), 0)`,
			totalDiscount: sql<number>`coalesce(sum(${orders.discountAmount}), 0)`
		})
		.from(orders)
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.get();

	// Cash vs Card breakdown
	const paymentBreakdown = db
		.select({
			method: orders.paymentMethod,
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`
		})
		.from(orders)
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(orders.paymentMethod)
		.all();

	// Expenses in period
	const expenseSummary = db
		.select({
			count: sql<number>`count(*)`,
			total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
		})
		.from(cashbook)
		.where(
			and(
				eq(cashbook.type, 'out'),
				gte(cashbook.createdAt, startDate),
				lt(cashbook.createdAt, endDate)
			)
		)
		.get();

	// Income in period (cashbook type = 'in')
	const incomeSummary = db
		.select({
			total: sql<number>`coalesce(sum(${cashbook.amount}), 0)`
		})
		.from(cashbook)
		.where(
			and(
				eq(cashbook.type, 'in'),
				gte(cashbook.createdAt, startDate),
				lt(cashbook.createdAt, endDate)
			)
		)
		.get();

	// Top selling products in period
	const topProducts = db
		.select({
			productName: orderItems.productName,
			totalQty: sql<number>`sum(${orderItems.quantity})`.as('total_qty'),
			totalRevenue:
				sql<number>`sum(${orderItems.priceAtSale} * ${orderItems.quantity} * (1 - ${orderItems.discount} / 100))`.as(
					'total_revenue'
				)
		})
		.from(orderItems)
		.innerJoin(orders, eq(orderItems.orderId, orders.id))
		.where(
			and(
				eq(orders.status, 'completed'),
				gte(orders.createdAt, startDate),
				lt(orders.createdAt, endDate)
			)
		)
		.groupBy(orderItems.productName)
		.orderBy(desc(sql`total_qty`))
		.limit(10)
		.all();

	// Daily sales chart data for the period (max 31 days shown)
	const chartData: { date: string; amount: number; count: number }[] = [];
	const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
	const chartDays = Math.min(daysDiff, 31); // Limit to 31 bars

	for (let i = chartDays - 1; i >= 0; i--) {
		const dayStart = new Date(endDate);
		dayStart.setDate(endDate.getDate() - i);
		dayStart.setHours(0, 0, 0, 0);
		const dayEnd = new Date(dayStart);
		dayEnd.setDate(dayStart.getDate() + 1);

		const daySales = db
			.select({
				total: sql<number>`coalesce(sum(${orders.totalAmount}), 0)`,
				count: sql<number>`count(*)`
			})
			.from(orders)
			.where(
				and(
					eq(orders.status, 'completed'),
					gte(orders.createdAt, dayStart),
					lt(orders.createdAt, dayEnd)
				)
			)
			.get();

		chartData.push({
			date: dayStart.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
			amount: daySales?.total || 0,
			count: daySales?.count || 0
		});
	}

	// Inventory summary
	const inventorySummary = db
		.select({
			totalProducts: sql<number>`count(distinct ${products.id})`,
			totalVariants: sql<number>`count(${productVariants.id})`,
			totalStock: sql<number>`coalesce(sum(${productVariants.stockQuantity}), 0)`,
			totalValue: sql<number>`coalesce(sum(${productVariants.stockQuantity} * coalesce(${productVariants.priceOverride}, ${products.basePrice})), 0)`
		})
		.from(productVariants)
		.innerJoin(products, eq(productVariants.productId, products.id))
		.get();

	return {
		period,
		startDate: startDate.toISOString().split('T')[0],
		endDate: endDate.toISOString().split('T')[0],
		salesSummary: salesSummary ?? { count: 0, total: 0, avgOrder: 0, totalDiscount: 0 },
		paymentBreakdown,
		expenseSummary: expenseSummary ?? { count: 0, total: 0 },
		incomeSummary: incomeSummary ?? { total: 0 },
		topProducts,
		chartData,
		inventorySummary: inventorySummary ?? {
			totalProducts: 0,
			totalVariants: 0,
			totalStock: 0,
			totalValue: 0
		}
	};
};
```

### Step 8.2: Create Reports Page UI

**File:** `src/routes/(app)/reports/+page.svelte` (NEW FILE)

```svelte
<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		TrendingUp,
		ShoppingBag,
		Wallet,
		BarChart3,
		Package,
		Calendar,
		ArrowDownCircle,
		ArrowUpCircle,
		DollarSign
	} from '@lucide/svelte';
	import { formatBDT } from '$lib/format';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const periods = [
		{ value: 'today', label: 'Today' },
		{ value: 'week', label: 'Last 7 Days' },
		{ value: 'month', label: 'This Month' },
		{ value: 'year', label: 'This Year' },
		{ value: 'all', label: 'All Time' },
		{ value: 'custom', label: 'Custom Range' }
	];

	let customFrom = $state(data.startDate);
	let customTo = $state(data.endDate);

	function selectPeriod(period: string) {
		if (period === 'custom') {
			goto(`/reports?period=custom&from=${customFrom}&to=${customTo}`);
		} else {
			goto(`/reports?period=${period}`);
		}
	}

	function applyCustomRange() {
		goto(`/reports?period=custom&from=${customFrom}&to=${customTo}`);
	}

	const maxChartValue = $derived(Math.max(...data.chartData.map((d: any) => d.amount), 1000));
	const netProfit = $derived((data.incomeSummary?.total ?? 0) - (data.expenseSummary?.total ?? 0));
	const cashTotal = $derived(
		data.paymentBreakdown.find((p: any) => p.method === 'cash')?.total ?? 0
	);
	const cardTotal = $derived(
		data.paymentBreakdown.find((p: any) => p.method === 'card')?.total ?? 0
	);
</script>

<div class="space-y-6 p-6">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Reports</h1>
		<p class="text-muted-foreground">Analyze your store performance across any time period.</p>
	</div>

	<!-- Period Selector Tabs -->
	<div class="flex flex-wrap items-center gap-2">
		{#each periods as p}
			<Button
				variant={data.period === p.value ? 'default' : 'outline'}
				size="sm"
				class="cursor-pointer"
				onclick={() => selectPeriod(p.value)}
			>
				{p.label}
			</Button>
		{/each}
	</div>

	<!-- Custom date range (shown only when custom is selected) -->
	{#if data.period === 'custom'}
		<div class="flex items-end gap-4 rounded-lg border bg-muted/30 p-4">
			<div class="space-y-1">
				<Label for="from">From</Label>
				<Input id="from" type="date" bind:value={customFrom} class="w-[180px]" />
			</div>
			<div class="space-y-1">
				<Label for="to">To</Label>
				<Input id="to" type="date" bind:value={customTo} class="w-[180px]" />
			</div>
			<Button onclick={applyCustomRange} class="cursor-pointer">Apply</Button>
		</div>
	{/if}

	<!-- Summary Cards Row 1: Sales -->
	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<Card.Root class="border-l-4 border-l-blue-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Total Revenue</Card.Title>
				<DollarSign class="h-4 w-4 text-blue-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-blue-600">{formatBDT(data.salesSummary.total)}</div>
				<p class="text-xs text-muted-foreground">{data.salesSummary.count} orders</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-emerald-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Net Cash Flow</Card.Title>
				<Wallet class="h-4 w-4 text-emerald-500" />
			</Card.Header>
			<Card.Content>
				<div
					class="text-2xl font-bold"
					class:text-emerald-600={netProfit >= 0}
					class:text-red-600={netProfit < 0}
				>
					{formatBDT(netProfit)}
				</div>
				<p class="text-xs text-muted-foreground">Income - Expenses</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-orange-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Total Expenses</Card.Title>
				<ArrowDownCircle class="h-4 w-4 text-orange-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-orange-600">{formatBDT(data.expenseSummary.total)}</div>
				<p class="text-xs text-muted-foreground">{data.expenseSummary.count} entries</p>
			</Card.Content>
		</Card.Root>

		<Card.Root class="border-l-4 border-l-purple-500">
			<Card.Header class="flex flex-row items-center justify-between pb-2">
				<Card.Title class="text-sm font-medium">Avg Order Value</Card.Title>
				<ShoppingBag class="h-4 w-4 text-purple-500" />
			</Card.Header>
			<Card.Content>
				<div class="text-2xl font-bold text-purple-600">
					{formatBDT(data.salesSummary.avgOrder)}
				</div>
				<p class="text-xs text-muted-foreground">
					Discounts given: {formatBDT(data.salesSummary.totalDiscount)}
				</p>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Row 2: Payment breakdown + Inventory value -->
	<div class="grid gap-4 md:grid-cols-3">
		<Card.Root>
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium">Payment Methods</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">Cash</span>
					<span class="font-bold text-emerald-600">{formatBDT(cashTotal)}</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-emerald-500 transition-all"
						style="width: {data.salesSummary.total > 0
							? (cashTotal / data.salesSummary.total) * 100
							: 0}%"
					></div>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-sm text-muted-foreground">Card</span>
					<span class="font-bold text-blue-600">{formatBDT(cardTotal)}</span>
				</div>
				<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-blue-500 transition-all"
						style="width: {data.salesSummary.total > 0
							? (cardTotal / data.salesSummary.total) * 100
							: 0}%"
					></div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="md:col-span-2">
			<Card.Header class="pb-2">
				<Card.Title class="text-sm font-medium">Inventory Snapshot</Card.Title>
			</Card.Header>
			<Card.Content>
				<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
					<div class="text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalProducts}</div>
						<p class="text-xs text-muted-foreground">Products</p>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalVariants}</div>
						<p class="text-xs text-muted-foreground">Variants</p>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold">{data.inventorySummary.totalStock}</div>
						<p class="text-xs text-muted-foreground">Total Units</p>
					</div>
					<div class="text-center">
						<div class="text-2xl font-bold text-blue-600">
							{formatBDT(data.inventorySummary.totalValue)}
						</div>
						<p class="text-xs text-muted-foreground">Stock Value</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Sales Chart -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<BarChart3 class="h-5 w-5" /> Daily Sales
			</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex h-[220px] items-end justify-between gap-1 pt-4">
				{#each data.chartData as day}
					<div class="group relative flex flex-1 flex-col items-center gap-1">
						<div
							class="w-full rounded-t-md bg-blue-500 transition-all hover:bg-blue-400"
							style="height: {maxChartValue > 0
								? (day.amount / maxChartValue) * 100
								: 0}%; min-height: {day.amount > 0 ? '4px' : '0px'}"
						>
							<div
								class="absolute -top-10 left-1/2 z-10 -translate-x-1/2 scale-0 rounded bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-md transition-all group-hover:scale-100"
							>
								{formatBDT(day.amount)} ({day.count} orders)
							</div>
						</div>
						<span
							class="origin-top-left translate-y-1 rotate-[-45deg] text-[10px] text-muted-foreground"
							>{day.date}</span
						>
					</div>
				{/each}
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Top Selling Products -->
	<Card.Root>
		<Card.Header>
			<Card.Title class="flex items-center gap-2">
				<TrendingUp class="h-5 w-5" /> Top Selling Products
			</Card.Title>
		</Card.Header>
		<Card.Content>
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-8">#</Table.Head>
						<Table.Head>Product</Table.Head>
						<Table.Head class="text-right">Qty Sold</Table.Head>
						<Table.Head class="text-right">Revenue</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.topProducts as product, i}
						<Table.Row>
							<Table.Cell>
								<Badge
									variant={i < 3 ? 'default' : 'outline'}
									class={i === 0
										? 'bg-amber-500 text-white'
										: i === 1
											? 'bg-gray-400 text-white'
											: i === 2
												? 'bg-amber-700 text-white'
												: ''}
								>
									{i + 1}
								</Badge>
							</Table.Cell>
							<Table.Cell class="font-medium">{product.productName}</Table.Cell>
							<Table.Cell class="text-right">{product.totalQty}</Table.Cell>
							<Table.Cell class="text-right font-bold">{formatBDT(product.totalRevenue)}</Table.Cell
							>
						</Table.Row>
					{/each}
					{#if data.topProducts.length === 0}
						<Table.Row>
							<Table.Cell colspan={4} class="h-24 text-center text-muted-foreground italic">
								No sales data for this period.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
	</Card.Root>
</div>
```

### Step 8.3: Add Reports to Sidebar Navigation

**File:** `src/routes/(app)/+layout.svelte`

Add a new import at the top:

```typescript
import { BarChart3 } from '@lucide/svelte';
```

**Wait — `BarChart3` is already from `@lucide/svelte`.** Just add it to the import list at line 1-15.

Then add a new nav item to the `navItems` array (after Cashbook, before Settings):

```typescript
{ href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
```

### Step 8.4: Update Dashboard to Link to Reports

**File:** `src/routes/(app)/dashboard/+page.svelte`

Add a "View Full Reports" link near the top of the page, after the subtitle:

```svelte
<div class="flex items-center justify-between">
	<div>
		<h1 class="text-3xl font-bold tracking-tight">Dashboard</h1>
		<p class="text-muted-foreground">Overview of your store's performance.</p>
	</div>
	<Button variant="outline" href="/reports" class="cursor-pointer">
		<BarChart3 class="mr-2 h-4 w-4" /> Full Reports
	</Button>
</div>
```

Import `BarChart3` from `@lucide/svelte` at the top of the script.

### Phase 8 Verification

1. Navigate to `/reports` — see period tabs (Today, Week, Month, Year, All Time, Custom)
2. Click "This Year" — shows annual totals
3. Click "All Time" — shows lifetime totals
4. Click "Custom Range" — date pickers appear, select range, click Apply
5. Payment breakdown chart shows cash vs card split
6. Top selling products table shows ranked products
7. Inventory snapshot shows total stock value
8. Sidebar shows "Reports" link for admin/manager
9. `pnpm check` passes

---

## Phase 9: Collapsible Sticky Sidebar

### Problem

The sidebar scrolls with the page content and cannot be collapsed. It should be sticky (fixed to the left) and collapsible.

### Step 9.1: Rewrite the App Layout

**File:** `src/routes/(app)/+layout.svelte`

**Replace the entire file** with this updated version. Key changes:

- Sidebar uses `position: fixed` + `h-screen` so it stays in place
- Collapse button toggles sidebar between 256px (w-64) and 64px (w-16)
- When collapsed, only icons show (no labels)
- Main content has dynamic left margin
- Active route is highlighted

```svelte
<script lang="ts">
	import {
		LayoutDashboard,
		Package,
		ShoppingCart,
		Receipt,
		Users,
		Wallet,
		Settings,
		LogOut,
		Menu,
		Sun,
		Moon,
		Monitor,
		ChevronLeft,
		ChevronRight,
		BarChart3
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Avatar, AvatarFallback } from '$lib/components/ui/avatar';
	import { Separator } from '$lib/components/ui/separator';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';

	let { data, children } = $props();
	let isMobileMenuOpen = $state(false);
	let collapsed = $state(false);

	const user = $derived(data.user);

	const navItems = $derived(
		[
			{
				href: '/dashboard',
				label: 'Dashboard',
				icon: LayoutDashboard,
				roles: ['admin', 'manager']
			},
			{ href: '/inventory', label: 'Inventory', icon: Package, roles: ['admin', 'manager'] },
			{ href: '/pos', label: 'POS', icon: ShoppingCart, roles: ['admin', 'manager', 'sales'] },
			{ href: '/orders', label: 'Orders', icon: Receipt, roles: ['admin', 'manager', 'sales'] },
			{ href: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'manager', 'sales'] },
			{ href: '/cashbook', label: 'Cashbook', icon: Wallet, roles: ['admin', 'manager'] },
			{ href: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'manager'] },
			{ href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] }
		].filter((item) => user && item.roles.includes(user.role))
	);

	// Check if a nav item is active based on current path
	function isActive(href: string): boolean {
		if (!browser) return false;
		const currentPath = $page.url.pathname;
		if (href === '/dashboard') return currentPath === '/dashboard';
		return currentPath.startsWith(href);
	}

	async function setTheme(theme: 'light' | 'dark' | 'system') {
		await fetch('/api/theme', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ theme })
		});

		if (!browser) return;

		if (theme === 'dark') {
			document.documentElement.classList.add('dark');
		} else if (theme === 'light') {
			document.documentElement.classList.remove('dark');
		} else {
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			document.documentElement.classList.toggle('dark', prefersDark);
		}
	}
</script>

<div class="flex min-h-screen bg-background text-foreground">
	<!-- Desktop Sidebar — Fixed & Collapsible -->
	<aside
		class="fixed top-0 left-0 z-30 hidden h-screen border-r bg-card transition-all duration-300 md:flex md:flex-col"
		style="width: {collapsed ? '64px' : '256px'}"
	>
		<!-- Logo / Header -->
		<div
			class="flex h-16 items-center border-b px-4 {collapsed
				? 'justify-center'
				: 'justify-between'}"
		>
			{#if !collapsed}
				<span class="truncate text-lg font-bold tracking-tight">Clothing POS</span>
			{/if}
			<button
				onclick={() => (collapsed = !collapsed)}
				class="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			>
				{#if collapsed}
					<ChevronRight class="h-4 w-4" />
				{:else}
					<ChevronLeft class="h-4 w-4" />
				{/if}
			</button>
		</div>

		<!-- Nav Links -->
		<nav class="flex-1 overflow-y-auto py-4 {collapsed ? 'px-2' : 'px-3'}">
			<div class="space-y-1">
				{#each navItems as item}
					{@const active = isActive(item.href)}
					{#if collapsed}
						<Tooltip>
							<TooltipTrigger>
								{#snippet child({ props })}
									<a
										{...props}
										href={item.href}
										class="flex cursor-pointer items-center justify-center rounded-md p-2.5 transition-colors
                      {active
											? 'bg-primary text-primary-foreground'
											: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
									>
										<item.icon class="h-5 w-5" />
									</a>
								{/snippet}
							</TooltipTrigger>
							<TooltipContent side="right">{item.label}</TooltipContent>
						</Tooltip>
					{:else}
						<a
							href={item.href}
							class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors
                {active
								? 'bg-primary text-primary-foreground'
								: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
						>
							<item.icon class="h-4 w-4 shrink-0" />
							<span class="truncate">{item.label}</span>
						</a>
					{/if}
				{/each}
			</div>
		</nav>

		<!-- Logout -->
		<div class="border-t p-3 {collapsed ? 'px-2' : ''}">
			<form action="/logout" method="POST" use:enhance>
				{#if collapsed}
					<Tooltip>
						<TooltipTrigger>
							{#snippet child({ props })}
								<button
									{...props}
									type="submit"
									class="flex w-full cursor-pointer items-center justify-center rounded-md p-2.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
								>
									<LogOut class="h-5 w-5" />
								</button>
							{/snippet}
						</TooltipTrigger>
						<TooltipContent side="right">Logout</TooltipContent>
					</Tooltip>
				{:else}
					<Button
						variant="ghost"
						class="w-full cursor-pointer justify-start gap-3 text-muted-foreground hover:text-destructive"
						type="submit"
					>
						<LogOut class="h-4 w-4" />
						Logout
					</Button>
				{/if}
			</form>
		</div>
	</aside>

	<!-- Main Content Area -->
	<div
		class="flex flex-1 flex-col transition-all duration-300"
		style="margin-left: {collapsed ? '64px' : '256px'}"
	>
		<!-- Header -->
		<header
			class="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/95 px-4 backdrop-blur-sm md:px-6"
		>
			<div class="flex items-center gap-4">
				<!-- Mobile menu button -->
				<Sheet.Root bind:open={isMobileMenuOpen}>
					<Sheet.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon" class="cursor-pointer md:hidden">
								<Menu class="h-5 w-5" />
								<span class="sr-only">Toggle menu</span>
							</Button>
						{/snippet}
					</Sheet.Trigger>
					<Sheet.Content side="left" class="w-64 p-0">
						<div class="flex h-16 items-center border-b px-6">
							<span class="text-xl font-bold tracking-tight">Clothing POS</span>
						</div>
						<nav class="space-y-1 p-4">
							{#each navItems as item}
								{@const active = isActive(item.href)}
								<a
									href={item.href}
									class="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
                    {active
										? 'bg-primary text-primary-foreground'
										: 'hover:bg-accent hover:text-accent-foreground'}"
									onclick={() => (isMobileMenuOpen = false)}
								>
									<item.icon class="h-4 w-4" />
									{item.label}
								</a>
							{/each}
							<Separator class="my-4" />
							<form action="/logout" method="POST" use:enhance>
								<Button
									variant="ghost"
									class="w-full cursor-pointer justify-start gap-3"
									type="submit"
								>
									<LogOut class="h-4 w-4" />
									Logout
								</Button>
							</form>
						</nav>
					</Sheet.Content>
				</Sheet.Root>
				<h1 class="text-lg font-semibold md:text-xl">
					{#if user?.role === 'admin'}
						Admin
					{:else if user?.role === 'manager'}
						Manager
					{:else}
						Sales
					{/if} Panel
				</h1>
			</div>

			<div class="flex items-center gap-3">
				<!-- Theme Toggle -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button {...props} variant="ghost" size="icon" class="cursor-pointer">
								<Sun
									class="h-5 w-5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90"
								/>
								<Moon
									class="absolute h-5 w-5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0"
								/>
								<span class="sr-only">Toggle theme</span>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end">
						<DropdownMenu.Item onclick={() => setTheme('light')} class="cursor-pointer">
							<Sun class="mr-2 h-4 w-4" /> Light
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('dark')} class="cursor-pointer">
							<Moon class="mr-2 h-4 w-4" /> Dark
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={() => setTheme('system')} class="cursor-pointer">
							<Monitor class="mr-2 h-4 w-4" /> System
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>

				<!-- User Menu -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								class="relative h-8 w-8 cursor-pointer rounded-full"
							>
								<Avatar class="h-8 w-8">
									<AvatarFallback class="bg-primary text-xs font-bold text-primary-foreground">
										{user?.name?.charAt(0) ?? 'U'}
									</AvatarFallback>
								</Avatar>
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-56">
						<DropdownMenu.Label class="font-normal">
							<div class="flex flex-col space-y-1">
								<p class="text-sm leading-none font-medium">{user?.name}</p>
								<p class="text-xs leading-none text-muted-foreground">@{user?.username}</p>
							</div>
						</DropdownMenu.Label>
						<DropdownMenu.Separator />
						<DropdownMenu.Item>
							{#snippet child({ props })}
								<a {...props} href="/settings" class="cursor-pointer">Settings</a>
							{/snippet}
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<form action="/logout" method="POST" use:enhance class="w-full">
							<DropdownMenu.Item>
								{#snippet child({ props })}
									<button {...props} type="submit" class="w-full cursor-pointer text-left"
										>Logout</button
									>
								{/snippet}
							</DropdownMenu.Item>
						</form>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		</header>

		<!-- Page Content -->
		<main class="flex-1 overflow-y-auto">
			{@render children()}
		</main>
	</div>
</div>

<!-- Hide md:margin-left on mobile -->
<style>
	@media (max-width: 767px) {
		div[style*='margin-left'] {
			margin-left: 0 !important;
		}
	}
</style>
```

**IMPORTANT — Tooltip component:** You need to install the tooltip component first:

```bash
pnpm dlx shadcn-svelte@next add tooltip
```

The import is:

```typescript
import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/ui/tooltip';
```

**NOTE about `$page`:** You must import from `$app/stores`:

```typescript
import { page } from '$app/stores';
```

And use it as `$page.url.pathname` in Svelte 5. If this causes type errors, you can alternatively use the `page` store from `$app/state`:

```typescript
import { page } from '$app/state';
```

And access it as `page.url.pathname` (no `$` prefix). Try `$app/state` first as it's the Svelte 5 way.

### Step 9.2: Update POS Page Height Calculation

**File:** `src/routes/(app)/pos/+page.svelte`

The POS page currently uses `h-[calc(100vh-4rem)]`. Since the sidebar is now fixed and content has its own scroll, update line 208:

Change:

```svelte
<div class="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4 md:flex-row">
```

To:

```svelte
<div class="flex h-[calc(100vh-4rem)] flex-col gap-4 p-2 md:flex-row md:p-4">
```

The height calculation stays the same since the header is still 4rem.

### Phase 9 Verification

1. Sidebar stays fixed when scrolling page content
2. Click collapse button — sidebar shrinks to icon-only mode
3. Hovering icons in collapsed mode shows tooltip with label
4. Active route is highlighted with primary color
5. Click collapse again — sidebar expands back
6. Mobile menu (Sheet) still works on small screens
7. `pnpm check` passes

---

## Phase 10: Material Color Redesign

### Problem

The current color scheme is very monochrome (black, white, gray). Need to add vibrancy using Material Design-inspired colors.

### Step 10.1: Update CSS Variables

**File:** `src/routes/layout.css`

Replace the **entire `:root`** and **`.dark`** blocks with these Material-inspired colors. The approach: use a teal/indigo primary, warm accents, and colored semantic tokens.

```css
@import 'tailwindcss';

@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
	--radius: 0.625rem;

	/* Base surfaces */
	--background: oklch(0.98 0.002 250); /* Very light blue-gray */
	--foreground: oklch(0.18 0.02 260); /* Deep blue-gray text */

	/* Cards get a clean white */
	--card: oklch(1 0 0); /* Pure white */
	--card-foreground: oklch(0.18 0.02 260);

	/* Popover */
	--popover: oklch(1 0 0);
	--popover-foreground: oklch(0.18 0.02 260);

	/* Primary: Indigo 600 */
	--primary: oklch(0.45 0.18 265); /* Rich indigo */
	--primary-foreground: oklch(0.98 0 0); /* White text */

	/* Secondary: Teal 50 background */
	--secondary: oklch(0.95 0.02 180); /* Light teal tint */
	--secondary-foreground: oklch(0.3 0.1 180); /* Dark teal text */

	/* Muted: Cool gray */
	--muted: oklch(0.96 0.005 260); /* Light cool gray */
	--muted-foreground: oklch(0.5 0.02 260); /* Medium gray text */

	/* Accent: Amber/warm */
	--accent: oklch(0.94 0.04 85); /* Warm amber tint */
	--accent-foreground: oklch(0.3 0.1 60); /* Dark amber text */

	/* Destructive: Red 600 */
	--destructive: oklch(0.55 0.24 25); /* Material Red */

	/* Borders & inputs */
	--border: oklch(0.9 0.01 260); /* Soft blue-gray border */
	--input: oklch(0.9 0.01 260);
	--ring: oklch(0.55 0.15 265); /* Indigo ring */

	/* Chart colors — vibrant Material palette */
	--chart-1: oklch(0.55 0.24 260); /* Indigo */
	--chart-2: oklch(0.6 0.18 170); /* Teal */
	--chart-3: oklch(0.7 0.2 50); /* Amber */
	--chart-4: oklch(0.55 0.22 310); /* Purple */
	--chart-5: oklch(0.6 0.24 25); /* Red-Orange */

	/* Sidebar — slightly tinted */
	--sidebar: oklch(0.97 0.005 260);
	--sidebar-foreground: oklch(0.18 0.02 260);
	--sidebar-primary: oklch(0.45 0.18 265);
	--sidebar-primary-foreground: oklch(0.98 0 0);
	--sidebar-accent: oklch(0.93 0.02 265);
	--sidebar-accent-foreground: oklch(0.25 0.05 265);
	--sidebar-border: oklch(0.9 0.01 260);
	--sidebar-ring: oklch(0.55 0.15 265);
}

.dark {
	/* Dark theme: deep blue-gray backgrounds */
	--background: oklch(0.16 0.02 260); /* Deep blue-gray */
	--foreground: oklch(0.93 0.005 260); /* Light text */

	--card: oklch(0.2 0.02 260); /* Slightly lighter card */
	--card-foreground: oklch(0.93 0.005 260);

	--popover: oklch(0.22 0.02 260);
	--popover-foreground: oklch(0.93 0.005 260);

	/* Primary: Lighter indigo for dark mode */
	--primary: oklch(0.7 0.17 265); /* Bright indigo */
	--primary-foreground: oklch(0.15 0.02 265); /* Dark text on primary */

	/* Secondary */
	--secondary: oklch(0.25 0.03 180);
	--secondary-foreground: oklch(0.85 0.06 180);

	/* Muted */
	--muted: oklch(0.25 0.015 260);
	--muted-foreground: oklch(0.65 0.015 260);

	/* Accent */
	--accent: oklch(0.28 0.04 85);
	--accent-foreground: oklch(0.9 0.06 85);

	/* Destructive */
	--destructive: oklch(0.65 0.22 25);

	/* Borders */
	--border: oklch(0.3 0.015 260);
	--input: oklch(0.28 0.02 260);
	--ring: oklch(0.65 0.15 265);

	/* Charts — brighter for dark bg */
	--chart-1: oklch(0.65 0.22 260);
	--chart-2: oklch(0.7 0.16 170);
	--chart-3: oklch(0.8 0.18 85);
	--chart-4: oklch(0.7 0.2 310);
	--chart-5: oklch(0.7 0.22 25);

	/* Sidebar */
	--sidebar: oklch(0.18 0.02 260);
	--sidebar-foreground: oklch(0.93 0.005 260);
	--sidebar-primary: oklch(0.7 0.17 265);
	--sidebar-primary-foreground: oklch(0.15 0.02 265);
	--sidebar-accent: oklch(0.25 0.03 265);
	--sidebar-accent-foreground: oklch(0.9 0.01 260);
	--sidebar-border: oklch(0.3 0.015 260);
	--sidebar-ring: oklch(0.65 0.15 265);
}
```

Keep the `@theme inline` block and `@layer base` block unchanged.

### Step 10.2: Add Colored Accents to Dashboard Summary Cards

**File:** `src/routes/(app)/dashboard/+page.svelte`

Update the summary cards to have colored left borders and colored icons. Replace the 4 summary cards section (lines 22-62) with:

```svelte
<!-- Summary Cards -->
<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
	<Card.Root class="border-l-4 border-l-emerald-500">
		<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
			<Card.Title class="text-sm font-medium">Today's Sales</Card.Title>
			<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
				<ShoppingBag class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
				{formatBDT(data.stats.todaySales?.total ?? 0)}
			</div>
			<p class="text-xs text-muted-foreground">{data.stats.todaySales?.count ?? 0} orders today</p>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-l-4 border-l-blue-500">
		<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
			<Card.Title class="text-sm font-medium">Monthly Sales</Card.Title>
			<div class="rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
				<TrendingUp class="h-4 w-4 text-blue-600 dark:text-blue-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
				{formatBDT(data.stats.monthlySales?.total ?? 0)}
			</div>
			<p class="text-xs text-muted-foreground">
				{data.stats.monthlySales?.count ?? 0} orders this month
			</p>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-l-4 border-l-red-500">
		<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
			<Card.Title class="text-sm font-medium">Today's Expenses</Card.Title>
			<div class="rounded-full bg-red-100 p-2 dark:bg-red-500/20">
				<Receipt class="h-4 w-4 text-red-600 dark:text-red-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-red-600 dark:text-red-400">
				{formatBDT(data.stats.todayExpenses?.total ?? 0)}
			</div>
			<p class="text-xs text-muted-foreground">Recorded in cashbook</p>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-l-4 border-l-amber-500">
		<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
			<Card.Title class="text-sm font-medium">Low Stock Alerts</Card.Title>
			<div class="rounded-full bg-amber-100 p-2 dark:bg-amber-500/20">
				<AlertTriangle class="h-4 w-4 text-amber-600 dark:text-amber-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
				{data.stats.lowStockCount}
			</div>
			<p class="text-xs text-muted-foreground">Items with stock &lt; 10</p>
		</Card.Content>
	</Card.Root>
</div>
```

### Step 10.3: Color the Cashbook Summary Cards

**File:** `src/routes/(app)/cashbook/+page.svelte`

Update the 3 summary cards (lines 59-87) to match the colored style:

```svelte
<!-- Summary Totals -->
<div class="grid gap-4 md:grid-cols-3">
	<Card.Root class="border-l-4 border-l-emerald-500">
		<Card.Header class="flex flex-row items-center justify-between pb-2">
			<Card.Title class="text-sm font-medium">Cash In</Card.Title>
			<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
				<ArrowUpCircle class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
				{formatBDT(data.summary.totalIn)}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-l-4 border-l-red-500">
		<Card.Header class="flex flex-row items-center justify-between pb-2">
			<Card.Title class="text-sm font-medium">Cash Out</Card.Title>
			<div class="rounded-full bg-red-100 p-2 dark:bg-red-500/20">
				<ArrowDownCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-red-600 dark:text-red-400">
				{formatBDT(data.summary.totalOut)}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border-l-4 border-l-blue-500">
		<Card.Header class="flex flex-row items-center justify-between pb-2">
			<Card.Title class="text-sm font-medium">Net Cash</Card.Title>
			<div class="rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
				<Wallet class="h-4 w-4 text-blue-600 dark:text-blue-400" />
			</div>
		</Card.Header>
		<Card.Content>
			<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
				{formatBDT(data.summary.net)}
			</div>
		</Card.Content>
	</Card.Root>
</div>
```

### Step 10.4: Color the Dashboard Chart Bars

**File:** `src/routes/(app)/dashboard/+page.svelte`

Find the chart bar div (around line 76) and change the color class:

```
bg-primary → bg-indigo-500 dark:bg-indigo-400
hover:bg-primary/80 → hover:bg-indigo-400 dark:hover:bg-indigo-300
```

### Phase 10 Verification

1. Light mode: background is slightly blue-tinted, primary is indigo, cards are white
2. Dark mode: deep blue-gray background, bright indigo accent
3. Dashboard cards have colored left borders and icons in colored circles
4. Cashbook cards are colorful (green, red, blue)
5. Charts use indigo instead of flat black
6. Overall feel is warmer and more "Material Design"-like
7. `pnpm check` passes

---

## Phase 11: POS Page Redesign

### Problem

The POS page feels flat and uninspiring. The product grid cards are plain, the cart panel lacks visual hierarchy, and the overall layout doesn't feel like a professional POS terminal.

### Step 11.1: Redesign POS Page UI

**File:** `src/routes/(app)/pos/+page.svelte`

**Replace the entire template section** (from `<div class="flex h-[calc(100vh-4rem)]...` to the end of the file) with this redesigned version. Keep the `<script>` section (lines 1-206) exactly as is.

The key design changes:

- Product cards with colored category badges and better visual hierarchy
- Cart panel with a gradient header bar
- Better checkout dialog with larger touch-friendly buttons
- Color-coded stock badges (green/yellow/red)
- Subtle gradient on the charge button
- Better empty states

```svelte
<!-- REPLACE EVERYTHING BELOW THE CLOSING </script> TAG WITH THIS: -->

<div class="flex h-[calc(100vh-4rem)] flex-col md:flex-row">
  <!-- Left Side: Product Search & Grid -->
  <div class="flex flex-1 flex-col overflow-hidden">
    <!-- Search Bar with colored accent -->
    <div class="border-b bg-card p-3">
      <div class="relative">
        <Search class="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search products, scan barcode..."
          class="pl-11 h-12 text-base bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary"
          bind:value={searchQuery}
          autofocus
        />
      </div>
    </div>

    <!-- Product Grid -->
    <ScrollArea class="flex-1 p-3 bg-muted/20">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {#each filteredProducts as variant}
          <button
            onclick={() => handleAddToCart(variant)}
            class="group relative flex flex-col rounded-xl border bg-card p-3 text-left transition-all
              hover:shadow-lg hover:shadow-primary/10 hover:border-primary/50
              active:scale-[0.98] cursor-pointer overflow-hidden"
          >
            <!-- Stock Badge — color coded -->
            <div class="absolute right-2 top-2 z-10">
              {#if variant.stockQuantity <= 3}
                <Badge class="bg-red-500 text-white text-[10px] px-1.5">{variant.stockQuantity}</Badge>
              {:else if variant.stockQuantity <= 10}
                <Badge class="bg-amber-500 text-white text-[10px] px-1.5">{variant.stockQuantity}</Badge>
              {:else}
                <Badge class="bg-emerald-500 text-white text-[10px] px-1.5">{variant.stockQuantity}</Badge>
              {/if}
            </div>

            <!-- Category pill -->
            {#if variant.category}
              <div class="mb-2">
                <span class="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {variant.category}
                </span>
              </div>
            {/if}

            <!-- Product info -->
            <h3 class="font-semibold text-sm leading-tight line-clamp-2 mb-1">{variant.productName}</h3>
            <p class="text-xs text-muted-foreground mb-2">
              {variant.size}
              {#if variant.color}
                <span class="inline-block w-2 h-2 rounded-full bg-current mx-1 align-middle" style="color: {variant.color.toLowerCase()}"></span>
                {variant.color}
              {/if}
            </p>

            <!-- Price -->
            <div class="mt-auto">
              <span class="text-lg font-black text-primary">{formatBDT(variant.price)}</span>
            </div>

            <!-- Hover overlay -->
            <div class="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none"></div>
          </button>
        {/each}
      </div>

      {#if filteredProducts.length === 0}
        <div class="flex h-64 flex-col items-center justify-center text-muted-foreground">
          <Package class="h-12 w-12 mb-3 opacity-20" />
          <p class="text-sm">No products found</p>
          <p class="text-xs">Try a different search term</p>
        </div>
      {/if}
    </ScrollArea>
  </div>

  <!-- Right Side: Cart Panel -->
  <div class="flex w-full flex-col border-l bg-card md:w-[380px]">
    <!-- Cart Header with gradient -->
    <div class="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 border-b">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="rounded-lg bg-primary/20 p-1.5">
            <ShoppingCart class="h-4 w-4 text-primary" />
          </div>
          <span class="font-semibold text-sm">Cart</span>
          {#if cart.totalItems > 0}
            <Badge class="bg-primary text-primary-foreground text-[10px] rounded-full px-2">{cart.totalItems}</Badge>
          {/if}
        </div>
        {#if cart.items.length > 0}
          <button
            onclick={() => cart.clear()}
            class="text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
          >
            Clear All
          </button>
        {/if}
      </div>
    </div>

    <!-- Cart Items -->
    <ScrollArea class="flex-1 px-3 py-2">
      <div class="space-y-2">
        {#each cart.items as item, i}
          <div class="flex items-center gap-3 rounded-lg border bg-muted/30 p-2.5 transition-colors hover:bg-muted/50">
            <!-- Item number -->
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
              {i + 1}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-xs truncate">{item.productName}</h4>
              <p class="text-[10px] text-muted-foreground">{item.size} {item.color ? `• ${item.color}` : ''}</p>
              <div class="font-bold text-xs text-primary mt-0.5">
                {formatBDT(item.price * (1 - item.discount / 100))}
                {#if item.discount > 0}
                  <span class="text-[9px] text-muted-foreground line-through ml-1">{formatBDT(item.price)}</span>
                {/if}
              </div>
            </div>

            <!-- Qty controls -->
            <div class="flex items-center gap-0.5">
              <button
                onclick={() => cart.updateQuantity(item.variantId, item.quantity - 1)}
                class="h-7 w-7 flex items-center justify-center rounded-l-md border bg-card hover:bg-muted cursor-pointer"
              >
                <Minus class="h-3 w-3" />
              </button>
              <span class="h-7 w-8 flex items-center justify-center border-y bg-card text-xs font-bold">{item.quantity}</span>
              <button
                onclick={() => cart.updateQuantity(item.variantId, item.quantity + 1)}
                class="h-7 w-7 flex items-center justify-center rounded-r-md border bg-card hover:bg-muted cursor-pointer"
                disabled={item.quantity >= item.maxStock}
              >
                <Plus class="h-3 w-3" />
              </button>
            </div>

            <!-- Remove -->
            <button
              onclick={() => cart.removeItem(item.variantId)}
              class="p-1 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <Trash class="h-3.5 w-3.5" />
            </button>
          </div>
        {/each}

        {#if cart.items.length === 0}
          <div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ShoppingCart class="h-10 w-10 mb-3 opacity-15" />
            <p class="text-sm font-medium">Cart is empty</p>
            <p class="text-xs">Add products from the left panel</p>
          </div>
        {/if}
      </div>
    </ScrollArea>

    <!-- Cart Footer -->
    <div class="border-t bg-muted/10 p-3 space-y-3">
      <!-- Customer Selection -->
      <div class="flex items-center gap-2">
        <div class="flex-1">
          <Select.Root
            type="single"
            bind:value={() => cart.customer?.id ?? '', (id) => {
              const c = data.customers.find((cust: any) => cust.id === id);
              cart.setCustomer(c || null);
            }}
          >
            <Select.Trigger class="h-9 text-xs">
              {cart.customer ? cart.customer.name : 'Walk-in Customer'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="" class="cursor-pointer">Walk-in Customer</Select.Item>
              {#each data.customers as customer}
                <Select.Item value={customer.id} class="cursor-pointer">{customer.name} ({customer.phone || 'No phone'})</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>
        <Button variant="outline" size="icon" class="h-9 w-9 cursor-pointer shrink-0" onclick={() => (customerDialogOpen = true)}>
          <UserPlus class="h-4 w-4" />
        </Button>
      </div>

      <!-- Discount + Total -->
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted-foreground">Discount (%)</span>
          <div class="w-16">
            <Input
              type="number"
              min="0"
              max="100"
              class="h-7 text-right text-xs"
              bind:value={() => cart.globalDiscount, (v) => cart.globalDiscount = Number(v)}
            />
          </div>
        </div>
        <div class="flex items-center justify-between rounded-lg bg-primary/5 p-3">
          <span class="text-sm font-semibold">Total</span>
          <span class="text-2xl font-black text-primary">{formatBDT(cart.subtotal)}</span>
        </div>
      </div>

      <!-- Charge Button -->
      <Button
        class="w-full h-14 text-lg font-bold cursor-pointer bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25"
        disabled={cart.items.length === 0}
        onclick={() => (checkoutOpen = true)}
      >
        <ShoppingCart class="mr-2 h-5 w-5" />
        Charge {formatBDT(cart.subtotal)}
      </Button>
    </div>
  </div>
</div>

<!-- Checkout Dialog -->
<Dialog.Root bind:open={checkoutOpen}>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title class="text-xl">Complete Payment</Dialog.Title>
      <Dialog.Description>
        Total: <span class="font-bold text-primary text-lg">{formatBDT(cart.subtotal)}</span>
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-6 py-4">
      <!-- Payment Method Buttons -->
      <div class="grid grid-cols-2 gap-3">
        <button
          onclick={() => cart.paymentMethod = 'cash'}
          class="flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all cursor-pointer
            {cart.paymentMethod === 'cash'
              ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
              : 'border-muted hover:border-muted-foreground/30'}"
        >
          <div class="rounded-full p-3 {cart.paymentMethod === 'cash' ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-muted'}">
            <Banknote class="h-6 w-6 {cart.paymentMethod === 'cash' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}" />
          </div>
          <span class="font-semibold text-sm {cart.paymentMethod === 'cash' ? 'text-emerald-700 dark:text-emerald-400' : ''}">Cash</span>
        </button>
        <button
          onclick={() => cart.paymentMethod = 'card'}
          class="flex flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all cursor-pointer
            {cart.paymentMethod === 'card'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
              : 'border-muted hover:border-muted-foreground/30'}"
        >
          <div class="rounded-full p-3 {cart.paymentMethod === 'card' ? 'bg-blue-100 dark:bg-blue-500/20' : 'bg-muted'}">
            <CreditCard class="h-6 w-6 {cart.paymentMethod === 'card' ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}" />
          </div>
          <span class="font-semibold text-sm {cart.paymentMethod === 'card' ? 'text-blue-700 dark:text-blue-400' : ''}">Card</span>
        </button>
      </div>

      {#if cart.paymentMethod === 'cash'}
        <div class="space-y-4">
          <div class="space-y-2">
            <Label for="cashReceived" class="text-sm">Cash Received (৳)</Label>
            <Input
              id="cashReceived"
              type="number"
              class="text-2xl h-14 text-center font-bold"
              bind:value={() => cart.cashReceived, (v) => cart.cashReceived = Number(v)}
            />
          </div>
          <div class="grid grid-cols-4 gap-2">
            {#each [100, 500, 1000, 2000] as amount}
              <Button
                variant="outline"
                class="cursor-pointer text-sm font-semibold"
                onclick={() => cart.cashReceived = amount}
              >
                ৳{amount}
              </Button>
            {/each}
          </div>
          <Button
            variant="outline"
            class="w-full cursor-pointer"
            onclick={() => cart.cashReceived = cart.subtotal}
          >
            Exact Amount ({formatBDT(cart.subtotal)})
          </Button>
          {#if cart.cashReceived > 0}
            <div class="flex items-center justify-between p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30">
              <span class="font-semibold text-emerald-700 dark:text-emerald-400">Change:</span>
              <span class="text-2xl font-black text-emerald-600 dark:text-emerald-400">{formatBDT(cart.changeAmount)}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <Dialog.Footer>
      <form
        method="POST"
        action="?/checkout"
        use:enhance={() => {
          loading = true;
          return async ({ update }) => {
            loading = false;
            await update();
          };
        }}
        class="w-full"
      >
        <input type="hidden" name="cartItems" value={JSON.stringify(cart.items)} />
        <input type="hidden" name="customerId" value={cart.customer?.id ?? ''} />
        <input type="hidden" name="paymentMethod" value={cart.paymentMethod} />
        <input type="hidden" name="cashReceived" value={cart.cashReceived} />
        <input type="hidden" name="globalDiscount" value={cart.globalDiscount} />

        <Button
          type="submit"
          class="w-full h-14 text-lg font-bold cursor-pointer bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg"
          disabled={loading || (cart.paymentMethod === 'cash' && cart.cashReceived < cart.subtotal)}
        >
          {#if loading}
            <Loader2 class="mr-2 h-5 w-5 animate-spin" />
            Processing...
          {:else}
            Complete Sale — {formatBDT(cart.subtotal)}
          {/if}
        </Button>
      </form>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<!-- Customer Quick-Add Dialog -->
<Dialog.Root bind:open={customerDialogOpen}>
  <Dialog.Content>
    <Dialog.Header>
      <Dialog.Title>Add New Customer</Dialog.Title>
    </Dialog.Header>
    <form
      method="POST"
      action="?/addCustomer"
      use:enhance={() => {
        loading = true;
        return async ({ update }) => {
          loading = false;
          await update();
        };
      }}
      class="space-y-4"
    >
      <div class="space-y-2">
        <Label for="cust-name">Customer Name</Label>
        <Input id="cust-name" name="name" placeholder="Full name" required />
      </div>
      <div class="space-y-2">
        <Label for="cust-phone">Phone Number</Label>
        <Input id="cust-phone" name="phone" placeholder="e.g. 017..." />
      </div>
      <Button type="submit" class="w-full cursor-pointer" disabled={loading}>
        {loading ? 'Adding...' : 'Add Customer'}
      </Button>
    </form>
  </Dialog.Content>
</Dialog.Root>

<!-- Success / Receipt Print Dialog -->
{#if completedOrder}
  <Dialog.Root open={!!completedOrder} onOpenChange={() => completedOrder = null}>
    <Dialog.Content>
      <Dialog.Header>
        <Dialog.Title class="text-center text-2xl">
          <span class="text-emerald-600 dark:text-emerald-400">Sale Successful!</span>
        </Dialog.Title>
        <Dialog.Description class="text-center">
          Order #{completedOrder.orderId.substring(0, 8).toUpperCase()}
        </Dialog.Description>
      </Dialog.Header>
      <div class="space-y-6 py-6 text-center">
        <div class="flex flex-col items-center gap-2">
          <div class="rounded-full bg-emerald-100 dark:bg-emerald-500/20 p-4 mb-2">
            <ShoppingCart class="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div class="text-muted-foreground text-sm">Total Amount</div>
          <div class="text-4xl font-black">{formatBDT(completedOrder.total)}</div>
        </div>
        {#if completedOrder.changeGiven > 0}
          <div class="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 p-4">
            <div class="text-sm text-amber-700 dark:text-amber-400 font-medium">Change to give</div>
            <div class="text-2xl font-bold text-amber-600 dark:text-amber-400">{formatBDT(completedOrder.changeGiven)}</div>
          </div>
        {/if}
        <div class="flex gap-3">
          <Button class="flex-1 cursor-pointer h-14 bg-gradient-to-r from-primary to-primary/80" onclick={printReceipt}>
            <Printer class="mr-2 h-5 w-5" />
            Print Receipt
          </Button>
          <Button variant="outline" class="flex-1 cursor-pointer h-14" onclick={() => completedOrder = null}>
            Done
          </Button>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Root>
{/if}
```

**IMPORTANT:** You need to add `Package` to the lucide imports at the top of the script since it's used in the empty state:

```typescript
import {
	Search,
	Plus,
	Minus,
	Trash,
	ShoppingCart,
	UserPlus,
	CreditCard,
	Banknote,
	Printer,
	X,
	Loader2,
	Package
} from '@lucide/svelte';
```

### Phase 11 Verification

1. POS page has colorful, modern product cards with color-coded stock badges
2. Cart panel has gradient header
3. Charge button has gradient and shadow
4. Checkout dialog has colorful payment method buttons (green cash, blue card)
5. Success dialog has emerald success icon
6. Change display has amber background
7. Empty cart state is visually pleasant
8. `pnpm check` passes

---

## Phase 12: POS Customer Search by Phone

### Problem

Can't search for a customer by phone number in POS. Should be able to type a phone number, see if customer exists, and if not, prompt to create one.

### Step 12.1: Replace Customer Dropdown with Search Input

**File:** `src/routes/(app)/pos/+page.svelte`

In the cart footer section, replace the customer Select.Root and the add button with a phone-search input. Add these new state variables in the `<script>` tag:

```typescript
let customerSearch = $state('');
let showCustomerResults = $state(false);

const matchedCustomers = $derived(
	customerSearch.length >= 2
		? data.customers.filter(
				(c: any) =>
					c.phone?.includes(customerSearch) ||
					c.name.toLowerCase().includes(customerSearch.toLowerCase())
			)
		: []
);
```

Then replace the customer selection section in the cart footer (the `<div class="flex items-center gap-2">` block containing the Select.Root) with:

```svelte
<!-- Customer Search -->
<div class="relative w-full">
	<div class="flex items-center gap-2">
		{#if cart.customer}
			<!-- Show selected customer -->
			<div class="flex flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5">
				<Users class="h-3.5 w-3.5 shrink-0 text-primary" />
				<div class="min-w-0 flex-1">
					<span class="block truncate text-xs font-medium">{cart.customer.name}</span>
					{#if cart.customer.phone}
						<span class="text-[10px] text-muted-foreground">{cart.customer.phone}</span>
					{/if}
				</div>
				<button
					onclick={() => {
						cart.setCustomer(null);
						customerSearch = '';
					}}
					class="cursor-pointer text-muted-foreground hover:text-destructive"
				>
					<X class="h-3.5 w-3.5" />
				</button>
			</div>
		{:else}
			<!-- Search input -->
			<div class="relative flex-1">
				<Input
					placeholder="Search customer by phone or name..."
					class="h-9 pr-8 text-xs"
					bind:value={customerSearch}
					onfocus={() => (showCustomerResults = true)}
					onblur={() => setTimeout(() => (showCustomerResults = false), 200)}
				/>
				{#if customerSearch}
					<button
						onclick={() => {
							customerSearch = '';
							showCustomerResults = false;
						}}
						class="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<X class="h-3.5 w-3.5" />
					</button>
				{/if}
			</div>
			<Button
				variant="outline"
				size="icon"
				class="h-9 w-9 shrink-0 cursor-pointer"
				onclick={() => (customerDialogOpen = true)}
			>
				<UserPlus class="h-4 w-4" />
			</Button>
		{/if}
	</div>

	<!-- Search Results Dropdown -->
	{#if showCustomerResults && customerSearch.length >= 2}
		<div
			class="absolute right-0 bottom-full left-0 z-50 mb-1 max-h-48 overflow-y-auto rounded-lg border bg-popover shadow-lg"
		>
			{#if matchedCustomers.length > 0}
				{#each matchedCustomers as customer}
					<button
						class="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
						onmousedown|preventDefault={() => {
							cart.setCustomer({ id: customer.id, name: customer.name, phone: customer.phone });
							customerSearch = '';
							showCustomerResults = false;
						}}
					>
						<div
							class="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
						>
							{customer.name.charAt(0)}
						</div>
						<div>
							<div class="text-xs font-medium">{customer.name}</div>
							<div class="text-[10px] text-muted-foreground">{customer.phone || 'No phone'}</div>
						</div>
					</button>
				{/each}
			{:else}
				<div class="p-3 text-center">
					<p class="mb-2 text-xs text-muted-foreground">No customer found for "{customerSearch}"</p>
					<Button
						variant="outline"
						size="sm"
						class="cursor-pointer text-xs"
						onmousedown|preventDefault={() => {
							// Pre-fill the customer dialog with the search term
							customerDialogOpen = true;
							showCustomerResults = false;
						}}
					>
						<UserPlus class="mr-1 h-3 w-3" />
						Create New Customer
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>
```

**IMPORTANT:** You need to add `Users` to the lucide imports at the top (it may already be imported from the sidebar layout, but add it to the POS page imports too):

```typescript
import {
	Search,
	Plus,
	Minus,
	Trash,
	ShoppingCart,
	UserPlus,
	CreditCard,
	Banknote,
	Printer,
	X,
	Loader2,
	Package,
	Users
} from '@lucide/svelte';
```

### Step 12.2: Pre-fill Customer Dialog Phone

Update the customer quick-add dialog to pre-fill the phone field with the search term when the "Create New Customer" button is clicked from the search results.

In the customer dialog form, change the phone input:

```svelte
<Input id="cust-phone" name="phone" placeholder="e.g. 017..." value={customerSearch || ''} />
```

This way, if the user searched by phone number and no customer was found, clicking "Create New Customer" will pre-fill the phone field.

### Step 12.3: Handle `onmousedown|preventDefault` Syntax

**IMPORTANT:** In Svelte 5, the `onmousedown|preventDefault` modifier syntax does NOT work. Instead, use:

```svelte
onmousedown={(e) => {
	e.preventDefault(); /* action */
}}
```

So the buttons inside the search results dropdown should use this pattern instead:

```svelte
<button
  class="..."
  onmousedown={(e) => {
    e.preventDefault();
    cart.setCustomer({ id: customer.id, name: customer.name, phone: customer.phone });
    customerSearch = '';
    showCustomerResults = false;
  }}
>
```

And for the "Create New Customer" button:

```svelte
<Button
  variant="outline"
  size="sm"
  class="cursor-pointer text-xs"
  onmousedown={(e) => {
    e.preventDefault();
    customerDialogOpen = true;
    showCustomerResults = false;
  }}
>
```

### Phase 12 Verification

1. POS page: customer section shows a search input instead of dropdown
2. Type a phone number → matching customers appear in dropdown above input
3. Type a name → matching customers appear
4. Click a customer → they're selected, search replaced with customer name badge
5. Click X on customer badge → deselects customer
6. Search with no results → shows "Create New Customer" button
7. Click "Create New Customer" → dialog opens with phone pre-filled
8. Add Customer button (UserPlus icon) still works for manual add
9. `pnpm check` passes

---

## Phase 13: Polish & Final Touches

### Step 13.1: Add `category` Field to the POS Product Query Result

The POS product cards in Phase 11 reference `variant.category`, but the current POS server query doesn't select the `category` field.

**File:** `src/routes/(app)/pos/+page.server.ts`

In the `allVariants` query (around line 14-29), add `category` to the select:

```typescript
const allVariants = db
	.select({
		id: productVariants.id,
		productId: products.id,
		productName: products.name,
		category: products.category, // ADD THIS LINE
		size: productVariants.size,
		color: productVariants.color,
		barcode: productVariants.barcode,
		price: sql<number>`coalesce(${productVariants.priceOverride}, ${products.basePrice})`.as(
			'price'
		),
		discount: products.defaultDiscount,
		stockQuantity: productVariants.stockQuantity
	})
	.from(productVariants)
	.innerJoin(products, eq(productVariants.productId, products.id))
	.where(gt(productVariants.stockQuantity, 0))
	.all();
```

### Step 13.2: Update Cashbook to Show Period Summaries

**File:** `src/routes/(app)/cashbook/+page.svelte`

Add quick period buttons near the date filter to easily jump between today, this week, this month:

After the date filter div (around line 43-56), add period quick buttons:

```svelte
<div class="flex items-center gap-2">
	<Button
		variant="outline"
		size="sm"
		class="cursor-pointer text-xs"
		onclick={() => goto('?date=' + new Date().toISOString().split('T')[0])}
	>
		Today
	</Button>
	<Label for="date-filter" class="sr-only">Date</Label>
	<div class="relative">
		<Calendar class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
		<Input
			id="date-filter"
			type="date"
			class="w-[200px] cursor-pointer pl-10"
			bind:value={selectedDate}
			onchange={handleDateChange}
		/>
	</div>
</div>
```

### Step 13.3: RBAC for Reports Route

**File:** `src/routes/(app)/+layout.server.ts`

Make sure the reports route is accessible for admin and manager. The current RBAC check for sales users only allows `/pos`, `/orders`, `/customers`. Since sales users can't see the reports nav item and the reports server load already redirects sales users, no change needed here — but verify that the `salesAllowed` check in the layout server doesn't block it. The current code already handles this correctly since sales users are redirected by the reports page server load.

### Step 13.4: Ensure All New Routes Are Accessible

Add `/reports` to the RBAC check if needed. Looking at the current code:

```typescript
const salesAllowed = ['/pos', '/orders', '/customers'];
if (locals.user.role === 'sales') {
	const isAllowed = salesAllowed.some((path) => url.pathname.startsWith(path));
	if (!isAllowed && url.pathname !== '/') {
		redirect(302, '/pos');
	}
}
```

This already blocks sales from `/reports`, `/inventory`, etc. No change needed.

### Phase 13 Verification

1. POS product cards show category pills
2. Cashbook has "Today" quick button
3. All routes are properly RBAC-protected
4. `pnpm check` passes with ZERO errors
5. Test the full flow: login → dashboard → inventory → create product → add variant → POS → sell → cashbook → reports

---

## Summary of All Changes

| #   | Issue                          | Solution                                  | Files Changed                                                            |
| --- | ------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------ |
| 6   | Can't add variants             | Add Variant dialog on product detail page | `inventory/[id]/+page.server.ts`, `inventory/[id]/+page.svelte`          |
| 7   | Fixed stock reasons            | Replace dropdown with text input          | `inventory/[id]/+page.server.ts`, `inventory/[id]/+page.svelte`          |
| 8   | No period reports              | New `/reports` page with period filters   | NEW: `reports/+page.server.ts`, `reports/+page.svelte`, `+layout.svelte` |
| 9   | Sidebar not sticky/collapsible | Fixed sidebar with collapse toggle        | `(app)/+layout.svelte`                                                   |
| 10  | Mundane colors                 | Material Design-inspired OKLCH palette    | `layout.css`, `dashboard/+page.svelte`, `cashbook/+page.svelte`          |
| 11  | Bad POS UI                     | Complete POS redesign                     | `pos/+page.svelte`                                                       |
| 12  | No phone search                | Customer search with auto-create prompt   | `pos/+page.svelte`, `pos/+page.server.ts`                                |
| 13  | Polish                         | Category in POS, quick buttons, RBAC      | Multiple files                                                           |

---

## Common Pitfalls to Avoid

1. **Do NOT use `$page` without importing it.** Import from `$app/state` (Svelte 5) or `$app/stores`.
2. **Tooltip component must be installed first:** `pnpm dlx shadcn-svelte@next add tooltip`
3. **Event modifiers like `|preventDefault` don't work in Svelte 5.** Use `(e) => { e.preventDefault(); ... }` instead.
4. **`onmousedown` is used for dropdown items** to fire before `onblur` hides the dropdown. This is critical for the customer search feature.
5. **The sidebar margin-left must be hidden on mobile** with the CSS `@media` block. Otherwise mobile layout breaks.
6. **When adding `category` to the POS query**, make sure the product cards in the template actually reference it correctly as `variant.category`.
7. **Do NOT use `async` inside `db.transaction()` callbacks.** All Drizzle + better-sqlite3 operations are synchronous.
