<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
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
		Users,
		ScanBarcode,
		ChevronUp
	} from '@lucide/svelte';
	import { formatCurrency, getCurrencySymbol, formatDateTime } from '$lib/format';
	import { cart } from '$lib/stores/cart.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import { confirmState } from '$lib/confirm.svelte';
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	let searchQuery = $state(untrack(() => data.search));
	let selectedCategory = $state(untrack(() => data.category));

	$effect(() => {
		searchQuery = data.search;
		selectedCategory = data.category;
	});

	let checkoutOpen = $state(false);
	let customerDialogOpen = $state(false);
	let loading = $state(false);

	// Products state (derived/synced from streamed data)
	let displayedProducts = $state<any[]>([]);
	let hasMore = $state(false);
	let loadingMore = $state(false);
	let searchLoading = $state(false);
	let searchAbortController: AbortController | null = null;

	// Scroll state
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);

	$effect(() => {
		data.streamed.then((s) => {
			displayedProducts = s.products;
			hasMore = s.hasMore;
		});
	});

	let lastHandledAction = $state<string | null>(null);
	let customerSearch = $state('');
	let showCustomerResults = $state(false);

	// Debounced server-side search
	let searchTimeout: any;
	function handleSearch(query: string) {
		searchQuery = query;
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			triggerServerSearch(query, selectedCategory);
		}, 300);
	}

	function handleCategoryChange(cat: string) {
		selectedCategory = cat;
		triggerServerSearch(searchQuery, cat);
	}

	async function triggerServerSearch(search: string, category: string) {
		if (searchAbortController) searchAbortController.abort();
		searchAbortController = new AbortController();

		searchLoading = true;
		const params = new URLSearchParams();
		if (search) params.set('search', search);
		if (category && category !== 'All') params.set('category', category);
		try {
			const res = await fetch(`/api/pos/products?${params.toString()}`, {
				signal: searchAbortController.signal
			});
			const json = await res.json();
			displayedProducts = json.items;
			hasMore = json.hasMore;
			if (scrollContainer) scrollContainer.scrollTop = 0;
		} catch (e: any) {
			if (e.name === 'AbortError') return;
			console.error('Search error:', e);
		} finally {
			searchLoading = false;
		}
	}

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		const params = new URLSearchParams();
		if (searchQuery) params.set('search', searchQuery);
		if (selectedCategory && selectedCategory !== 'All') params.set('category', selectedCategory);
		params.set('offset', String(displayedProducts.length));
		try {
			const res = await fetch(`/api/pos/products?${params.toString()}`);
			const json = await res.json();
			displayedProducts = [...displayedProducts, ...json.items];
			hasMore = json.hasMore;
		} finally {
			loadingMore = false;
		}
	}

	function handleAddToCart(variant: any) {
		cart.addItem({
			variantId: variant.id,
			productId: variant.productId,
			productName: variant.productName,
			size: variant.size,
			color: variant.color,
			barcode: variant.barcode,
			price: variant.price,
			discount: variant.discount || 0,
			maxStock: variant.stockQuantity
		});
	}

	let completedOrder = $state<any>(null);

	$effect(() => {
		if (form?.success) {
			if (form.orderId && lastHandledAction !== form.orderId) {
				lastHandledAction = form.orderId;
				completedOrder = {
					orderId: form.orderId,
					orderNumber: form.orderNumber,
					changeGiven: form.changeGiven ?? 0,
					items: [...cart.items],
					total: cart.subtotal,
					cashReceived: cart.cashReceived
				};
				cart.clear();
				checkoutOpen = false;
				toast.success('Sale completed!');
			} else if (form.customer && lastHandledAction !== form.customer.id) {
				lastHandledAction = form.customer.id;
				cart.setCustomer(form.customer);
				customerDialogOpen = false;
				toast.success('Customer added!');
			}
		}
		if (form?.error) toast.error(form.error);
	});

	let activeMobileTab = $state<'products' | 'cart'>('products');

	function handlePrintReceipt(preview = true) {
		if (!completedOrder) return;
		data.streamed.then((s) => {
			printReceipt({
				storeSettings: s.storeSettings,
				orderId: '#' + completedOrder.orderNumber,
				orderUuid: completedOrder.orderId,
				date: formatDateTime(new Date()),
				cashier: data.user?.name ?? '',
				items: completedOrder.items.map((item: any) => ({
					name: item.productName,
					variant: item.size + (item.color ? ' / ' + item.color : ''),
					qty: item.quantity,
					total: item.price * item.quantity * (1 - (item.discount ?? 0) / 100)
				})),
				total: completedOrder.total,
				cashReceived: completedOrder.cashReceived,
				changeGiven: completedOrder.changeGiven,
				footerNote: 'Printed on ' + formatDateTime(new Date())
			}, preview);
		});
	}
