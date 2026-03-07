<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Separator } from '$lib/components/ui/separator';
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
	import { APP_NAME } from '$lib/constants';

	import { productsStore, categoriesStore } from '$lib/powersync-queries';
	import { powersync } from '$lib/powersync.svelte';

	let { data, form } = $props();
	const isNative = $derived(browser && (window as any).electron);

	let searchQuery = $state('');
	let selectedCategory = $state('All');

	let checkoutOpen = $state(false);
	let customerDialogOpen = $state(false);
	let loading = $state(false);

	let completedOrder = $state<any>(null);
	let searchLoading = $state(false);
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);

	// --- Data Source Management ---
	let allProducts = $state<any[]>([]);
	let categories = $state<string[]>(['All']);

	// Native Mode: Subscribe to PowerSync
	$effect(() => {
		if (isNative) {
			const unsubProducts = productsStore.subscribe(v => allProducts = v);
			const unsubCats = categoriesStore.subscribe(v => categories = ['All', ...v.map((c: any) => c.category).sort()]);
			return () => { unsubProducts(); unsubCats(); };
		} else {
			// Web Mode: Use server-side streamed data
			data.streamed.then((s: any) => {
				allProducts = s.products;
				categories = s.categories;
			});
		}
	});

	// Filtered products logic (Shared between modes)
	let displayedProducts = $derived(
		allProducts.filter(p => {
			const name = p.productName || p.name; // Handle slight naming diffs between DB and Sync
			const matchesSearch = !searchQuery || 
				name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.barcode.includes(searchQuery);
			const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);

	// --- Handlers ---
	function handleSearch(query: string) {
		searchQuery = query;
	}

	function handleCategoryChange(cat: string) {
		selectedCategory = cat;
	}

	function handleAddToCart(variant: any) {
		cart.addItem({
			variantId: variant.id,
			productId: variant.productId,
			productName: variant.productName || variant.name,
			size: variant.size,
			color: variant.color,
			barcode: variant.barcode,
			price: variant.price,
			costPrice: variant.costPrice || 0,
			discount: variant.discount || 0,
			maxStock: variant.stockQuantity
		});
	}

	let lastHandledAction = $state<string | null>(null);
	let customerSearch = $state('');
	let showCustomerResults = $state(false);
	let searchedCustomers = $state<any[]>([]);
	let customerSearchLoading = $state(false);

	let custSearchTimeout: any;
	function handleCustomerSearch(query: string) {
		customerSearch = query;
		if (query.length < 2) {
			searchedCustomers = [];
			return;
		}

		if (isNative) {
			// Local search in SQLite for Native App
			powersync.db.execute('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ?', [`%${query}%`, `%${query}%`])
				.then((res: any) => searchedCustomers = res.rows?._array || []);
		} else {
			// Server API search for Web App
			clearTimeout(custSearchTimeout);
			custSearchTimeout = setTimeout(async () => {
				customerSearchLoading = true;
				try {
					const res = await fetch(`/api/customers?search=${encodeURIComponent(query)}`);
					const json = await res.json();
					searchedCustomers = json.items || [];
				} finally {
					customerSearchLoading = false;
				}
			}, 300);
		}
	}

	// Native-only logic (PowerSync)
	async function handleLocalCheckout() {
		loading = true;
		try {
			const orderId = crypto.randomUUID();
			
			await powersync.db.execute(`
				INSERT INTO orders (
					id, customer_id, user_id, total_amount, payment_method, 
					discount_amount, cash_received, change_given, 
					cash_amount, card_amount, mobile_amount, mobile_method, mobile_trx_id,
					status, created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`, [
				orderId, 
				cart.customer?.id || null, 
				data.user?.id, 
				cart.subtotal, 
				cart.paymentMethod, 
				0, 
				cart.cashReceived, 
				cart.changeAmount,
				cart.paymentMethod === 'split' ? cart.cashAmount : (cart.paymentMethod === 'cash' ? cart.subtotal : 0),
				cart.paymentMethod === 'split' ? cart.cardAmount : (cart.paymentMethod === 'card' ? cart.subtotal : 0),
				cart.paymentMethod === 'mobile' ? cart.subtotal : 0,
				cart.paymentMethod === 'mobile' ? cart.mobileMethod : null,
				cart.paymentMethod === 'mobile' ? cart.mobileTrxId : null,
				'completed', 
				new Date().toISOString().replace('T', ' ').replace('.000Z', '+00')
			]);

			for (const item of cart.items) {
				const orderItemId = crypto.randomUUID();
				await powersync.db.execute(`
					INSERT INTO order_items (id, order_id, variant_id, quantity, price_at_sale, cost_at_sale, discount, product_name, variant_label, status)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`, [orderItemId, orderId, item.variantId, item.quantity, item.price, item.costPrice || 0, item.discount || 0, item.productName, `${item.size}${item.color ? ' / ' + item.color : ''}`, 'completed']);
				
				await powersync.db.execute('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?', [item.quantity, item.variantId]);

				// Log stock change locally
				await powersync.db.execute(`
					INSERT INTO stock_logs (id, variant_id, change_amount, reason, user_id, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
				`, [crypto.randomUUID(), item.variantId, -item.quantity, 'sale', data.user?.id, new Date().toISOString().replace('T', ' ').replace('.000Z', '+00')]);
			}

			// Add to cashbook locally
			await powersync.db.execute(`
				INSERT INTO cashbook (id, amount, type, description, user_id, created_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`, [crypto.randomUUID(), cart.subtotal, 'in', `Sale ${orderId.slice(0, 8).toUpperCase()}`, data.user?.id, new Date().toISOString().replace('T', ' ').replace('.000Z', '+00')]);

			completedOrder = {
				orderId,
				orderNumber: orderId.slice(0, 8).toUpperCase(),
				changeGiven: cart.changeAmount,
				items: [...cart.items],
				total: cart.subtotal,
				cashReceived: cart.cashReceived
			};
			cart.clear();
			checkoutOpen = false;
			toast.success('Sale completed offline!');
		} catch (e: any) {
			toast.error('Local checkout failed: ' + e.message);
		} finally {
			loading = false;
		}
	}

	async function handleLocalAddCustomer() {
		loading = true;
		try {
			const id = crypto.randomUUID();
			const nameInput = document.getElementById('new-customer-name') as HTMLInputElement;
			const phoneInput = document.getElementById('new-customer-phone') as HTMLInputElement;
			const name = nameInput?.value;
			const phone = phoneInput?.value;

			if (!name) return toast.error('Name is required');

			await powersync.db.execute('INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)', [id, name, phone]);
			cart.setCustomer({ id, name, phone });
			customerDialogOpen = false;
			toast.success('Customer added locally');
		} finally {
			loading = false;
		}
	}

	// Web-only logic (Form effects)
	$effect(() => {
		if (!isNative && form?.success) {
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
		if (!isNative && form?.error) toast.error(form.error);
	});

	let activeMobileTab = $state<'products' | 'cart'>('products');

	async function handlePrintReceipt(preview = true) {
		if (!completedOrder) return;
		let storeSettings: any = {};
		if (isNative) {
			try {
				const rows = await powersync.db.getAll('SELECT * FROM store_settings');
				for (const row of rows as any[]) storeSettings[row.key] = row.value;
			} catch {}
		} else {
			const s = await data.streamed;
			storeSettings = (s as any).storeSettings;
		}
		const result = await printReceipt({
			storeSettings,
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
		if (result && !result.success && result.error) {
			toast.error(result.error);
		}
	}
</script>

<svelte:head><title>POS — {APP_NAME}</title></svelte:head>

<div class="flex h-full flex-col overflow-hidden">
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
					{#each categories as cat}
						<button
							onclick={() => handleCategoryChange(cat)}
							class="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all {selectedCategory ===
							cat
								? 'bg-primary text-primary-foreground shadow-sm'
								: 'bg-muted/50 text-muted-foreground hover:bg-muted'}">{cat}</button
						>
					{/each}
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
					{#if displayedProducts.length === 0}
						<div class="flex h-full flex-col items-center justify-center text-muted-foreground">
							<Package class="mb-3 h-12 w-12 opacity-20" />
							<p class="text-sm">No products found</p>
						</div>
					{:else}
						<div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2 sm:gap-3">
							{#each displayedProducts as variant (variant.id)}
								{@const cartQty = cart.items.find(i => i.variantId === variant.id)?.quantity ?? 0}
								{@const availableStock = variant.stockQuantity - cartQty}
								<button
									onclick={() => handleAddToCart(variant)}
									disabled={availableStock <= 0}
									class="group relative flex w-full cursor-pointer flex-col rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed {cartQty > 0 ? 'border-primary ring-2 ring-primary/20' : ''}"
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
					{/if}
				</div>
			</div>
		</div>

		<!-- Right: Cart -->
		<div
			class="flex w-full flex-col overflow-hidden border-l bg-card md:w-[400px] {activeMobileTab === 'cart'
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

			<ScrollArea class="min-h-0 flex-1">
				<div class="space-y-2 px-3 py-2">
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
						<div class="relative">
							<Input
								placeholder="Customer search (name or phone)..."
								class="h-9 text-xs"
								value={customerSearch}
								oninput={(e) => handleCustomerSearch(e.currentTarget.value)}
								onfocus={() => (showCustomerResults = true)}
								onblur={() => setTimeout(() => (showCustomerResults = false), 200)}
							/>
							{#if customerSearchLoading}
								<div class="absolute right-3 top-1/2 -translate-y-1/2">
									<Loader2 class="h-3 w-3 animate-spin text-muted-foreground" />
								</div>
							{/if}
						</div>
						{#if showCustomerResults && (customerSearch.length >= 2 || searchedCustomers.length > 0)}
							<div
								class="absolute right-0 bottom-full left-0 z-50 mb-1 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-xl"
							>
								{#each searchedCustomers as c}
									<button
										class="w-full px-3 py-2 text-left text-xs hover:bg-accent"
										onmousedown={(e) => {
											e.preventDefault();
											cart.setCustomer(c);
											customerSearch = '';
											searchedCustomers = [];
											showCustomerResults = false;
										}}
									>
										<div class="font-bold">{c.name}</div>
										<div class="text-[10px] text-muted-foreground">{c.phone}</div>
									</button>
								{:else}
									{#if !customerSearchLoading && customerSearch.length >= 2}
										<div class="px-3 py-4 text-center text-xs text-muted-foreground">
											No customers found
										</div>
									{/if}
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
	<Dialog.Content class="max-w-md p-0 overflow-hidden">
		<Dialog.Header class="px-6 pt-6">
			<Dialog.Title>Complete Payment</Dialog.Title>
			<Dialog.Description>Select payment method and finalize the sale.</Dialog.Description>
		</Dialog.Header>

		<div class="px-6 py-4 space-y-6">
			<!-- Amount Display -->
			<div class="rounded-xl border bg-muted/30 p-4 flex justify-between items-center">
				<span class="text-sm font-medium text-muted-foreground">Total Amount</span>
				<span class="text-2xl font-bold text-primary">{formatCurrency(cart.subtotal)}</span>
			</div>

			<!-- Payment Method Selector -->
			<div class="grid grid-cols-2 gap-2">
				{#each [
					{ id: 'cash', icon: Banknote, label: 'Cash' },
					{ id: 'card', icon: CreditCard, label: 'Card' },
					{ id: 'split', icon: Users, label: 'Split Payment' },
					{ id: 'mobile', icon: ShoppingCart, label: 'Mobile Banking' }
				] as method}
					<button
						onclick={() => (cart.paymentMethod = method.id as any)}
						class="flex items-center gap-3 rounded-xl border px-4 py-3 transition-all {cart.paymentMethod === method.id
							? 'border-primary bg-primary/5 ring-1 ring-primary'
							: 'bg-card hover:border-primary/50'}"
					>
						<method.icon class="h-5 w-5 {cart.paymentMethod === method.id ? 'text-primary' : 'text-muted-foreground'}" />
						<span class="text-sm font-semibold">{method.label}</span>
					</button>
				{/each}
			</div>

			<!-- Details Section -->
			<div class="space-y-4">
				{#if cart.paymentMethod === 'cash'}
					<div class="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
						<div class="space-y-2">
							<div class="flex items-center justify-between">
								<Label class="text-xs font-semibold">Cash Received</Label>
								<button class="text-[10px] font-bold text-primary hover:underline" onclick={() => cart.exactAmount()}>Exact Amount</button>
							</div>
							<Input
								type="number"
								class="h-12 text-lg font-bold"
								placeholder="0.00"
								value={cart.cashReceived ?? ''}
								oninput={(e) => (cart.cashReceived = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
								onfocus={(e) => e.currentTarget.select()}
							/>
						</div>
						<div class="grid grid-cols-4 gap-2">
							{#each [100, 500, 1000, 2000] as a}
								<Button
									variant="outline"
									size="sm"
									class="h-9 font-bold"
									onclick={() => (cart.cashReceived = (cart.cashReceived ?? 0) + a)}>+{a}</Button>
							{/each}
						</div>
					</div>
				{:else if cart.paymentMethod === 'split'}
					<div class="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<Label class="text-xs font-semibold">Cash Part</Label>
								<Input 
									type="number" 
									value={cart.cashAmount ?? ''} 
									oninput={(e) => cart.cashAmount = e.currentTarget.value === '' ? null : Number(e.currentTarget.value)}
									onfocus={(e) => e.currentTarget.select()}
									class="font-bold"
								/>
							</div>
							<div class="space-y-1.5">
								<Label class="text-xs font-semibold">Card Part</Label>
								<Input 
									type="number" 
									value={cart.cardAmount ?? ''} 
									oninput={(e) => cart.cardAmount = e.currentTarget.value === '' ? null : Number(e.currentTarget.value)}
									onfocus={(e) => e.currentTarget.select()}
									class="font-bold"
								/>
							</div>
						</div>
						<div class="space-y-1.5 pt-1">
							<div class="flex items-center justify-between">
								<Label class="text-xs font-semibold">Cash Received</Label>
								<button class="text-[10px] font-bold text-primary hover:underline" onclick={() => cart.exactAmount()}>Exact Amount</button>
							</div>
							<Input 
								type="number" 
								value={cart.cashReceived ?? ''} 
								oninput={(e) => cart.cashReceived = e.currentTarget.value === '' ? null : Number(e.currentTarget.value)}
								onfocus={(e) => e.currentTarget.select()}
								class="h-11 font-bold border-primary/20"
								placeholder="Amount received..."
							/>
						</div>
					</div>
				{:else if cart.paymentMethod === 'mobile'}
					<div class="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
						<div class="grid grid-cols-3 gap-2">
							{#each ['bkash', 'nagad', 'rocket'] as m}
								<button 
									onclick={() => cart.mobileMethod = m as any}
									class="rounded-lg border py-2.5 text-xs font-bold transition-all {cart.mobileMethod === m ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary' : 'bg-background hover:bg-muted'}"
								>
									<span class="capitalize">{m}</span>
								</button>
							{/each}
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs font-semibold">Transaction ID (Optional)</Label>
							<Input 
								placeholder="Enter TrxID..." 
								class="font-mono uppercase"
								bind:value={() => cart.mobileTrxId, (v) => cart.mobileTrxId = v} 
							/>
						</div>
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center py-10 rounded-xl border-2 border-dashed bg-muted/30 animate-in fade-in slide-in-from-top-2 duration-200">
						<CreditCard class="h-10 w-10 text-muted-foreground/40 mb-3" />
						<p class="text-sm font-semibold text-muted-foreground">External Terminal</p>
						<p class="text-[10px] text-muted-foreground/60 mt-1 text-center px-6">Process on your card machine then click complete.</p>
					</div>
				{/if}
			</div>

			<!-- Change Result -->
			{#if (cart.paymentMethod === 'cash' || cart.paymentMethod === 'split') && (cart.cashReceived ?? 0) > 0}
				<div class="rounded-xl bg-emerald-50 border border-emerald-100 p-4 flex justify-between items-center animate-in zoom-in-95 duration-200">
					<div class="flex items-center gap-3">
						<div class="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
							<Banknote class="h-5 w-5 text-emerald-600" />
						</div>
						<span class="text-sm font-semibold text-emerald-700">Change to Return</span>
					</div>
					<span class="text-xl font-bold text-emerald-600">{formatCurrency(cart.changeAmount)}</span>
				</div>
			{/if}
		</div>

		<Dialog.Footer class="p-6 pt-0">
			{#if isNative}
				<Button
					onclick={handleLocalCheckout}
					class="h-12 w-full font-bold"
					disabled={loading || (cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) || (cart.paymentMethod === 'split' && (cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
				>
					{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					Complete Sale
				</Button>
			{:else}
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
					<input type="hidden" name="globalDiscount" value={cart.globalDiscount ?? 0} />
					
					{#if cart.paymentMethod === 'split'}
						<input type="hidden" name="cashAmount" value={cart.cashAmount} />
						<input type="hidden" name="cardAmount" value={cart.cardAmount} />
					{:else if cart.paymentMethod === 'mobile'}
						<input type="hidden" name="mobileMethod" value={cart.mobileMethod} />
						<input type="hidden" name="mobileTrxId" value={cart.mobileTrxId} />
					{/if}

					<Button
						type="submit"
						class="h-12 w-full font-bold"
						disabled={loading || (cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) || (cart.paymentMethod === 'split' && (cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
					>
						{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
						Complete Sale
					</Button>
				</form>
			{/if}
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={customerDialogOpen}>
	<Dialog.Content
		><Dialog.Header><Dialog.Title>Add New Customer</Dialog.Title></Dialog.Header>
		{#if isNative}
			<div class="space-y-4">
				<div><Label>Name</Label><Input id="new-customer-name" required /></div>
				<div><Label>Phone</Label><Input id="new-customer-phone" value={customerSearch} /></div>
				<Button onclick={handleLocalAddCustomer} class="w-full" disabled={loading}
					>{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}Add Customer (Offline)</Button
				>
			</div>
		{:else}
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
			</form>
		{/if}</Dialog.Content
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
