<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
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
		Printer
	} from '@lucide/svelte';
	import { formatBDT } from '$lib/format';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { createDebounced } from '$lib/debounce.svelte';

	let { data } = $props();

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
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('q') ?? '';
		if (q === current) return;
		if (q) params.set('q', q);
		else params.delete('q');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	});

	function applyFilters() {
		const params = new URLSearchParams($page.url.searchParams);
		if (selectedCategory) params.set('category', selectedCategory);
		else params.delete('category');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function setStockFilter(value: string) {
		selectedStock = value;
		const params = new URLSearchParams($page.url.searchParams);
		if (value) params.set('stock', value);
		else params.delete('stock');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`?${params.toString()}`);
	}

	function stockColor(qty: number): 'destructive' | 'secondary' | 'outline' {
		if (qty === 0) return 'destructive';
		if (qty <= 5) return 'secondary';
		return 'outline';
	}

	function stockChipClass(qty: number): string {
		if (qty === 0)
			return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900';
		if (qty <= 5)
			return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
		return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
	}

	function getPriceRange(product: any) {
		if (!product.variants || product.variants.length === 0) return formatBDT(product.templatePrice);
		const prices = product.variants.map((v: any) => v.price);
		const min = Math.min(...prices);
		const max = Math.max(...prices);
		if (min === max) return formatBDT(min);
		return `${formatBDT(min)} - ${formatBDT(max)}`;
	}
</script>

