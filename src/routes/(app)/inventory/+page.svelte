<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Select from '$lib/components/ui/select';
	import {
		Plus,
		Search,
		Package,
		AlertTriangle,
		PackageX,
		TrendingUp,
		X,
		Printer,
		Trash
	} from '@lucide/svelte';
	import { formatCurrency } from '$lib/format';
	import { goto } from '$app/navigation';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
	import { enhance } from '$app/forms';
	import { confirmState } from '$lib/confirm.svelte';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	const isAdmin = $derived(data.user?.role === 'admin');

	$effect(() => {
		if (form?.deleteSuccess) {
			toast.success('Product deleted successfully');
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	let nativeData = $state<any>(null);

	async function loadNativeInventory() {
		if (!isNative || !powersync.ready) return;
		powersync.dataVersion;

		const [statsResult, categoryRows, productList] = await Promise.all([
			powersync.db.get(`
				SELECT COUNT(DISTINCT p.id) as totalProducts, COUNT(pv.id) as totalVariants,
					SUM(CASE WHEN pv.stock_quantity > 0 AND pv.stock_quantity <= 5 THEN 1 ELSE 0 END) as lowStockVariants,
					SUM(CASE WHEN pv.stock_quantity = 0 THEN 1 ELSE 0 END) as outOfStockVariants,
					COALESCE(SUM(COALESCE(NULLIF(pv.cost_price, 0), p.cost_price, 0) * pv.stock_quantity), 0) as totalCostValue,
					COALESCE(SUM(pv.price * pv.stock_quantity), 0) as totalRetailValue
				FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id
			`),
			powersync.db.getAll('SELECT DISTINCT category FROM products'),
			powersync.db.getAll(`
				SELECT p.id, p.name, p.category, p.base_price as templatePrice, p.default_discount as defaultDiscount,
					COALESCE((SELECT SUM(pv.stock_quantity) FROM product_variants pv WHERE pv.product_id = p.id), 0) as totalStock
				FROM products p ORDER BY p.id DESC
			`)
		]);

		const allVariants = (await powersync.db.getAll('SELECT * FROM product_variants')) as any[];
		const variantsByProduct = new Map();
		for (const v of allVariants) {
			const list = variantsByProduct.get(v.product_id) ?? [];
			list.push({ ...v, productId: v.product_id, stockQuantity: v.stock_quantity });
			variantsByProduct.set(v.product_id, list);
		}

		nativeData = {
			stats: statsResult ?? { totalProducts: 0, totalVariants: 0, lowStockVariants: 0, outOfStockVariants: 0, totalCostValue: 0, totalRetailValue: 0 },
			categories: (categoryRows as any[]).map((c) => c.category).sort(),
			products: (productList as any[]).map((p) => ({
				...p,
				variants: variantsByProduct.get(p.id) ?? []
			})),
			lowStockThreshold: 5
		};
	}

	$effect(() => {
		if (isNative && powersync.ready) loadNativeInventory();
	});

	// --- Client-side filtering (no server roundtrip) ---
	let searchQuery = $state('');
	let selectedCategory = $state('');
	let selectedStock = $state('');

	/** Fuzzy-ish local match: case-insensitive substring + stripped special chars */
	function localMatch(haystack: string, needle: string): boolean {
		if (!needle) return true;
		const h = haystack.toLowerCase();
		const n = needle.toLowerCase();
		// Direct substring
		if (h.includes(n)) return true;
		// Stripped match (removes -, spaces, _, .)
		const hStripped = h.replace(/[-\s_.]/g, '');
		const nStripped = n.replace(/[-\s_.]/g, '');
		return hStripped.includes(nStripped);
	}

	function filterProducts(allProducts: any[], threshold: number): any[] {
		let result = allProducts;

		if (searchQuery) {
			result = result.filter((p) => {
				if (localMatch(p.name, searchQuery)) return true;
				if (localMatch(p.category, searchQuery)) return true;
				if (p.variants?.some((v: any) => localMatch(v.barcode ?? '', searchQuery))) return true;
				return false;
			});
		}

		if (selectedCategory) {
			result = result.filter((p) => p.category === selectedCategory);
		}

		if (selectedStock === 'out') {
			result = result.filter((p) =>
				p.variants?.some((v: any) => (v.stockQuantity ?? 0) === 0)
			);
		} else if (selectedStock === 'low') {
			result = result.filter((p) =>
				p.variants?.some((v: any) => {
					const q = v.stockQuantity ?? 0;
					return q > 0 && q <= threshold;
				})
			);
		} else if (selectedStock === 'healthy') {
			result = result.filter(
				(p) => !p.variants?.some((v: any) => (v.stockQuantity ?? 0) <= threshold)
			);
		}

		return result;
	}

	function setStockFilter(value: string) {
		selectedStock = selectedStock === value ? '' : value;
	}

	function stockChipClass(qty: number): string {
		if (qty === 0)
			return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400';
		if (qty <= 5)
			return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400';
		return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400';
	}

	function getPriceRange(product: any) {
		if (!product.variants || product.variants.length === 0)
			return formatCurrency(product.templatePrice);
		const prices = product.variants.map((v: any) => v.price);
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		return min === max ? formatCurrency(min) : `${formatCurrency(min)} - ${formatCurrency(max)}`;
	}

	function getStockHealth(variants: any[]): 'healthy' | 'low' | 'out' | 'mixed' {
		if (!variants || variants.length === 0) return 'out';
		const total = variants.reduce((s: number, v: any) => s + (v.stockQuantity ?? 0), 0);
		if (total === 0) return 'out';
		const hasOut = variants.some((v: any) => (v.stockQuantity ?? 0) === 0);
		const hasLow = variants.some(
			(v: any) => (v.stockQuantity ?? 0) > 0 && (v.stockQuantity ?? 0) <= 5
		);
		if (hasOut || hasLow) return 'mixed';
		return 'healthy';
	}

	function stockHealthColor(health: string) {
		if (health === 'out') return 'text-red-600 dark:text-red-400';
		if (health === 'low' || health === 'mixed') return 'text-amber-600 dark:text-amber-400';
		return 'text-emerald-600 dark:text-emerald-400';
	}

	function stockHealthBg(health: string) {
		if (health === 'out') return 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-900';
		if (health === 'low' || health === 'mixed')
			return 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900';
		return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900';
	}
</script>

<svelte:head>
	<title>Inventory — Clothing POS</title>
</svelte:head>

<div class="space-y-4 p-3 pb-24 sm:p-6 md:pb-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Inventory</h1>
		</div>
	</div>

	<!-- Summary Cards -->
	{#snippet statCards(stats: any)}
		<div class="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
			<div class="rounded-lg border bg-card p-3 shadow-sm sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Products</span>
					<div class="rounded-md bg-blue-500/10 p-1.5">
						<Package class="h-3.5 w-3.5 text-blue-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black break-all sm:mt-2 sm:text-2xl">
					{stats.totalProducts}
				</div>
			</div>

			<div class="rounded-lg border bg-card p-3 shadow-sm sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Retail Value</span>
					<div class="rounded-md bg-emerald-500/10 p-1.5">
						<TrendingUp class="h-3.5 w-3.5 text-emerald-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black break-all text-emerald-600 sm:mt-2 sm:text-2xl">
					{formatCurrency(stats.totalRetailValue)}
				</div>
			</div>

			<div class="rounded-lg border bg-card p-3 shadow-sm sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Inventory Value</span>
					<div class="rounded-md bg-indigo-500/10 p-1.5">
						<Package class="h-3.5 w-3.5 text-indigo-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black break-all text-indigo-600 sm:mt-2 sm:text-2xl">
					{formatCurrency(stats.totalCostValue)}
				</div>
			</div>

			<button
				class="rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock ===
				'low'
					? 'ring-2 ring-amber-500'
					: ''}"
				onclick={() => setStockFilter(selectedStock === 'low' ? '' : 'low')}
			>
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Low Stock</span>
					<div class="rounded-md bg-amber-500/10 p-1.5">
						<AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black break-all text-amber-600 sm:mt-2 sm:text-2xl">
					{stats.lowStockVariants}
				</div>
			</button>

			<button
				class="rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock ===
				'out'
					? 'ring-2 ring-red-500'
					: ''}"
				onclick={() => setStockFilter(selectedStock === 'out' ? '' : 'out')}
			>
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Out of Stock</span>
					<div class="rounded-md bg-red-500/10 p-1.5">
						<PackageX class="h-3.5 w-3.5 text-red-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black break-all text-red-600 sm:mt-2 sm:text-2xl">
					{stats.outOfStockVariants}
				</div>
			</button>
		</div>
	{/snippet}

	{#if isNative && nativeData}
		{@render statCards(nativeData.stats)}
	{:else if isNative}
		<div class="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
			{#each Array(5) as _}<Skeleton class="h-20 rounded-lg" />{/each}
		</div>
	{:else}
		{#await data.streamed}
			<div class="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
				{#each Array(5) as _}<Skeleton class="h-20 rounded-lg" />{/each}
			</div>
		{:then streamed}
			{@render statCards(streamed.stats)}
		{/await}
	{/if}

	<!-- Action Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative w-full max-w-md">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					placeholder="Search products, categories, barcodes…"
					class="h-9 pl-9"
					bind:value={searchQuery}
				/>
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
						aria-label="Clear search"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<span class="text-[10px] font-bold text-muted-foreground uppercase">Category:</span>
				{#if isNative && nativeData}
					<Select.Root type="single" bind:value={selectedCategory}>
						<Select.Trigger class="h-9 w-[160px] text-xs">
							{selectedCategory || 'All Categories'}
						</Select.Trigger>
						<Select.Content>
							<Select.Item value="" class="text-xs">All Categories</Select.Item>
							{#each nativeData.categories as cat}
								<Select.Item value={cat} class="text-xs">{cat}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				{:else if isNative}
					<Skeleton class="h-9 w-[160px]" />
				{:else}
					{#await data.streamed}
						<Skeleton class="h-9 w-[160px]" />
					{:then streamed}
						<Select.Root type="single" bind:value={selectedCategory}>
							<Select.Trigger class="h-9 w-[160px] text-xs">
								{selectedCategory || 'All Categories'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" class="text-xs">All Categories</Select.Item>
								{#each streamed.categories as cat}
									<Select.Item value={cat} class="text-xs">{cat}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					{/await}
				{/if}
			</div>
		</div>
		<Button href="/inventory/new" class="hidden md:flex">
			<Plus class="mr-2 h-4 w-4" /> New Product
		</Button>
	</div>

	<!-- Product Card (mobile) -->
	{#snippet productCard(product: any)}
		{@const total =
			product.variants?.reduce(
				(s: number, v: { stockQuantity: number }) => s + (v.stockQuantity ?? 0),
				0
			) ?? 0}
		{@const health = getStockHealth(product.variants)}
		<div
			role="button"
			tabindex="0"
			class="group relative cursor-pointer rounded-lg border bg-card text-card-foreground shadow-sm transition-colors hover:bg-muted/50"
			onclick={() => goto(`/inventory/${product.id}`)}
			onkeydown={(e) => e.key === 'Enter' && goto(`/inventory/${product.id}`)}
		>
			<div class="p-4">
				<div class="mb-3 flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<h3 class="truncate text-sm font-bold tracking-tight">{product.name}</h3>
						<Badge variant="secondary" class="mt-1 text-[10px]">{product.category}</Badge>
					</div>
					<span class="text-base font-black tracking-tight text-primary">
						{getPriceRange(product)}
					</span>
				</div>

				<!-- Stock Health Summary -->
				<div class="rounded-md border p-2.5 {stockHealthBg(health)}">
					<div class="mb-2 flex items-center justify-between">
						<span class="text-[10px] font-bold tracking-wider uppercase {stockHealthColor(health)}">
							{health === 'out'
								? 'Out of Stock'
								: health === 'mixed'
									? 'Needs Attention'
									: 'In Stock'}
						</span>
						<span class="text-sm font-black tabular-nums {stockHealthColor(health)}">{total}</span>
					</div>

					<!-- Variant stock bar -->
					{#if product.variants && product.variants.length > 0}
						<div class="flex gap-px overflow-hidden rounded-full">
							{#each product.variants as v}
								{@const qty = v.stockQuantity ?? 0}
								<div
									class="h-1.5 min-w-1 flex-1 {qty === 0
										? 'bg-red-400 dark:bg-red-500'
										: qty <= 5
											? 'bg-amber-400 dark:bg-amber-500'
											: 'bg-emerald-400 dark:bg-emerald-500'}"
									title="{v.size}: {qty}"
								></div>
							{/each}
						</div>
						<div class="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5">
							{#each product.variants as v}
								{@const qty = v.stockQuantity ?? 0}
								<span
									class="text-[10px] tabular-nums {qty === 0
										? 'font-bold text-red-600 dark:text-red-400'
										: qty <= 5
											? 'font-semibold text-amber-600 dark:text-amber-400'
											: 'text-muted-foreground'}"
								>
									{v.size}:{qty}
								</span>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Card action bar -->
			<div class="flex items-center justify-end gap-1 border-t px-3 py-1.5">
				<Button
					variant="ghost"
					size="sm"
					href="/inventory/{product.id}/labels"
					onclick={(e: MouseEvent) => e.stopPropagation()}
					class="h-7 px-2 text-[10px]"
					aria-label="Print labels"
				>
					<Printer class="mr-1 h-3 w-3" /> Labels
				</Button>
				{#if isAdmin}
					<form
						method="POST"
						action="?/deleteProduct"
						use:enhance={() => {
							return async ({ update }) => {
								await update();
								if (isNative) loadNativeInventory();
							};
						}}
					>
						<input type="hidden" name="productId" value={product.id} />
						<Button
							variant="ghost"
							size="sm"
							type="button"
							class="h-7 px-2 text-[10px] text-muted-foreground hover:text-destructive"
							aria-label="Delete product"
							onclick={async (e: MouseEvent) => {
								e.stopPropagation();
								const formEl = (e.currentTarget as HTMLElement).closest('form');
								if (
									await confirmState.confirm({
										title: 'Delete Product',
										message: `Delete "${product.name}" and all its variants? This cannot be undone.`,
										confirmText: 'Delete',
										variant: 'destructive'
									})
								) {
									formEl?.requestSubmit();
								}
							}}
						>
							<Trash class="mr-1 h-3 w-3" /> Delete
						</Button>
					</form>
				{/if}
			</div>
		</div>
	{/snippet}

	<!-- Desktop table row stock cell -->
	{#snippet stockCell(product: any)}
		{@const total =
			product.variants?.reduce(
				(s: number, v: { stockQuantity: number }) => s + (v.stockQuantity ?? 0),
				0
			) ?? 0}
		{@const health = getStockHealth(product.variants)}
		<div class="flex items-center gap-3">
			<div class="flex min-w-[52px] flex-col items-center">
				<span class="text-sm font-black tabular-nums {stockHealthColor(health)}">{total}</span>
				<span class="text-[9px] font-medium tracking-wider text-muted-foreground uppercase"
					>total</span
				>
			</div>
			{#if product.variants && product.variants.length > 0}
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					<!-- Mini bar -->
					<div class="flex gap-px overflow-hidden rounded-full">
						{#each product.variants as v}
							{@const qty = v.stockQuantity ?? 0}
							<div
								class="h-1.5 min-w-1 flex-1 {qty === 0
									? 'bg-red-400 dark:bg-red-500'
									: qty <= 5
										? 'bg-amber-400 dark:bg-amber-500'
										: 'bg-emerald-400 dark:bg-emerald-500'}"
								title="{v.size}: {qty}"
							></div>
						{/each}
					</div>
					<!-- Inline sizes - compact, single row -->
					<div class="flex flex-wrap gap-x-1.5 gap-y-0">
						{#each product.variants as v}
							{@const qty = v.stockQuantity ?? 0}
							<span
								class="text-[10px] tabular-nums {qty === 0
									? 'font-bold text-red-600 dark:text-red-400'
									: qty <= 5
										? 'font-semibold text-amber-600 dark:text-amber-400'
										: 'text-muted-foreground'}"
							>
								{v.size}:{qty}
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	<!-- Product List -->
	{#snippet productList(allProducts: any[], threshold: number)}
		{@const filtered = filterProducts(allProducts, threshold)}
		<!-- Mobile: Card layout -->
		<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
			{#each filtered as product (product.id)}
				{@render productCard(product)}
			{:else}
				<div
					class="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed text-muted-foreground sm:col-span-2"
				>
					<Package class="mb-2 h-10 w-10 opacity-20" />
					{#if searchQuery || selectedCategory || selectedStock}
						<p class="text-sm">No products match your filters.</p>
						<Button variant="outline" size="sm" class="mt-3" onclick={() => { searchQuery = ''; selectedCategory = ''; selectedStock = ''; }}>
							<X class="mr-2 h-4 w-4" /> Clear filters
						</Button>
					{:else}
						<p class="text-sm">No products found in inventory.</p>
						<Button href="/inventory/new" variant="outline" size="sm" class="mt-3">
							<Plus class="mr-2 h-4 w-4" /> Add your first product
						</Button>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Desktop: Table layout -->
		<Card.Root class="hidden rounded-lg py-0 lg:block">
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Product</Table.Head>
							<Table.Head class="w-[140px]">Price</Table.Head>
							<Table.Head class="w-[280px]">Stock</Table.Head>
							<Table.Head class="w-[100px] text-right">Actions</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as product (product.id)}
							<Table.Row
								class="cursor-pointer even:bg-muted/30 hover:bg-muted/50"
								onclick={() => goto(`/inventory/${product.id}`)}
							>
								<Table.Cell>
									<div class="flex flex-col">
										<span class="font-medium">{product.name}</span>
										<Badge variant="secondary" class="w-fit text-[10px]">{product.category}</Badge>
									</div>
								</Table.Cell>
								<Table.Cell>
									<span class="font-semibold break-all">{getPriceRange(product)}</span>
								</Table.Cell>
								<Table.Cell>
									{@render stockCell(product)}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="icon"
											href="/inventory/{product.id}/labels"
											onclick={(e: MouseEvent) => e.stopPropagation()}
											aria-label="Print labels"><Printer class="h-4 w-4" /></Button
										>
										{#if isAdmin}
											<form
												method="POST"
												action="?/deleteProduct"
												use:enhance={() => {
													return async ({ update }) => {
														await update();
														if (isNative) loadNativeInventory();
													};
												}}
											>
												<input type="hidden" name="productId" value={product.id} />
												<Button
													variant="ghost"
													size="icon"
													type="button"
													class="text-muted-foreground hover:text-destructive"
													aria-label="Delete product"
													onclick={async (e: MouseEvent) => {
														e.stopPropagation();
														const formEl = (e.currentTarget as HTMLElement).closest('form');
														if (
															await confirmState.confirm({
																title: 'Delete Product',
																message: `Delete "${product.name}" and all its variants? This cannot be undone.`,
																confirmText: 'Delete',
																variant: 'destructive'
															})
														) {
															formEl?.requestSubmit();
														}
													}}
												>
													<Trash class="h-4 w-4" />
												</Button>
											</form>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="h-48 text-center text-muted-foreground italic">
									<div class="flex flex-col items-center justify-center gap-2">
										<Package class="h-10 w-10 opacity-20" />
										{#if searchQuery || selectedCategory || selectedStock}
											<p>No products match your filters.</p>
											<Button variant="outline" size="sm" class="mt-2" onclick={() => { searchQuery = ''; selectedCategory = ''; selectedStock = ''; }}>
												<X class="mr-2 h-4 w-4" /> Clear filters
											</Button>
										{:else}
											<p>No products found in inventory.</p>
											<Button href="/inventory/new" variant="outline" size="sm" class="mt-2">
												<Plus class="mr-2 h-4 w-4" /> Add your first product
											</Button>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
		</Card.Root>

		{#if filtered.length > 0 && (searchQuery || selectedCategory || selectedStock)}
			<p class="text-center text-xs text-muted-foreground">
				Showing {filtered.length} of {allProducts.length} products
			</p>
		{/if}
	{/snippet}

	{#if isNative && nativeData}
		{@render productList(nativeData.products, nativeData.lowStockThreshold)}
	{:else if isNative}
		<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
			{#each Array(6) as _}<Skeleton class="h-44 rounded-lg" />{/each}
		</div>
	{:else}
		{#await data.streamed}
			<div class="grid gap-3 sm:grid-cols-2 lg:hidden">
				{#each Array(6) as _}<Skeleton class="h-44 rounded-lg" />{/each}
			</div>
			<Card.Root class="hidden py-0 lg:block">
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Product</Table.Head>
								<Table.Head class="w-[140px]">Price</Table.Head>
								<Table.Head class="w-[280px]">Stock</Table.Head>
								<Table.Head class="w-[100px] text-right">Actions</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each Array(8) as _}
								<Table.Row>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-10" /></Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>
		{:then streamed}
			{@render productList(streamed.products, streamed.lowStockThreshold)}
		{/await}
	{/if}
</div>

<div class="fixed right-4 bottom-20 z-40 md:hidden">
	<Button
		href="/inventory/new"
		size="icon"
		class="h-14 w-14 rounded-full shadow-2xl"
		aria-label="Add new product"><Plus class="h-7 w-7" /></Button
	>
</div>