</script>

<svelte:head><title>POS — Anchor</title></svelte:head>

<div class="flex h-[calc(100vh-3rem)] flex-col md:h-screen">
	<!-- Mobile Tabs -->
	<div class="flex border-b bg-card md:hidden">
		<button
			onclick={() => (activeMobileTab = 'products')}
			class="flex-1 border-b-2 py-3 text-sm font-bold {activeMobileTab === 'products'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground'}">Products ({displayedProducts.length})</button
		>
		<button
			onclick={() => (activeMobileTab = 'cart')}
			class="relative flex-1 border-b-2 py-3 text-sm font-bold {activeMobileTab === 'cart'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground'}"
			>Cart {#if cart.totalItems > 0}<Badge class="ml-1.5 h-5 min-w-5 rounded-full px-1"
					>{cart.totalItems}</Badge
				>{/if}</button
		>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Left: Products -->
		<div
			class="flex flex-1 flex-col overflow-hidden {activeMobileTab === 'products'
				? 'flex'
				: 'hidden md:flex'}"
		>
			<div class="border-b bg-card px-4 pt-3 pb-2">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search..."
						class="h-12 pl-11 text-base"
						value={searchQuery}
						oninput={(e) => handleSearch(e.currentTarget.value)}
					/>
				</div>
				<div class="scrollbar-none mt-2 flex gap-1.5 overflow-x-auto pb-1">
					{#await data.streamed}
						{#each Array(5) as _}<Skeleton class="h-8 w-20 rounded-full" />{/each}
					{:then streamed}
						{#each streamed.categories as cat}
							<button
								onclick={() => handleCategoryChange(cat)}
								class="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all {selectedCategory ===
								cat
									? 'bg-primary text-primary-foreground shadow-sm'
									: 'bg-muted/50 text-muted-foreground hover:bg-muted'}">{cat}</button
							>
						{/each}
					{/await}
				</div>
			</div>

			<div class="relative min-h-0 flex-1 overflow-hidden">
				{#if searchLoading}<div
						class="absolute inset-0 z-10 flex items-center justify-center bg-muted/40"
					>
						<Loader2 class="h-6 w-6 animate-spin" />
					</div>{/if}

				<div
					bind:this={scrollContainer}
					onscroll={() => {
						if (scrollContainer) scrollTop = scrollContainer.scrollTop;
					}}
					class="h-full overflow-y-auto bg-muted/20 p-3"
				>
					{#await data.streamed}
						<div class="flex flex-wrap gap-2 sm:gap-3">
							{#each Array(12) as _}<Skeleton
									class="h-32 max-w-[360px] min-w-[240px] flex-1 rounded-xl"
								/>{/each}
						</div>
					{:then _}
						{#if displayedProducts.length === 0}
							<div class="flex h-full flex-col items-center justify-center text-muted-foreground">
								<Package class="mb-3 h-12 w-12 opacity-20" />
								<p class="text-sm">No products found</p>
							</div>
						{:else}
							<div class="flex flex-wrap gap-2 sm:gap-3">
								{#each displayedProducts as variant (variant.id)}
									{@const cartQty = cart.items.find(i => i.variantId === variant.id)?.quantity ?? 0}
									{@const availableStock = variant.stockQuantity - cartQty}
									<button
										onclick={() => handleAddToCart(variant)}
										disabled={availableStock <= 0}
										class="group relative flex max-w-[360px] min-w-[240px] flex-1 cursor-pointer flex-col rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
									>
										<div class="absolute top-2 right-2">
											<Badge variant={availableStock <= 5 ? 'destructive' : 'secondary'}
												>{availableStock}</Badge
											>
										</div>
										<h3 class="mb-1 line-clamp-2 text-sm font-semibold">{variant.productName}</h3>
										<span class="text-[10px] font-bold text-muted-foreground uppercase"
											>{variant.size}</span
										>
										<div class="mt-auto flex items-center justify-between pt-2">
											<span class="text-lg font-black text-primary"
												>{formatCurrency(variant.price * (1 - (variant.discount || 0) / 100))}</span
											>
											{#if variant.discount}<Badge variant="outline" class="text-[10px]"
													>-{variant.discount}%</Badge
												>{/if}
										</div>
									</button>
								{/each}
							</div>
							{#if hasMore}<div class="flex justify-center py-4">
									<Button variant="outline" disabled={loadingMore} onclick={loadMore}
										>{#if loadingMore}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}Load More</Button
									>
								</div>{/if}
						{/if}
					{/await}
				</div>
			</div>
		</div>

		<!-- Right: Cart -->
		<div
			class="flex w-full flex-col border-l bg-card md:w-[400px] {activeMobileTab === 'cart'
				? 'flex'
				: 'hidden md:flex'}"
		>
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div class="flex items-center gap-2">
					<ShoppingCart class="h-4 w-4" /><span class="font-bold">Cart</span>
				</div>
				{#if cart.items.length > 0}<button
						onclick={() => cart.clear()}
						class="text-xs text-muted-foreground hover:text-destructive">Clear All</button
					>{/if}
			</div>

			<ScrollArea class="flex-1 px-3 py-2">
				<div class="space-y-2">
					{#each cart.items as item (item.variantId)}
						<div class="space-y-2 rounded-lg border p-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0 flex-1">
									<h4 class="truncate text-sm font-medium">{item.productName}</h4>
									<p class="text-[10px] text-muted-foreground">
										{item.size}{item.color ? ` / ${item.color}` : ''}
									</p>
								</div>
								<button
									onclick={() => cart.removeItem(item.variantId)}
									class="text-muted-foreground hover:text-destructive"><X class="h-4 w-4" /></button
								>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1 rounded border px-1.5 py-0.5">
									<span class="text-[9px] text-muted-foreground">Disc</span>
									<input
										type="number"
										placeholder="0"
										class="w-10 [appearance:textfield] border-0 bg-transparent p-0 text-center text-xs focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
										value={item.discount}
										oninput={(e) =>
											cart.updateItemDiscount(
												item.variantId,
												e.currentTarget.value === '' ? null : Number(e.currentTarget.value)
											)}
									/>
									<span class="text-[9px] text-muted-foreground">%</span>
								</div>
								<div class="flex items-center gap-2">
									<button
										onclick={() => cart.updateQuantity(item.variantId, item.quantity - 1)}
										class="flex h-6 w-6 items-center justify-center rounded border hover:bg-muted"
										>-</button
									>
									<span class="w-4 text-center text-xs font-bold">{item.quantity}</span>
									<button
										onclick={() => cart.updateQuantity(item.variantId, item.quantity + 1)}
										class="flex h-6 w-6 items-center justify-center rounded border hover:bg-muted"
										disabled={item.quantity >= item.maxStock}>+</button
									>
								</div>
								<span class="text-sm font-bold"
									>{formatCurrency(
										item.price * item.quantity * (1 - (item.discount ?? 0) / 100)
									)}</span
								>
							</div>
						</div>
					{/each}
				</div>
			</ScrollArea>

			<!-- Footer -->
			<div class="space-y-3 border-t p-3">
				<!-- Customer -->
				{#await data.streamed}
					<Skeleton class="h-10 w-full" />
				{:then streamed}
					<div class="relative">
						{#if cart.customer}
							<div class="flex items-center justify-between rounded border bg-muted/30 px-3 py-1.5">
								<div class="min-w-0">
									<span class="block truncate text-xs font-bold">{cart.customer.name}</span><span
										class="text-[10px] text-muted-foreground">{cart.customer.phone}</span
									>
								</div>
								<button onclick={() => cart.setCustomer(null)}><X class="h-4 w-4" /></button>
							</div>
						{:else}
							<Input
								placeholder="Customer search..."
								class="h-9 text-xs"
								bind:value={customerSearch}
								onfocus={() => (showCustomerResults = true)}
								onblur={() => setTimeout(() => (showCustomerResults = false), 200)}
							/>
							{#if showCustomerResults && customerSearch.length >= 2}
								<div
									class="absolute right-0 bottom-full left-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-xl"
								>
									{#each streamed.customers.filter((c: any) => c.phone?.includes(customerSearch) || c.name
												.toLowerCase()
												.includes(customerSearch.toLowerCase())) as c}
										<button
											class="w-full px-3 py-2 text-left text-xs hover:bg-accent"
											onmousedown={(e) => {
												e.preventDefault();
												cart.setCustomer(c);
												customerSearch = '';
												showCustomerResults = false;
											}}
										>
											<div class="font-bold">{c.name}</div>
											<div class="text-[10px] text-muted-foreground">{c.phone}</div>
										</button>
									{/each}
									<div class="border-t p-1">
										<button
											class="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] font-bold text-primary hover:bg-accent"
											onmousedown={(e) => {
												e.preventDefault();
												customerDialogOpen = true;
												showCustomerResults = false;
											}}><UserPlus class="h-3 w-3" /> Create new customer</button
										>
									</div>
								</div>
							{/if}
						{/if}
					</div>
				{/await}

				<div class="flex items-center justify-between text-sm">
					<span class="text-muted-foreground">Order Discount</span>
					<div class="flex items-center gap-1 rounded border px-2 py-0.5">
						<input
							type="number"
							placeholder="0"
							class="w-12 [appearance:textfield] border-0 bg-transparent p-0 text-right text-xs focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none"
							bind:value={
								() => cart.globalDiscount,
								(v) => (cart.globalDiscount = v === null || (v as any) === '' ? null : Number(v))
							}
						/><span>%</span>
					</div>
				</div>
				<div class="flex items-center justify-between rounded bg-primary/5 px-3 py-2">
					<span class="font-bold">Total</span>
					<span class="text-2xl font-black text-primary">{formatCurrency(cart.subtotal)}</span>
				</div>
				<Button
					class="h-14 w-full text-lg font-bold"
					disabled={cart.items.length === 0}
					onclick={async () => {
						if (!cart.customer && !(await confirmState.confirm({
							title: 'Walk-in Sale',
							message: 'Proceed without a customer profile?',
							confirmText: 'Continue',
							variant: 'default'
						}))) return;
						checkoutOpen = true;
					}}>Charge {formatCurrency(cart.subtotal)}</Button
				>
			</div>
		</div>
	</div>
</div>

<!-- Checkout Dialog -->
<Dialog.Root bind:open={checkoutOpen} onOpenChange={(open) => {
	if (open) cart.cashReceived = 0;
}}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header
			><Dialog.Title>Complete Payment</Dialog.Title><Dialog.Description
				>Total: <span class="font-bold text-primary">{formatCurrency(cart.subtotal)}</span
				></Dialog.Description
			></Dialog.Header
		>
		<div class="grid grid-cols-2 gap-2 py-4">
			<button
				onclick={() => (cart.paymentMethod = 'cash')}
				class="flex flex-col items-center gap-2 rounded-xl border-2 p-4 {cart.paymentMethod ===
				'cash'
					? 'border-primary bg-primary/5'
					: ''}"><Banknote class="h-6 w-6" /><span>Cash</span></button
			>
			<button
				onclick={() => (cart.paymentMethod = 'card')}
				class="flex flex-col items-center gap-2 rounded-xl border-2 p-4 {cart.paymentMethod ===
				'card'
					? 'border-primary bg-primary/5'
					: ''}"><CreditCard class="h-6 w-6" /><span>Card</span></button
			>
		</div>
		{#if cart.paymentMethod === 'cash'}
			<div class="space-y-4">
				<div class="space-y-2">
					<Label>Cash Received</Label><Input
						type="number"
						class="h-14 text-center text-2xl font-bold"
						placeholder="0"
						value={cart.cashReceived || ''}
						oninput={(e) => (cart.cashReceived = Number(e.currentTarget.value))}
					/>
				</div>
				<div class="grid grid-cols-4 gap-2">
					{#each [100, 500, 1000, 2000] as a}<Button
							variant="outline"
							onclick={() => (cart.cashReceived += a)}>+{a}</Button
						>{/each}
				</div>
				{#if cart.cashReceived > 0}<div
						class="flex items-center justify-between rounded-xl bg-emerald-50 p-4"
					>
						<span class="font-bold text-emerald-700">Change:</span><span
							class="text-2xl font-black text-emerald-600">{formatCurrency(cart.changeAmount)}</span
						>
					</div>{/if}
			</div>
		{/if}
		<Dialog.Footer
			><form
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
				<input type="hidden" name="cartItems" value={JSON.stringify(cart.items)} /><input
					type="hidden"
					name="customerId"
					value={cart.customer?.id ?? ''}
				/><input type="hidden" name="paymentMethod" value={cart.paymentMethod} /><input
					type="hidden"
					name="cashReceived"
					value={cart.cashReceived}
				/><input type="hidden" name="globalDiscount" value={cart.globalDiscount ?? 0} /><Button
					type="submit"
					class="h-14 w-full text-lg"
					disabled={loading || (cart.paymentMethod === 'cash' && cart.cashReceived < cart.subtotal)}
					>{loading ? 'Processing...' : 'Complete Sale'}</Button
				>
			</form></Dialog.Footer
		>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={customerDialogOpen}>
	<Dialog.Content
		><Dialog.Header><Dialog.Title>Add New Customer</Dialog.Title></Dialog.Header>
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
			<div><Label>Name</Label><Input name="name" required /></div>
			<div><Label>Phone</Label><Input name="phone" value={customerSearch} /></div>
			<Button type="submit" class="w-full" disabled={loading}>Add Customer</Button>
		</form></Dialog.Content
	>
</Dialog.Root>

{#if completedOrder}
	<Dialog.Root open onOpenChange={() => (completedOrder = null)}>
		<Dialog.Content class="space-y-6 py-10 text-center">
			<div class="flex flex-col items-center gap-2">
				<div class="rounded-full bg-emerald-100 p-4">
					<ShoppingCart class="h-8 w-8 text-emerald-600" />
				</div>
				<div class="text-4xl font-black">{formatCurrency(completedOrder.total)}</div>
			</div>
			{#if completedOrder.changeGiven > 0}<div
					class="rounded-xl bg-amber-50 p-4 text-xl font-bold text-amber-600"
				>
					Change: {formatCurrency(completedOrder.changeGiven)}
				</div>{/if}
			<div class="flex gap-2">
				<Button class="h-14 flex-1" onclick={() => handlePrintReceipt(true)}
					><Printer class="mr-2 h-5 w-5" /> Print</Button
				><Button variant="outline" class="h-14 flex-1" onclick={() => (completedOrder = null)}
					>Done</Button
				>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}

<style>
	:global(.scrollbar-none::-webkit-scrollbar) {
		display: none;
	}
	:global(.scrollbar-none) {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
