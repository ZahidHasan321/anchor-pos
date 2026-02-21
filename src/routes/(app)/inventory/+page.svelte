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
		Printer
	} from '@lucide/svelte';
	import { formatCurrency } from '$lib/format';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
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

<div class="space-y-6 p-3 pb-24 sm:p-6 md:pb-6">
	<!-- Header -->
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Inventory</h1>
			<p class="text-sm text-muted-foreground sm:text-base">Manage products and stock levels.</p>
		</div>
		<Button href="/inventory/new" class="hidden md:flex"
			><Plus class="mr-2 h-4 w-4" /> New Product</Button
		>
	</div>

	<!-- Summary Cards -->
	<div class="flex flex-wrap gap-3">
		{#await data.streamed}
			{#each Array(4) as _}<Skeleton class="h-20 min-w-[200px] flex-1" />{/each}
		{:then streamed}
			<div
				class="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600"
				>
					<Package class="h-5 w-5" />
				</div>
				<div>
					<p class="text-[10px] font-bold text-muted-foreground uppercase">Products</p>
					<p class="mt-1 text-xl font-black">{streamed.stats.totalProducts}</p>
				</div>
			</div>
			<div
				class="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600"
				>
					<TrendingUp class="h-5 w-5" />
				</div>
				<div>
					<p class="text-[10px] font-bold text-muted-foreground uppercase">Value</p>
					<p class="mt-1 text-xl font-black">
						{formatCurrency(streamed.stats.totalInventoryValue)}
					</p>
				</div>
			</div>
			<button
				class="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm {selectedStock ===
				'low'
					? 'ring-2 ring-amber-500'
					: ''}"
				onclick={() => setStockFilter(selectedStock === 'low' ? '' : 'low')}
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600"
				>
					<AlertTriangle class="h-5 w-5" />
				</div>
				<div>
					<p class="text-[10px] font-bold text-muted-foreground uppercase">Low Stock</p>
					<p class="mt-1 text-xl font-black">{streamed.stats.lowStockVariants}</p>
				</div>
			</button>
			<button
				class="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm {selectedStock ===
				'out'
					? 'ring-2 ring-red-500'
					: ''}"
				onclick={() => setStockFilter(selectedStock === 'out' ? '' : 'out')}
			>
				<div
					class="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-600"
				>
					<PackageX class="h-5 w-5" />
				</div>
				<div>
					<p class="text-[10px] font-bold text-muted-foreground uppercase">Out of Stock</p>
					<p class="mt-1 text-xl font-black">{streamed.stats.outOfStockVariants}</p>
				</div>
			</button>
		{/await}
	</div>

	<!-- Filters -->
	<Card.Root>
		<Card.Content class="p-3 sm:p-4">
			<div class="flex flex-col gap-4 lg:flex-row lg:items-center">
				<div class="relative w-full max-w-md">
					<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
					<Input placeholder="Search..." class="h-10 pl-10" bind:value={searchQuery} />
					{#if searchQuery}<button
							onclick={() => (searchQuery = '')}
							class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
							><X class="h-4 w-4" /></button
						>{/if}
				</div>
				<div class="flex flex-wrap items-center gap-3">
					<div class="flex items-center gap-2">
						<span class="text-xs font-bold text-muted-foreground">CATEGORY:</span>
						{#await data.streamed}
							<Skeleton class="h-9 w-[160px]" />
						{:then streamed}
							<Select.Root type="single" bind:value={selectedCategory} onValueChange={applyFilters}>
								<Select.Trigger class="h-9 w-[160px] text-xs"
									>{selectedCategory || 'All'}</Select.Trigger
								>
								<Select.Content>
									<Select.Item value="" class="text-xs">All Categories</Select.Item>
									{#each streamed.categories as cat}<Select.Item value={cat} class="text-xs"
											>{cat}</Select.Item
										>{/each}
								</Select.Content>
							</Select.Root>
						{/await}
					</div>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

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
										<Button variant="ghost" size="icon" href="/inventory/${product.id}/labels"
											><Printer class="h-4 w-4" /></Button
										>
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
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="border-t p-4">
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
		</Card.Footer>
	</Card.Root>
</div>

<div class="fixed right-4 bottom-20 z-40 md:hidden">
	<Button href="/inventory/new" size="icon" class="h-14 w-14 rounded-full shadow-2xl"
		><Plus class="h-7 w-7" /></Button
	>
</div>