<svelte:head>
	<title>Inventory — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-3 sm:p-6 pb-24 md:pb-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Inventory</h1>
			<p class="text-sm text-muted-foreground sm:text-base">Manage your products and stock levels.</p>
		</div>
		<Button href="/inventory/new" class="hidden md:flex cursor-pointer">
			<Plus class="mr-2 h-4 w-4" /> New Product
		</Button>
	</div>

	<!-- Summary Stat Cards -->
	<div class="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
		<div class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
				<Package class="h-5 w-5 text-blue-600 dark:text-blue-400" />
			</div>
			<div class="min-w-0">
				<p class="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Products</p>
				<p class="text-xl font-black text-blue-600 dark:text-blue-400 leading-none mt-1">
					{data.stats.totalProducts}
				</p>
			</div>
		</div>

		<div class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10">
				<TrendingUp class="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
			</div>
			<div class="min-w-0">
				<p class="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retail Value</p>
				<p class="text-xl font-black text-indigo-600 dark:text-indigo-400 leading-none mt-1">
					{formatBDT(data.stats.totalInventoryValue)}
				</p>
			</div>
		</div>

		<button
			class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-amber-500/50 group text-left {selectedStock === 'low' ? 'ring-2 ring-amber-500 border-amber-500' : ''}"
			onclick={() => setStockFilter(selectedStock === 'low' ? '' : 'low')}
		>
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
				<AlertTriangle class="h-5 w-5 text-amber-600 dark:text-amber-400" />
			</div>
			<div class="min-w-0">
				<p class="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Low Stock</p>
				<p class="text-xl font-black text-amber-600 dark:text-amber-400 leading-none mt-1">
					{data.stats.lowStockVariants ?? 0}
				</p>
			</div>
		</button>

		<button
			class="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-md hover:border-red-500/50 group text-left {selectedStock === 'out' ? 'ring-2 ring-red-500 border-red-500' : ''}"
			onclick={() => setStockFilter(selectedStock === 'out' ? '' : 'out')}
		>
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
				<PackageX class="h-5 w-5 text-red-600 dark:text-red-400" />
			</div>
			<div class="min-w-0">
				<p class="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Out of Stock</p>
				<p class="text-xl font-black text-red-600 dark:text-red-400 leading-none mt-1">
					{data.stats.outOfStockVariants ?? 0}
				</p>
			</div>
		</button>
	</div>

	<!-- Filters -->
	<Card.Root>
		<Card.Content class="p-3 sm:p-4">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center">
				<div class="relative w-full max-w-md">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input placeholder="Search products..." class="h-10 pl-10 pr-9 bg-muted/20 border-0 focus-visible:ring-primary shadow-inner" bind:value={searchQuery} />
					{#if searchQuery}
						<button
							onclick={() => (searchQuery = '')}
							class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
							title="Clear search"
						>
							<X class="h-4 w-4" />
						</button>
					{/if}
				</div>
				
				<div class="flex flex-wrap items-center gap-3">
					<div class="flex items-center gap-2">
						<span class="text-xs font-bold text-muted-foreground uppercase tracking-tight">Category:</span>
						<Select.Root type="single" bind:value={selectedCategory} onValueChange={applyFilters}>
							<Select.Trigger class="w-[160px] h-9 text-xs bg-muted/20 border-0">
								{selectedCategory || 'All'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" class="cursor-pointer text-xs">All Categories</Select.Item>
								{#each data.categories as cat}
									<Select.Item value={cat} class="cursor-pointer text-xs">{cat}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="flex items-center gap-2">
						<span class="text-xs font-bold text-muted-foreground uppercase tracking-tight">Stock:</span>
						<Select.Root type="single" bind:value={selectedStock} onValueChange={(v) => setStockFilter(v)}>
							<Select.Trigger class="w-[160px] h-9 text-xs bg-muted/20 border-0">
								{selectedStock === 'low'
									? 'Low Stock'
									: selectedStock === 'out'
										? 'Out of Stock'
										: selectedStock === 'healthy'
											? 'Healthy'
											: 'All Levels'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="" class="cursor-pointer text-xs">All Stock Levels</Select.Item>
								<Select.Item value="low" class="cursor-pointer text-xs">Low Stock</Select.Item>
								<Select.Item value="out" class="cursor-pointer text-xs">Out of Stock</Select.Item>
								<Select.Item value="healthy" class="cursor-pointer text-xs">Healthy</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					{#if searchQuery || selectedCategory || selectedStock}
						<Button 
							variant="ghost" 
							size="sm" 
							onclick={() => { searchQuery = ''; selectedCategory = ''; setStockFilter(''); }}
							class="h-9 px-3 text-xs text-muted-foreground hover:text-destructive"
						>
							<X class="mr-2 h-3.5 w-3.5" /> Reset
						</Button>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Product Table -->
	<Card.Root>
		<Card.Content class="p-0 overflow-hidden">
			<div class="overflow-x-auto">
				<Table.Root class="min-w-[800px] lg:min-w-full">
			<Table.Header>
				<Table.Row>
					<Table.Head>Product</Table.Head>
					<Table.Head>Price</Table.Head>
					<Table.Head>Variants / Inventory</Table.Head>
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.products as product}
					<Table.Row class="cursor-pointer" onclick={() => goto(`/inventory/${product.id}`)}>
						<Table.Cell>
							<div class="flex flex-col">
								<span class="text-base font-medium">{product.name}</span>
								<div class="mt-0.5 flex items-center gap-2">
									<Badge variant="secondary" class="h-4 px-1.5 py-0 text-[10px]"
										>{product.category}</Badge
									>
									<span class="text-xs text-muted-foreground"
										>{product.variants.length} variant{product.variants.length === 1
											? ''
											: 's'}</span
									>
								</div>
							</div>
						</Table.Cell>
						<Table.Cell>
							<span class="font-semibold">{getPriceRange(product)}</span>
							{#if product.defaultDiscount && product.defaultDiscount > 0}
								<div class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
									-{product.defaultDiscount}% Default Discount
								</div>
							{/if}
						</Table.Cell>
						<Table.Cell>
							{@const variantTotal = product.variants.reduce((sum, v) => sum + v.stockQuantity, 0)}
							<div class="flex flex-col gap-1.5">
								<div class="flex items-center gap-2">
									<Badge variant={stockColor(variantTotal)} class="font-bold">
										{variantTotal} in stock
									</Badge>
								</div>
								{#if product.variants.length > 0}
									<div class="flex flex-wrap gap-1">
										{#each product.variants as variant}
											<span
												class="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium {stockChipClass(
													variant.stockQuantity
												)}"
												title="{variant.size}: {variant.stockQuantity} in stock"
											>
												{variant.size}: {variant.stockQuantity}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</Table.Cell>
						<Table.Cell class="text-right">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span class="flex justify-end gap-1" onclick={(e) => e.stopPropagation()}>
								<Button
									variant="ghost"
									size="icon"
									href="/inventory/{product.id}"
									title="View Details"
									class="cursor-pointer"
								>
									<Eye class="h-4 w-4" />
								</Button>
								<Button
									variant="ghost"
									size="icon"
									href="/inventory/{product.id}/labels"
									title="Print Labels"
									class="cursor-pointer"
								>
									<Printer class="h-4 w-4" />
								</Button>
							</span>
						</Table.Cell>
					</Table.Row>
				{/each}
				{#if data.products.length === 0}
					<Table.Row>
						<Table.Cell colspan={4} class="h-24 text-center">
							<div class="flex flex-col items-center justify-center gap-2 py-4">
								<Package class="h-10 w-10 text-muted-foreground/40" />
								<p class="text-muted-foreground">No products found.</p>
								<Button href="/inventory/new" size="sm" class="mt-1 cursor-pointer">
									<Plus class="mr-2 h-4 w-4" /> New Product
								</Button>
							</div>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
		</div>
	</Card.Content>
</Card.Root>

	<!-- Pagination -->
	{#if data.pagination.totalPages > 1}
		<div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
			<p class="text-xs text-muted-foreground sm:text-sm">
				Showing {(data.pagination.currentPage - 1) * data.pagination.perPage + 1} to {Math.min(
					data.pagination.currentPage * data.pagination.perPage,
					data.pagination.total
				)} of {data.pagination.total} products
			</p>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="icon"
					disabled={data.pagination.currentPage <= 1}
					onclick={() => goToPage(data.pagination.currentPage - 1)}
					class="h-8 w-8 cursor-pointer"
				>
					<ChevronLeft class="h-4 w-4" />
				</Button>
				<div class="text-xs font-medium sm:text-sm">
					Page {data.pagination.currentPage} of {data.pagination.totalPages}
				</div>
				<Button
					variant="outline"
					size="icon"
					disabled={data.pagination.currentPage >= data.pagination.totalPages}
					onclick={() => goToPage(data.pagination.currentPage + 1)}
					class="h-8 w-8 cursor-pointer"
				>
					<ChevronRight class="h-4 w-4" />
				</Button>
			</div>
		</div>
	{/if}

	<!-- Mobile FAB -->
	<div class="fixed bottom-20 right-4 z-40 md:hidden">
		<Button
			href="/inventory/new"
			size="icon"
			class="h-14 w-14 rounded-full shadow-2xl shadow-primary/40 bg-primary text-primary-foreground hover:scale-110 active:scale-95 transition-all"
		>
			<Plus class="h-7 w-7" />
		</Button>
	</div>
</div>
