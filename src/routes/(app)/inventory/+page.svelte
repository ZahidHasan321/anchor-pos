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
		ChevronLeft,
		ChevronRight,
		Package,
		AlertTriangle,
		PackageX,
		TrendingUp,
		Eye,
		X,
		Printer,
		Trash
	} from '@lucide/svelte';
	import { formatCurrency } from '$lib/format';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { createDebounced } from '$lib/debounce.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { confirmState } from '$lib/confirm.svelte';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	const isNative = $derived(browser && !!(window as any).electron);
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
		powersync.dataVersion; // re-run when sync completes with new data
		const perPage = 20;
		const pg = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1');
		const offset = (pg - 1) * perPage;
		const categoryFilter = data.filters.category;
		const search = data.filters.search;
		const stockStatus = data.filters.stockStatus;

		// Stats
		const statsResult = await powersync.db.get(`
			SELECT COUNT(DISTINCT p.id) as totalProducts, COUNT(pv.id) as totalVariants,
				SUM(CASE WHEN pv.stock_quantity > 0 AND pv.stock_quantity <= 5 THEN 1 ELSE 0 END) as lowStockVariants,
				SUM(CASE WHEN pv.stock_quantity = 0 THEN 1 ELSE 0 END) as outOfStockVariants,
				COALESCE(SUM(COALESCE(p.cost_price, 0) * pv.stock_quantity), 0) as totalInventoryValue
			FROM product_variants pv INNER JOIN products p ON pv.product_id = p.id
		`);

		const categoryRows = await powersync.db.getAll('SELECT DISTINCT category FROM products');

		let where = 'WHERE 1=1';
		const params: any[] = [];
		if (categoryFilter) { where += ' AND p.category = ?'; params.push(categoryFilter); }
		if (search) {
			where += ' AND (p.name LIKE ? OR p.category LIKE ? OR EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.barcode LIKE ?))';
			const p = `%${search}%`;
			params.push(p, p, p);
		}
		if (stockStatus === 'out') where += ' AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity = 0)';
		else if (stockStatus === 'low') where += ' AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity > 0 AND pv.stock_quantity <= 5)';
		else if (stockStatus === 'healthy') where += ' AND NOT EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.stock_quantity <= 5)';

		const [countResult, productList] = await Promise.all([
			powersync.db.get(`SELECT count(*) as count FROM products p ${where}`, params),
			powersync.db.getAll(`
				SELECT p.id, p.name, p.category, p.base_price as templatePrice, p.default_discount as defaultDiscount,
					COALESCE((SELECT SUM(pv.stock_quantity) FROM product_variants pv WHERE pv.product_id = p.id), 0) as totalStock
				FROM products p ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?
			`, [...params, perPage, offset])
		]);

		const productIds = (productList as any[]).map(p => p.id);
		let variants: any[] = [];
		if (productIds.length > 0) {
			const placeholders = productIds.map(() => '?').join(',');
			variants = await powersync.db.getAll(`SELECT * FROM product_variants WHERE product_id IN (${placeholders})`, productIds) as any[];
		}

		const variantsByProduct = new Map();
		for (const v of variants) {
			const list = variantsByProduct.get(v.product_id) ?? [];
			list.push({ ...v, productId: v.product_id, stockQuantity: v.stock_quantity });
			variantsByProduct.set(v.product_id, list);
		}

		const total = (countResult as any)?.count ?? 0;
		nativeData = {
			stats: statsResult ?? { totalProducts: 0, totalVariants: 0, lowStockVariants: 0, outOfStockVariants: 0, totalInventoryValue: 0 },
			categories: (categoryRows as any[]).map(c => c.category).sort(),
			products: (productList as any[]).map(p => ({ ...p, variants: variantsByProduct.get(p.id) ?? [] })),
			total,
			totalPages: Math.ceil(total / perPage),
			currentPage: pg
		};
	}

	$effect(() => {
		if (isNative && powersync.ready) loadNativeInventory();
	});

	let searchQuery = $state('');
	let selectedCategory = $state('');
	let selectedStock = $state('');

	$effect(() => {
		searchQuery = data.filters.search;
		selectedCategory = data.filters.category;
		selectedStock = data.filters.stockStatus;
	});

	const debouncedSearch = createDebounced(() => searchQuery);

	$effect(() => {
		const q = debouncedSearch.value;
		const current = page.url.searchParams.get('q') ?? '';
		if (q === current) return;
		const params = new URLSearchParams(page.url.searchParams);
		if (q) params.set('q', q);
		else params.delete('q');
		params.set('page', '1');
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	});

	function applyFilters() {
		const params = new URLSearchParams(page.url.searchParams);
		if (selectedCategory) params.set('category', selectedCategory);
		else params.delete('category');
		params.set('page', '1');
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function setStockFilter(value: string) {
		selectedStock = value;
		const params = new URLSearchParams(page.url.searchParams);
		if (value) params.set('stock', value);
		else params.delete('stock');
		params.set('page', '1');
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`?${params.toString()}`, { noScroll: true, keepFocus: true });
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
</script>

<svelte:head>
	<title>Inventory — Clothing POS</title>
</svelte:head>

<div class="space-y-4 p-3 sm:p-6 pb-24 md:pb-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Inventory</h1>
			<p class="hidden text-xs text-muted-foreground sm:block sm:text-sm">Manage products and stock levels.</p>
		</div>
	</div>

	<!-- Summary Cards -->
	<div class="flex flex-wrap gap-2.5 sm:gap-4">
		{#if isNative && nativeData}
			<div class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Products</span>
					<div class="rounded-md bg-blue-500/10 p-1.5">
						<Package class="h-3.5 w-3.5 text-blue-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black sm:mt-2 sm:text-2xl">
					{nativeData.stats.totalProducts}
				</div>
			</div>

			<div class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Value</span>
					<div class="rounded-md bg-indigo-500/10 p-1.5">
						<TrendingUp class="h-3.5 w-3.5 text-indigo-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black text-indigo-600 sm:mt-2 sm:text-2xl">
					{formatCurrency(nativeData.stats.totalInventoryValue)}
				</div>
			</div>

			<button
				class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock === 'low' ? 'ring-2 ring-amber-500' : ''}"
				onclick={() => setStockFilter(selectedStock === 'low' ? '' : 'low')}
			>
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Low Stock</span>
					<div class="rounded-md bg-amber-500/10 p-1.5">
						<AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black text-amber-600 sm:mt-2 sm:text-2xl">
					{nativeData.stats.lowStockVariants}
				</div>
			</button>

			<button
				class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock === 'out' ? 'ring-2 ring-red-500' : ''}"
				onclick={() => setStockFilter(selectedStock === 'out' ? '' : 'out')}
			>
				<div class="flex items-center justify-between">
					<span class="text-[10px] font-bold text-muted-foreground uppercase">Out of Stock</span>
					<div class="rounded-md bg-red-500/10 p-1.5">
						<PackageX class="h-3.5 w-3.5 text-red-600" />
					</div>
				</div>
				<div class="mt-1.5 text-xl font-black text-red-600 sm:mt-2 sm:text-2xl">
					{nativeData.stats.outOfStockVariants}
				</div>
			</button>
		{:else if isNative}
			{#each Array(4) as _}<Skeleton class="h-20 min-w-[140px] flex-1 rounded-lg" />{/each}
		{:else}
			{#await data.streamed}
				{#each Array(4) as _}<Skeleton class="h-20 min-w-[140px] flex-1 rounded-lg" />{/each}
			{:then streamed}
				<div class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[10px] font-bold text-muted-foreground uppercase">Products</span>
						<div class="rounded-md bg-blue-500/10 p-1.5">
							<Package class="h-3.5 w-3.5 text-blue-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black sm:mt-2 sm:text-2xl">
						{streamed.stats.totalProducts}
					</div>
				</div>

				<div class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 shadow-sm sm:p-4">
					<div class="flex items-center justify-between">
						<span class="text-[10px] font-bold text-muted-foreground uppercase">Value</span>
						<div class="rounded-md bg-indigo-500/10 p-1.5">
							<TrendingUp class="h-3.5 w-3.5 text-indigo-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-indigo-600 sm:mt-2 sm:text-2xl">
						{formatCurrency(streamed.stats.totalInventoryValue)}
					</div>
				</div>

				<button
					class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock === 'low' ? 'ring-2 ring-amber-500' : ''}"
					onclick={() => setStockFilter(selectedStock === 'low' ? '' : 'low')}
				>
					<div class="flex items-center justify-between">
						<span class="text-[10px] font-bold text-muted-foreground uppercase">Low Stock</span>
						<div class="rounded-md bg-amber-500/10 p-1.5">
							<AlertTriangle class="h-3.5 w-3.5 text-amber-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-amber-600 sm:mt-2 sm:text-2xl">
						{streamed.stats.lowStockVariants}
					</div>
				</button>

				<button
					class="min-w-[140px] flex-1 rounded-lg border bg-card p-3 text-left shadow-sm transition-all hover:bg-muted/50 sm:p-4 {selectedStock === 'out' ? 'ring-2 ring-red-500' : ''}"
					onclick={() => setStockFilter(selectedStock === 'out' ? '' : 'out')}
				>
					<div class="flex items-center justify-between">
						<span class="text-[10px] font-bold text-muted-foreground uppercase">Out of Stock</span>
						<div class="rounded-md bg-red-500/10 p-1.5">
							<PackageX class="h-3.5 w-3.5 text-red-600" />
						</div>
					</div>
					<div class="mt-1.5 text-xl font-black text-red-600 sm:mt-2 sm:text-2xl">
						{streamed.stats.outOfStockVariants}
					</div>
				</button>
			{/await}
		{/if}
	</div>

	<!-- Action Bar -->
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
			<div class="relative w-full max-w-md">
				<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Search products, categories, barcodes..." class="h-9 pl-9" bind:value={searchQuery} />
				{#if searchQuery}
					<button
						onclick={() => (searchQuery = '')}
						class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
					>
						<X class="h-4 w-4" />
					</button>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<span class="text-[10px] font-bold text-muted-foreground uppercase">Category:</span>
				{#if isNative && nativeData}
					<Select.Root type="single" bind:value={selectedCategory} onValueChange={applyFilters}>
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
						<Select.Root type="single" bind:value={selectedCategory} onValueChange={applyFilters}>
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

	<!-- Product Table -->
	<Card.Root>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Product</Table.Head>
						<Table.Head>Price</Table.Head>
						<Table.Head>Inventory</Table.Head>
						<Table.Head class="text-right">Actions</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if isNative && nativeData}
						{#each nativeData.products as product}
							<Table.Row
								class="cursor-pointer hover:bg-muted/50"
								onclick={() => goto(`/inventory/${product.id}`)}
							>
								<Table.Cell>
									<div class="flex flex-col">
										<span class="font-medium">{product.name}</span><Badge
											variant="secondary"
											class="w-fit text-[10px]">{product.category}</Badge
										>
									</div>
								</Table.Cell>
								<Table.Cell><span class="font-semibold">{getPriceRange(product)}</span></Table.Cell>
								<Table.Cell>
									{@const total = product.variants.reduce(
										(s: number, v: { stockQuantity: number }) => s + v.stockQuantity,
										0
									)}
									<div class="flex flex-col gap-1">
										<Badge
											variant={total === 0 ? 'destructive' : total <= 5 ? 'secondary' : 'outline'}
											>{total} in stock</Badge
										>
										<div class="flex flex-wrap gap-1">
											{#each product.variants as v}<span
													class="rounded border px-1 py-0.5 text-[10px] {stockChipClass(
														v.stockQuantity
													)}">{v.size}: {v.stockQuantity}</span
												>{/each}
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="text-right"
									><div class="flex justify-end gap-1">
										<Button variant="ghost" size="icon" href="/inventory/{product.id}/labels"
											onclick={(e: MouseEvent) => e.stopPropagation()}
											><Printer class="h-4 w-4" /></Button
										>
										{#if isAdmin}
											<form method="POST" action="?/deleteProduct" use:enhance={() => {
												return async ({ update }) => { await update(); if (isNative) loadNativeInventory(); };
											}}>
												<input type="hidden" name="productId" value={product.id} />
												<Button
													variant="ghost"
													size="icon"
													type="button"
													class="text-muted-foreground hover:text-destructive"
													onclick={async (e: MouseEvent) => {
														e.stopPropagation();
														const formEl = (e.currentTarget as HTMLElement).closest('form');
														if (await confirmState.confirm({
															title: 'Delete Product',
															message: `Delete "${product.name}" and all its variants? This cannot be undone.`,
															confirmText: 'Delete',
															variant: 'destructive'
														})) {
															formEl?.requestSubmit();
														}
													}}
												>
													<Trash class="h-4 w-4" />
												</Button>
											</form>
										{/if}
									</div></Table.Cell
								>
							</Table.Row>
						{:else}
							<Table.Row>
								<Table.Cell colspan={4} class="h-48 text-center text-muted-foreground italic">
									<div class="flex flex-col items-center justify-center gap-2">
										<Package class="h-10 w-10 opacity-20" />
										<p>No products found in inventory.</p>
										<Button href="/inventory/new" variant="outline" size="sm" class="mt-2">
											<Plus class="mr-2 h-4 w-4" /> Add your first product
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					{:else if isNative}
						{#each Array(8) as _}
							<Table.Row>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
								<Table.Cell><Skeleton class="h-10 w-10" /></Table.Cell>
							</Table.Row>
						{/each}
					{:else}
						{#await data.streamed}
							{#each Array(8) as _}
								<Table.Row>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-full" /></Table.Cell>
									<Table.Cell><Skeleton class="h-10 w-10" /></Table.Cell>
								</Table.Row>
							{/each}
						{:then streamed}
							{#each streamed.products as product}
								<Table.Row
									class="cursor-pointer hover:bg-muted/50"
									onclick={() => goto(`/inventory/${product.id}`)}
								>
									<Table.Cell>
										<div class="flex flex-col">
											<span class="font-medium">{product.name}</span><Badge
												variant="secondary"
												class="w-fit text-[10px]">{product.category}</Badge
											>
										</div>
									</Table.Cell>
									<Table.Cell><span class="font-semibold">{getPriceRange(product)}</span></Table.Cell>
									<Table.Cell>
										{@const total = product.variants.reduce(
											(s: number, v: { stockQuantity: number }) => s + v.stockQuantity,
											0
										)}
										<div class="flex flex-col gap-1">
											<Badge
												variant={total === 0 ? 'destructive' : total <= 5 ? 'secondary' : 'outline'}
												>{total} in stock</Badge
											>
											<div class="flex flex-wrap gap-1">
												{#each product.variants as v}<span
														class="rounded border px-1 py-0.5 text-[10px] {stockChipClass(
															v.stockQuantity
														)}">{v.size}: {v.stockQuantity}</span
													>{/each}
											</div>
										</div>
									</Table.Cell>
									<Table.Cell class="text-right"
										><div class="flex justify-end gap-1">
											<Button variant="ghost" size="icon" href="/inventory/{product.id}/labels"
												onclick={(e: MouseEvent) => e.stopPropagation()}
												><Printer class="h-4 w-4" /></Button
											>
											{#if isAdmin}
												<form method="POST" action="?/deleteProduct" use:enhance>
													<input type="hidden" name="productId" value={product.id} />
													<Button
														variant="ghost"
														size="icon"
														type="button"
														class="text-muted-foreground hover:text-destructive"
														onclick={async (e: MouseEvent) => {
															e.stopPropagation();
															const formEl = (e.currentTarget as HTMLElement).closest('form');
															if (await confirmState.confirm({
																title: 'Delete Product',
																message: `Delete "${product.name}" and all its variants? This cannot be undone.`,
																confirmText: 'Delete',
																variant: 'destructive'
															})) {
																formEl?.requestSubmit();
															}
														}}
													>
														<Trash class="h-4 w-4" />
													</Button>
												</form>
											{/if}
										</div></Table.Cell
									>
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell colspan={4} class="h-48 text-center text-muted-foreground italic">
										<div class="flex flex-col items-center justify-center gap-2">
											<Package class="h-10 w-10 opacity-20" />
											<p>No products found in inventory.</p>
											<Button href="/inventory/new" variant="outline" size="sm" class="mt-2">
												<Plus class="mr-2 h-4 w-4" /> Add your first product
											</Button>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						{/await}
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="border-t p-4">
			{#if isNative && nativeData}
				{#if nativeData.totalPages > 1}
					<div class="flex w-full items-center justify-between">
						<p class="text-xs text-muted-foreground">
							Showing {nativeData.products.length} of {nativeData.total}
						</p>
						<div class="flex gap-1">
							<Button
								variant="outline"
								size="icon"
								disabled={nativeData.currentPage <= 1}
								onclick={() => goToPage(nativeData.currentPage - 1)}
								class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
							>
							<Button
								variant="outline"
								size="icon"
								disabled={nativeData.currentPage >= nativeData.totalPages}
								onclick={() => goToPage(nativeData.currentPage + 1)}
								class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
							>
						</div>
					</div>
				{/if}
			{:else if !isNative}
				{#await data.streamed then streamed}
					{#if streamed.totalPages > 1}
						<div class="flex w-full items-center justify-between">
							<p class="text-xs text-muted-foreground">
								Showing {streamed.products.length} of {streamed.total}
							</p>
							<div class="flex gap-1">
								<Button
									variant="outline"
									size="icon"
									disabled={streamed.currentPage <= 1}
									onclick={() => goToPage(streamed.currentPage - 1)}
									class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
								>
								<Button
									variant="outline"
									size="icon"
									disabled={streamed.currentPage >= streamed.totalPages}
									onclick={() => goToPage(streamed.currentPage + 1)}
									class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
								>
							</div>
						</div>
					{/if}
				{/await}
			{/if}
		</Card.Footer>
	</Card.Root>
</div>

<div class="fixed right-4 bottom-20 z-40 md:hidden">
	<Button href="/inventory/new" size="icon" class="h-14 w-14 rounded-full shadow-2xl"
		><Plus class="h-7 w-7" /></Button
	>
</div>
