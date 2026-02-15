<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
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
		ScanBarcode
	} from '@lucide/svelte';
	import { formatBDT } from '$lib/format';
	import { cart } from '$lib/stores/cart.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { toast } from 'svelte-sonner';
	import { browser } from '$app/environment';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();

	let searchQuery = $state('');
	let selectedCategory = $state('All');
	let checkoutOpen = $state(false);
	let customerDialogOpen = $state(false);
	let loading = $state(false);

	let lastHandledAction = $state<string | null>(null);

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

	let completedOrder = $state<{
		orderId: string;
		orderNumber: number;
		changeGiven: number;
		items: any[];
		total: number;
		cashReceived: number;
	} | null>(null);

	// Extract unique categories from products
	const categories = $derived(() => {
		const cats = new Set<string>();
		data.products.forEach((p: any) => {
			if (p.category) cats.add(p.category);
		});
		return ['All', ...Array.from(cats).sort()];
	});

	const filteredProducts = $derived(
		data.products.filter((p: any) => {
			const matchesSearch =
				!searchQuery ||
				p.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.barcode.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesCategory =
				selectedCategory === 'All' || p.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);

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

	// Barcode scanning logic
	let barcodeBuffer = $state('');
	let barcodeTimeout: any;

	$effect(() => {
		if (!browser) return;

		function handleKeydown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

			if (e.key === 'Enter' && barcodeBuffer.length > 3) {
				const variant = data.products.find((p: any) => p.barcode === barcodeBuffer);
				if (variant) {
					handleAddToCart(variant);
					playBeep();
					toast.success(`Added ${variant.productName}`);
				} else {
					toast.error('Product not found: ' + barcodeBuffer);
				}
				barcodeBuffer = '';
				return;
			}

			if (e.key.length === 1) {
				barcodeBuffer += e.key;
				clearTimeout(barcodeTimeout);
				barcodeTimeout = setTimeout(() => {
					barcodeBuffer = '';
				}, 100);
			}
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function playBeep() {
		try {
			const ctx = new window.AudioContext();
			const osc = ctx.createOscillator();
			osc.frequency.value = 1200;
			osc.connect(ctx.destination);
			osc.start();
			osc.stop(ctx.currentTime + 0.1);
		} catch {
			/* ignore audio errors */
		}
	}

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
		if (form?.error) {
			toast.error(form.error);
		}
	});

	let activeMobileTab = $state<'products' | 'cart'>('products');

	function handlePrintReceipt() {
		if (!completedOrder) return;
		const o = completedOrder;
		printReceipt({
			storeSettings: data.storeSettings,
			orderId: '#' + o.orderNumber,
			orderUuid: o.orderId,
			date: new Date().toLocaleString('en-GB'),
			cashier: data.user?.name ?? '',
			items: o.items.map((item) => ({
				name: item.productName,
				variant: item.size + (item.color ? ' / ' + item.color : ''),
				qty: item.quantity,
				total: item.price * item.quantity * (1 - item.discount / 100)
			})),
			total: o.total,
			cashReceived: o.cashReceived,
			changeGiven: o.changeGiven,
			footerNote: 'Printed on ' + new Date().toLocaleString()
		});
	}
</script>

<svelte:head>
	<title>Point of Sale — Clothing POS</title>
</svelte:head>

<div class="flex flex-col h-[calc(100vh-3rem)] md:h-screen">
	<!-- Mobile Tab Switcher -->
	<div class="flex border-b bg-card md:hidden">
		<button
			onclick={() => (activeMobileTab = 'products')}
			class="flex-1 py-3 text-sm font-bold transition-all border-b-2 
				{activeMobileTab === 'products' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}"
		>
			Products ({filteredProducts.length})
		</button>
		<button
			onclick={() => (activeMobileTab = 'cart')}
			class="flex-1 py-3 text-sm font-bold transition-all border-b-2 relative
				{activeMobileTab === 'cart' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}"
		>
			Cart
			{#if cart.totalItems > 0}
				<Badge class="ml-1.5 h-5 min-w-5 rounded-full px-1">{cart.totalItems}</Badge>
			{/if}
		</button>
	</div>

	<div class="flex flex-1 overflow-hidden">
		<!-- Left Side: Products -->
		<div class="flex flex-1 flex-col overflow-hidden {activeMobileTab === 'products' ? 'flex' : 'hidden md:flex'}">
			<!-- Search Bar -->
			<div class="border-b bg-card px-4 pt-3 pb-2">
				<div class="relative">
					<Search class="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
					<Input
						placeholder="Search products or scan barcode..."
						class="h-12 border-0 bg-muted/30 pl-11 pr-16 text-base focus-visible:ring-2 focus-visible:ring-primary"
						bind:value={searchQuery}
						autofocus
					/>
					<div class="absolute top-1/2 right-3 -translate-y-1/2 flex items-center gap-2">
						{#if searchQuery}
							<button
								onclick={() => (searchQuery = '')}
								class="cursor-pointer text-muted-foreground hover:text-foreground"
								title="Clear search"
							>
								<X class="h-5 w-5" />
							</button>
						{/if}
						<div class="text-muted-foreground/40">
							<ScanBarcode class="h-5 w-5" />
						</div>
					</div>
				</div>

				<!-- Category Tabs -->
				<div class="mt-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
					{#each categories() as cat}
						<button
							onclick={() => (selectedCategory = cat)}
							class="shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-medium transition-all
								{selectedCategory === cat
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'}"
						>
							{cat}
						</button>
					{/each}
				</div>
			</div>

			<!-- Product Grid -->
			<div class="flex-1 min-h-0 overflow-hidden">
				<ScrollArea class="h-full bg-muted/20 p-3">
					<div class="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
						{#each filteredProducts as variant}
							<button
								onclick={() => {
									handleAddToCart(variant);
								}}
								class="group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card p-2.5 sm:p-3.5
									text-left transition-all hover:border-primary/50
									hover:shadow-lg hover:shadow-primary/10 active:scale-[0.97]"
							>
								<!-- Stock Badge -->
								<div class="absolute top-2 right-2 z-10">
									{#if variant.stockQuantity <= 3}
										<Badge class="bg-red-500 px-1 text-[9px] sm:px-1.5 sm:text-[10px] text-white"
											>{variant.stockQuantity}</Badge
										>
									{:else if variant.stockQuantity <= 10}
										<Badge class="bg-amber-500 px-1 text-[9px] sm:px-1.5 sm:text-[10px] text-white"
											>{variant.stockQuantity}</Badge
										>
									{:else}
										<Badge class="bg-emerald-500 px-1 text-[9px] sm:px-1.5 sm:text-[10px] text-white"
											>{variant.stockQuantity}</Badge
										>
									{/if}
								</div>

								<!-- Product info -->
								<h3 class="mb-1 line-clamp-2 text-xs sm:text-sm leading-tight font-semibold">
									{variant.productName}
								</h3>

								<!-- Size & Color -->
								<div class="mb-2 sm:mb-3 flex items-center gap-1.5">
									<span class="rounded bg-muted px-1 py-0.5 text-[10px] sm:text-[11px] font-medium text-muted-foreground">
										{variant.size}
									</span>
								</div>

								<!-- Price -->
								<div class="mt-auto">
									<span class="text-base sm:text-lg font-black text-primary">{formatBDT(variant.price)}</span>
								</div>

								<!-- Hover overlay -->
								<div
									class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-xl bg-primary/5 opacity-0 transition-opacity group-hover:opacity-100"
								>
									<div class="rounded-full bg-primary/10 p-2">
										<Plus class="h-5 w-5 text-primary" />
									</div>
								</div>
							</button>
						{/each}
					</div>

					{#if filteredProducts.length === 0}
						<div class="flex h-64 flex-col items-center justify-center text-muted-foreground">
							<Package class="mb-3 h-12 w-12 opacity-20" />
							<p class="text-sm">No products found</p>
							<p class="text-xs">Try a different search term or category</p>
						</div>
					{/if}
				</ScrollArea>
			</div>
		</div>

		<!-- Right Side: Cart Panel -->
		<div class="flex w-full flex-col border-l bg-card md:w-[400px] lg:w-[420px] {activeMobileTab === 'cart' ? 'flex' : 'hidden md:flex'}">
			<!-- Cart Header -->
			<div class="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<div class="rounded-lg bg-primary/20 p-1.5">
							<ShoppingCart class="h-4 w-4 text-primary" />
						</div>
						<span class="text-sm font-semibold">Cart</span>
						{#if cart.totalItems > 0}
							<Badge class="rounded-full bg-primary px-2 text-[10px] text-primary-foreground"
								>{cart.totalItems}</Badge
							>
						{/if}
					</div>
					{#if cart.items.length > 0}
						<button
							onclick={() => cart.clear()}
							class="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-destructive"
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
					{@const lineTotal = item.price * item.quantity * (1 - item.discount / 100)}
					<div class="rounded-lg border bg-muted/30 p-3 transition-colors hover:bg-muted/50">
						<!-- Top row: name, variant, remove -->
						<div class="mb-2 flex items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<h4 class="truncate text-sm font-medium">{item.productName}</h4>
								<p class="text-xs text-muted-foreground">
									{item.size}{item.color ? ` / ${item.color}` : ''} — {formatBDT(item.price)} each
								</p>
							</div>
							<button
								onclick={() => cart.removeItem(item.variantId)}
								class="mt-0.5 shrink-0 cursor-pointer p-0.5 text-muted-foreground transition-colors hover:text-destructive"
							>
								<X class="h-4 w-4" />
							</button>
						</div>

						<!-- Bottom row: discount, qty, line total -->
						<div class="flex items-center gap-3">
							<!-- Discount input -->
							<div class="flex items-center gap-1 rounded-md border bg-card px-2 py-1">
								<span class="text-[10px] text-muted-foreground">Disc</span>
								<input
									type="number"
									min="0"
									max="100"
									class="h-5 w-10 border-0 bg-transparent p-0 text-center text-xs focus:ring-0"
									value={item.discount}
									oninput={(e) =>
										cart.updateItemDiscount(
											item.variantId,
											parseFloat(e.currentTarget.value) || 0
										)}
								/>
								<span class="text-[10px] text-muted-foreground">%</span>
							</div>

							<!-- Qty controls -->
							<div class="flex items-center">
								<button
									onclick={() => cart.updateQuantity(item.variantId, item.quantity - 1)}
									class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-l-md border bg-card hover:bg-muted"
								>
									<Minus class="h-3 w-3" />
								</button>
								<span
									class="flex h-7 w-8 items-center justify-center border-y bg-card text-xs font-bold"
									>{item.quantity}</span
								>
								<button
									onclick={() => cart.updateQuantity(item.variantId, item.quantity + 1)}
									class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-r-md border bg-card hover:bg-muted"
									disabled={item.quantity >= item.maxStock}
								>
									<Plus class="h-3 w-3" />
								</button>
							</div>

							<!-- Line total -->
							<div class="ml-auto text-right">
								<span class="text-sm font-bold text-primary">{formatBDT(lineTotal)}</span>
							</div>
						</div>
					</div>
				{/each}

				{#if cart.items.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
						<ShoppingCart class="mb-3 h-10 w-10 opacity-15" />
						<p class="text-sm font-medium">Cart is empty</p>
						<p class="text-xs">Select products from the left</p>
					</div>
				{/if}
			</div>
		</ScrollArea>

		<!-- Sticky Cart Footer -->
		<div class="space-y-3 border-t bg-card p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
			<!-- Customer Search -->
			<div class="relative w-full">
				<div class="flex items-center gap-2">
					{#if cart.customer}
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
						<div class="relative flex-1">
							<Input
								placeholder="Customer (phone or name)..."
								class="h-8 pr-8 text-xs"
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
							class="h-8 w-8 shrink-0 cursor-pointer"
							onclick={() => (customerDialogOpen = true)}
						>
							<UserPlus class="h-3.5 w-3.5" />
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
									onmousedown={(e) => {
										e.preventDefault();
										cart.setCustomer({
											id: customer.id,
											name: customer.name,
											phone: customer.phone
										});
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
										<div class="text-[10px] text-muted-foreground">
											{customer.phone || 'No phone'}
										</div>
									</div>
								</button>
							{/each}
						{:else}
							<div class="p-3 text-center">
								<p class="mb-2 text-xs text-muted-foreground">
									No customer found for "{customerSearch}"
								</p>
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
									<UserPlus class="mr-1 h-3 w-3" />
									Create New Customer
								</Button>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Discount + Total -->
			<div class="space-y-1.5">
				<div class="flex items-center justify-between text-xs">
					<span class="text-muted-foreground">Order Discount</span>
					<div class="flex items-center gap-1">
						<Input
							type="number"
							min="0"
							max="100"
							class="h-7 w-14 text-right text-xs"
							bind:value={() => cart.globalDiscount, (v) => (cart.globalDiscount = Number(v))}
						/>
						<span class="text-muted-foreground">%</span>
					</div>
				</div>
				<div class="flex items-center justify-between rounded-lg bg-primary/5 px-4 py-3">
					<span class="text-sm font-semibold">Total</span>
					<span class="text-2xl font-black text-primary">{formatBDT(cart.subtotal)}</span>
				</div>
			</div>

			<!-- Charge Button -->
			<Button
				class="h-14 w-full cursor-pointer bg-gradient-to-r from-primary to-primary/80 text-lg font-bold shadow-lg shadow-primary/25 hover:from-primary/90 hover:to-primary/70"
				disabled={cart.items.length === 0}
				onclick={async () => {
					if (!cart.customer) {
						const confirmed = await confirmState.confirm({
							title: 'Walk-in Sale',
							message:
								'No customer is selected. Proceeding will record this as a walk-in sale.',
							confirmText: 'Proceed to Payment',
							cancelText: 'Cancel',
							variant: 'default'
						});
						if (!confirmed) return;
					}
					checkoutOpen = true;
				}}
			>
				<ShoppingCart class="mr-2 h-5 w-5" />
				Charge {formatBDT(cart.subtotal)}
			</Button>
		</div>
	</div>
</div>
</div>

<!-- Checkout Dialog -->
<Dialog.Root bind:open={checkoutOpen}>
	<Dialog.Content class="max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-xl">Complete Payment</Dialog.Title>
			<Dialog.Description>
				Total: <span class="text-lg font-bold text-primary">{formatBDT(cart.subtotal)}</span>
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-6 py-4">
			<!-- Payment Method Buttons -->
			<div class="grid grid-cols-2 gap-3">
				<button
					onclick={() => (cart.paymentMethod = 'cash')}
					class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all
            {cart.paymentMethod === 'cash'
						? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10'
						: 'border-muted hover:border-muted-foreground/30'}"
				>
					<div
						class="rounded-full p-3 {cart.paymentMethod === 'cash'
							? 'bg-emerald-100 dark:bg-emerald-500/20'
							: 'bg-muted'}"
					>
						<Banknote
							class="h-6 w-6 {cart.paymentMethod === 'cash'
								? 'text-emerald-600 dark:text-emerald-400'
								: 'text-muted-foreground'}"
						/>
					</div>
					<span
						class="text-sm font-semibold {cart.paymentMethod === 'cash'
							? 'text-emerald-700 dark:text-emerald-400'
							: ''}">Cash</span
					>
				</button>
				<button
					onclick={() => (cart.paymentMethod = 'card')}
					class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-5 transition-all
            {cart.paymentMethod === 'card'
						? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
						: 'border-muted hover:border-muted-foreground/30'}"
				>
					<div
						class="rounded-full p-3 {cart.paymentMethod === 'card'
							? 'bg-blue-100 dark:bg-blue-500/20'
							: 'bg-muted'}"
					>
						<CreditCard
							class="h-6 w-6 {cart.paymentMethod === 'card'
								? 'text-blue-600 dark:text-blue-400'
								: 'text-muted-foreground'}"
						/>
					</div>
					<span
						class="text-sm font-semibold {cart.paymentMethod === 'card'
							? 'text-blue-700 dark:text-blue-400'
							: ''}">Card</span
					>
				</button>
			</div>

			{#if cart.paymentMethod === 'cash'}
				<div class="space-y-4">
					<div class="space-y-2">
						<Label for="cashReceived" class="text-sm">Cash Received (৳)</Label>
						<Input
							id="cashReceived"
							type="number"
							class="h-14 text-center text-2xl font-bold"
							bind:value={() => cart.cashReceived, (v) => (cart.cashReceived = Number(v))}
						/>
					</div>
					<div class="grid grid-cols-4 gap-2">
						{#each [100, 500, 1000, 2000] as amount}
							<Button
								variant="outline"
								class="cursor-pointer text-sm font-semibold"
								onclick={() => (cart.cashReceived = amount)}
							>
								৳{amount}
							</Button>
						{/each}
					</div>
					<Button
						variant="outline"
						class="w-full cursor-pointer"
						onclick={() => (cart.cashReceived = cart.subtotal)}
					>
						Exact Amount ({formatBDT(cart.subtotal)})
					</Button>
					{#if cart.cashReceived > 0}
						<div
							class="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10"
						>
							<span class="font-semibold text-emerald-700 dark:text-emerald-400">Change:</span>
							<span class="text-2xl font-black text-emerald-600 dark:text-emerald-400"
								>{formatBDT(cart.changeAmount)}</span
							>
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
					class="h-14 w-full cursor-pointer bg-gradient-to-r from-emerald-600 to-emerald-500 text-lg font-bold text-white shadow-lg hover:from-emerald-500 hover:to-emerald-400"
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
				<Input
					id="cust-phone"
					name="phone"
					placeholder="e.g. 017..."
					value={customerSearch || ''}
				/>
			</div>
			<Button type="submit" class="w-full cursor-pointer" disabled={loading}>
				{loading ? 'Adding...' : 'Add Customer'}
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Success / Receipt Print Dialog -->
{#if completedOrder}
	<Dialog.Root open={!!completedOrder} onOpenChange={() => (completedOrder = null)}>
		<Dialog.Content>
			<Dialog.Header>
				<Dialog.Title class="text-center text-2xl">
					<span class="text-emerald-600 dark:text-emerald-400">Sale Successful!</span>
				</Dialog.Title>
				<Dialog.Description class="text-center">
					Order #{completedOrder.orderNumber}
				</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-6 py-6 text-center">
				<div class="flex flex-col items-center gap-2">
					<div class="mb-2 rounded-full bg-emerald-100 p-4 dark:bg-emerald-500/20">
						<ShoppingCart class="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div class="text-sm text-muted-foreground">Total Amount</div>
					<div class="text-4xl font-black">{formatBDT(completedOrder.total)}</div>
				</div>
				{#if completedOrder.changeGiven > 0}
					<div
						class="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
					>
						<div class="text-sm font-medium text-amber-700 dark:text-amber-400">Change to give</div>
						<div class="text-2xl font-bold text-amber-600 dark:text-amber-400">
							{formatBDT(completedOrder.changeGiven)}
						</div>
					</div>
				{/if}
				<div class="flex gap-3">
					<Button
						class="h-14 flex-1 cursor-pointer bg-gradient-to-r from-primary to-primary/80"
						onclick={handlePrintReceipt}
					>
						<Printer class="mr-2 h-5 w-5" />
						Print Receipt
					</Button>
					<Button
						variant="outline"
						class="h-14 flex-1 cursor-pointer"
						onclick={() => (completedOrder = null)}
					>
						Done
					</Button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Root>
{/if}
