<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Sheet from '$lib/components/ui/sheet';
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
		ChevronUp,
		Smartphone
	} from '@lucide/svelte';
	import { formatCurrency, getCurrencySymbol, formatDateTime } from '$lib/format';
	import { cart } from '$lib/stores/cart.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { printerState } from '$lib/stores/printer.svelte';
	import { Bluetooth } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { isNative } from '$lib/electron-data.svelte';
	import { confirmState } from '$lib/confirm.svelte';
	import { fade } from 'svelte/transition';
	import { untrack } from 'svelte';
	import { APP_NAME } from '$lib/constants';
	import { generateId } from '$lib/utils';

	import { productsStore, categoriesStore } from '$lib/powersync-queries';
	import { powersync } from '$lib/powersync.svelte';

	let { data, form } = $props();

	let searchQuery = $state('');
	let selectedCategory = $state('All');

	let checkoutOpen = $state(false);
	let customerDialogOpen = $state(false);
	let loading = $state(false);

	let completedOrder = $state<any>(null);
	let searchLoading = $state(false);
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);

	// --- Variant Picker ---
	type ProductGroup = {
		productId: string;
		productName: string;
		category: string;
		variants: any[];
		totalStock: number;
		minPrice: number;
		maxPrice: number;
		maxDiscount: number;
	};
	let variantPickerProduct = $state<ProductGroup | null>(null);
	let variantPickerOpen = $state(false);
	let isMobile = $state(false);

	function updateIsMobile() {
		isMobile = window.innerWidth < 768;
	}

	$effect(() => {
		if (typeof window !== 'undefined') {
			updateIsMobile();
			window.addEventListener('resize', updateIsMobile);
			return () => window.removeEventListener('resize', updateIsMobile);
		}
	});

	// --- Data Source Management ---
	let allProducts = $state<any[]>([]);
	let categories = $state<string[]>(['All']);

	// Native Mode: Subscribe to PowerSync
	$effect(() => {
		if (isNative) {
			const unsubProducts = productsStore.subscribe((v) => (allProducts = v));
			const unsubCats = categoriesStore.subscribe(
				(v) => (categories = ['All', ...v.map((c: any) => c.category).sort()])
			);
			return () => {
				unsubProducts();
				unsubCats();
			};
		} else {
			// Web Mode: Use server-side streamed data
			data.streamed.then((s: any) => {
				allProducts = s.products;
				categories = s.categories;
			});
		}
	});

	// Filtered variants
	let filteredVariants = $derived(
		allProducts.filter((p) => {
			const name = p.productName || p.name;
			const matchesSearch =
				!searchQuery ||
				name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				p.barcode.includes(searchQuery);
			const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
			return matchesSearch && matchesCategory;
		})
	);

	// Group filtered variants by product
	let groupedProducts = $derived.by(() => {
		const map = new Map<string, ProductGroup>();
		for (const v of filteredVariants) {
			const pid = v.productId;
			if (!map.has(pid)) {
				map.set(pid, {
					productId: pid,
					productName: v.productName || v.name,
					category: v.category,
					variants: [],
					totalStock: 0,
					minPrice: Infinity,
					maxPrice: 0,
					maxDiscount: 0
				});
			}
			const group = map.get(pid)!;
			group.variants.push(v);
			group.totalStock += v.stockQuantity;
			const effectivePrice = v.price * (1 - (v.discount || 0) / 100);
			if (effectivePrice < group.minPrice) group.minPrice = effectivePrice;
			if (effectivePrice > group.maxPrice) group.maxPrice = effectivePrice;
			if ((v.discount || 0) > group.maxDiscount) group.maxDiscount = v.discount || 0;
		}
		return [...map.values()];
	});

	// --- Handlers ---
	function handleSearch(query: string) {
		searchQuery = query;
	}

	function handleCategoryChange(cat: string) {
		selectedCategory = cat;
	}

	function handleProductClick(product: ProductGroup) {
		if (product.variants.length === 1) {
			handleAddToCart(product.variants[0]);
		} else {
			variantPickerProduct = product;
			variantPickerOpen = true;
		}
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

	function handleVariantSelect(variant: any) {
		handleAddToCart(variant);
		variantPickerOpen = false;
		variantPickerProduct = null;
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
			powersync.db
				.execute('SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ?', [
					`%${query}%`,
					`%${query}%`
				])
				.then((res: any) => (searchedCustomers = res.rows?._array || []));
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
		console.log('[POS] Starting local checkout...');
		try {
			const orderId = generateId();
			const now = new Date().toISOString();

			console.log(`[POS] Inserting order: ${orderId}, Time: ${now}`);
			const orderResult = await powersync.db.execute(
				`
				INSERT INTO orders (
					id, customer_id, user_id, total_amount, payment_method,
					discount_amount, cash_received, change_given,
					cash_amount, card_amount, mobile_amount, mobile_method, mobile_trx_id,
					card_type, card_ref,
					status, created_at
				)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
				[
					orderId,
					cart.customer?.id || null,
					data.user?.id,
					cart.subtotal,
					cart.paymentMethod,
					0,
					cart.cashReceived,
					cart.changeAmount,
					cart.paymentMethod === 'split'
						? cart.cashAmount
						: cart.paymentMethod === 'cash'
							? cart.subtotal
							: 0,
					cart.paymentMethod === 'split'
						? cart.cardAmount
						: cart.paymentMethod === 'card'
							? cart.subtotal
							: 0,
					cart.paymentMethod === 'split'
						? (cart.mobileAmount ?? 0)
						: cart.paymentMethod === 'mobile'
							? cart.subtotal
							: 0,
					cart.paymentMethod === 'mobile' ||
					(cart.paymentMethod === 'split' && (cart.mobileAmount ?? 0) > 0)
						? cart.mobileMethod
						: null,
					cart.paymentMethod === 'mobile' ||
					(cart.paymentMethod === 'split' && (cart.mobileAmount ?? 0) > 0)
						? cart.mobileTrxId
						: null,
					cart.paymentMethod === 'card' ? cart.cardType : null,
					cart.paymentMethod === 'card' ? cart.cardRef : null,
					'completed',
					now
				]
			);
			console.log('[POS] Order inserted successfully:', orderResult);

			for (const item of cart.items) {
				const orderItemId = generateId();
				console.log(`[POS] Inserting order item: ${orderItemId} for variant ${item.variantId}`);
				await powersync.db.execute(
					`
					INSERT INTO order_items (id, order_id, variant_id, quantity, price_at_sale, cost_at_sale, discount, product_name, variant_label, status)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
					[
						orderItemId,
						orderId,
						item.variantId,
						item.quantity,
						item.price,
						item.costPrice || 0,
						item.discount || 0,
						item.productName,
						`${item.size}${item.color ? ' / ' + item.color : ''}`,
						'completed'
					]
				);

				console.log(`[POS] Updating stock for variant: ${item.variantId}`);
				await powersync.db.execute(
					'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?',
					[item.quantity, item.variantId]
				);

				// Log stock change locally
				console.log(`[POS] Logging stock change for variant: ${item.variantId}`);
				await powersync.db.execute(
					`
					INSERT INTO stock_logs (id, variant_id, change_amount, reason, user_id, created_at)
					VALUES (?, ?, ?, ?, ?, ?)
				`,
					[generateId(), item.variantId, -item.quantity, 'sale', data.user?.id, now]
				);
			}

			// Add to cashbook locally
			const cashbookId = generateId();
			console.log(`[POS] Inserting cashbook entry: ${cashbookId}`);
			await powersync.db.execute(
				`
				INSERT INTO cashbook (id, amount, type, category, description, user_id, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`,
				[
					cashbookId,
					cart.subtotal,
					'in',
					'sale',
					`Sale ${orderId.slice(0, 8).toUpperCase()}`,
					data.user?.id,
					now
				]
			);

			completedOrder = {
				orderId,
				orderNumber: orderId.slice(0, 8).toUpperCase(),
				changeGiven: cart.changeAmount,
				items: [...cart.items],
				total: cart.subtotal,
				cashReceived: cart.cashReceived,
				paymentMethod: cart.paymentMethod
			};
			console.log('[POS] Checkout process complete.');
			cart.clear();
			checkoutOpen = false;
			toast.success('Sale completed!');
		} catch (e: any) {
			toast.error('Local checkout failed: ' + e.message);
		} finally {
			loading = false;
		}
	}

	async function handleLocalAddCustomer() {
		loading = true;
		try {
			const id = generateId();
			const nameInput = document.getElementById('new-customer-name') as HTMLInputElement;
			const phoneInput = document.getElementById('new-customer-phone') as HTMLInputElement;
			const name = nameInput?.value;
			const phone = phoneInput?.value;

			if (!name) return toast.error('Name is required');

			await powersync.db.execute('INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)', [
				id,
				name,
				phone
			]);
			cart.setCustomer({ id, name, phone });
			customerDialogOpen = false;
			toast.success('Customer added!');
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
					cashReceived: cart.cashReceived,
					paymentMethod: cart.paymentMethod
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

	async function handlePrintReceipt(preview = false) {
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
		const result = await printReceipt(
			{
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
				paymentMethod: completedOrder.paymentMethod,
				footerNote: 'Printed on ' + formatDateTime(new Date())
			},
			preview
		);
		if (result && !result.success && result.error) {
			toast.error(result.error);
		}
	}

	function getCartQtyForProduct(product: ProductGroup): number {
		return product.variants.reduce((sum, v) => {
			const inCart = cart.items.find((i) => i.variantId === v.id);
			return sum + (inCart?.quantity ?? 0);
		}, 0);
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
				: 'border-transparent text-muted-foreground'}">Products ({groupedProducts.length})</button
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
						placeholder="Search products…"
						aria-label="Search products"
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
					{#if groupedProducts.length === 0}
						<div class="flex h-full flex-col items-center justify-center text-muted-foreground">
							<Package class="mb-3 h-12 w-12 opacity-20" />
							<p class="text-sm">No products found</p>
						</div>
					{:else}
						<div class="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2 sm:gap-3">
							{#each groupedProducts as product (product.productId)}
								{@const cartQty = getCartQtyForProduct(product)}
								{@const totalAvailable = product.totalStock - cartQty}
								<button
									onclick={() => handleProductClick(product)}
									disabled={totalAvailable <= 0}
									class="group flex w-full cursor-pointer flex-col rounded-xl border bg-card p-3 shadow-sm transition-all hover:shadow-lg active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 {cartQty >
									0
										? 'border-primary ring-2 ring-primary/20'
										: ''}"
								>
									<h3 class="mb-1.5 line-clamp-2 text-left text-sm font-semibold leading-snug">
										{product.productName}
									</h3>
									<div class="mb-2 flex flex-wrap gap-1">
										{#if product.variants.length === 1}
											<Badge variant="outline" class="text-[9px] font-medium"
												>{product.variants[0].size}{product.variants[0].color
													? ` / ${product.variants[0].color}`
													: ''}</Badge
											>
										{:else}
											<Badge variant="outline" class="text-[9px] font-medium"
												>{product.variants.length} variants</Badge
											>
										{/if}
										<Badge
											variant={totalAvailable <= 5 ? 'destructive' : 'secondary'}
											class="text-[9px]">{totalAvailable} in stock</Badge
										>
										{#if cartQty > 0}
											<Badge class="text-[9px]">{cartQty} in cart</Badge>
										{/if}
									</div>
									{#if product.variants.length > 1}
										<p class="mb-2 line-clamp-1 text-[10px] text-muted-foreground">
											{product.variants
												.map((v) => v.size)
												.filter((v, i, a) => a.indexOf(v) === i)
												.join(', ')}
										</p>
									{/if}
									<div class="mt-auto flex items-end justify-between pt-1">
										<div>
											{#if product.minPrice === product.maxPrice}
												<span class="text-base font-black leading-none text-primary"
													>{formatCurrency(product.minPrice)}</span
												>
											{:else}
												<span class="text-xs font-black leading-none text-primary"
													>{formatCurrency(product.minPrice)}–{formatCurrency(
														product.maxPrice
													)}</span
												>
											{/if}
										</div>
										{#if product.maxDiscount > 0}
											<Badge variant="outline" class="text-[9px]"
												>-{product.maxDiscount}%</Badge
											>
										{/if}
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
			class="flex w-full flex-col overflow-hidden border-l bg-card md:w-[400px] {activeMobileTab ===
			'cart'
				? 'flex'
				: 'hidden md:flex'}"
		>
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div class="flex items-center gap-2">
					<ShoppingCart class="h-4 w-4" /><span class="font-bold">Cart</span>
				</div>
				{#if cart.items.length > 0}<button
						onclick={async () => {
							if (
								await confirmState.confirm({
									title: 'Clear Cart',
									message: `Remove all ${cart.totalItems} item(s) from cart?`,
									confirmText: 'Clear',
									variant: 'destructive'
								})
							)
								cart.clear();
						}}
						class="text-xs text-muted-foreground hover:text-destructive"
						aria-label="Clear all items from cart">Clear All</button
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
									class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
									aria-label="Remove {item.productName} from cart"><X class="h-4 w-4" /></button
								>
							</div>
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1 rounded border px-1.5 py-0.5">
									<label for="disc-{item.variantId}" class="text-[9px] text-muted-foreground"
										>Disc</label
									>
									<input
										id="disc-{item.variantId}"
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
									<span class="text-[9px] text-muted-foreground" aria-hidden="true">%</span>
								</div>
								<div class="flex items-center gap-2">
									<button
										onclick={() => cart.updateQuantity(item.variantId, item.quantity - 1)}
										class="flex h-8 w-8 items-center justify-center rounded border hover:bg-muted"
										aria-label="Decrease quantity of {item.productName}">-</button
									>
									<span class="w-4 text-center text-xs font-bold tabular-nums">{item.quantity}</span
									>
									<button
										onclick={() => cart.updateQuantity(item.variantId, item.quantity + 1)}
										class="flex h-8 w-8 items-center justify-center rounded border hover:bg-muted"
										aria-label="Increase quantity of {item.productName}"
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
							<button
								onclick={() => cart.setCustomer(null)}
								class="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
								aria-label="Remove customer"><X class="h-4 w-4" /></button
							>
						</div>
					{:else}
						<div class="relative">
							<Input
								placeholder="Customer search (name or phone)…"
								aria-label="Search customers"
								class="h-9 text-xs"
								value={customerSearch}
								oninput={(e) => handleCustomerSearch(e.currentTarget.value)}
								onfocus={() => (showCustomerResults = true)}
								onblur={() => setTimeout(() => (showCustomerResults = false), 200)}
							/>
							{#if customerSearchLoading}
								<div class="absolute top-1/2 right-3 -translate-y-1/2">
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
					<label for="order-discount" class="text-muted-foreground">Order Discount</label>
					<div class="flex items-center gap-1 rounded border px-2 py-0.5">
						<input
							id="order-discount"
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
						if (
							!cart.customer &&
							!(await confirmState.confirm({
								title: 'Walk-in Sale',
								message: 'Proceed without a customer profile?',
								confirmText: 'Continue',
								variant: 'default'
							}))
						)
							return;
						checkoutOpen = true;
					}}>Charge {formatCurrency(cart.subtotal)}</Button
				>
			</div>
		</div>
	</div>
</div>

<!-- Variant Picker: Sheet on mobile, Dialog on desktop -->
{#if isMobile}
	<Sheet.Root
		bind:open={variantPickerOpen}
		onOpenChange={(open) => {
			if (!open) variantPickerProduct = null;
		}}
	>
		<Sheet.Content side="bottom" class="max-h-[80vh] rounded-t-2xl">
			{#if variantPickerProduct}
				<Sheet.Header class="px-5 pt-5 pb-2">
					<Sheet.Title class="text-base font-bold">{variantPickerProduct.productName}</Sheet.Title>
					<Sheet.Description class="text-xs text-muted-foreground"
						>Select a variant to add to cart</Sheet.Description
					>
				</Sheet.Header>
				<div class="max-h-[55vh] overflow-y-auto px-5 pb-5">
					<div class="space-y-2">
						{#each variantPickerProduct.variants as variant (variant.id)}
							{@const cartQty = cart.items.find((i) => i.variantId === variant.id)?.quantity ?? 0}
							{@const available = variant.stockQuantity - cartQty}
							<button
								onclick={() => handleVariantSelect(variant)}
								disabled={available <= 0}
								class="flex w-full items-center justify-between rounded-lg border p-3 transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
							>
								<div class="flex flex-col items-start gap-0.5">
									<span class="text-sm font-semibold"
										>{variant.size}{variant.color ? ` / ${variant.color}` : ''}</span
									>
									<span class="text-xs text-muted-foreground">{variant.barcode}</span>
								</div>
								<div class="flex items-center gap-2">
									{#if cartQty > 0}
										<Badge variant="outline" class="text-[10px]">{cartQty} in cart</Badge>
									{/if}
									<Badge variant={available <= 5 ? 'destructive' : 'secondary'}
										>{available} left</Badge
									>
									<span class="text-sm font-black text-primary"
										>{formatCurrency(variant.price * (1 - (variant.discount || 0) / 100))}</span
									>
									{#if variant.discount}
										<Badge variant="outline" class="text-[9px]">-{variant.discount}%</Badge>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Dialog.Root
		bind:open={variantPickerOpen}
		onOpenChange={(open) => {
			if (!open) variantPickerProduct = null;
		}}
	>
		<Dialog.Content class="max-w-md overflow-hidden p-0">
			{#if variantPickerProduct}
				<div class="px-5 pt-5 pb-2">
					<Dialog.Title class="text-base font-bold">{variantPickerProduct.productName}</Dialog.Title
					>
					<Dialog.Description class="text-xs text-muted-foreground"
						>Select a variant to add to cart</Dialog.Description
					>
				</div>
				<div class="max-h-[50vh] overflow-y-auto px-5 pb-5">
					<div class="space-y-2">
						{#each variantPickerProduct.variants as variant (variant.id)}
							{@const cartQty = cart.items.find((i) => i.variantId === variant.id)?.quantity ?? 0}
							{@const available = variant.stockQuantity - cartQty}
							<button
								onclick={() => handleVariantSelect(variant)}
								disabled={available <= 0}
								class="flex w-full items-center justify-between rounded-lg border p-3 transition-all hover:border-primary hover:bg-primary/5 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
							>
								<div class="flex flex-col items-start gap-0.5">
									<span class="text-sm font-semibold"
										>{variant.size}{variant.color ? ` / ${variant.color}` : ''}</span
									>
									<span class="text-xs text-muted-foreground">{variant.barcode}</span>
								</div>
								<div class="flex items-center gap-2">
									{#if cartQty > 0}
										<Badge variant="outline" class="text-[10px]">{cartQty} in cart</Badge>
									{/if}
									<Badge variant={available <= 5 ? 'destructive' : 'secondary'}
										>{available} left</Badge
									>
									<span class="text-sm font-black text-primary"
										>{formatCurrency(variant.price * (1 - (variant.discount || 0) / 100))}</span
									>
									{#if variant.discount}
										<Badge variant="outline" class="text-[9px]">-{variant.discount}%</Badge>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Root>
{/if}

<!-- Checkout Dialog -->
{#if isMobile}
	<Sheet.Root
		bind:open={checkoutOpen}
		onOpenChange={(open) => {
			if (open) cart.resetPaymentFields();
		}}
	>
		<Sheet.Content side="bottom" class="max-h-[85vh] rounded-t-2xl">
			<Sheet.Header class="px-5 pt-5 pb-3">
				<div class="flex items-center justify-between">
					<div>
						<Sheet.Title class="text-base font-bold">Complete Payment</Sheet.Title>
						<Sheet.Description class="text-xs text-muted-foreground"
							>Select method and finalize.</Sheet.Description
						>
					</div>
					<div class="text-right">
						<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
							>Total</span
						>
						<div class="text-xl leading-tight font-black text-primary">
							{formatCurrency(cart.subtotal)}
						</div>
					</div>
				</div>
			</Sheet.Header>

			<div class="overflow-y-auto px-5 pb-5" style="max-height: calc(85vh - 120px);">
				<div class="space-y-4">
					<!-- Payment Method Selector — Segmented Control -->
					<div class="grid grid-cols-2 sm:grid-cols-4 gap-0.5 rounded-lg bg-muted p-1">
						{#each [{ id: 'cash', icon: Banknote, label: 'Cash' }, { id: 'card', icon: CreditCard, label: 'Card' }, { id: 'split', icon: Users, label: 'Split' }, { id: 'mobile', icon: Smartphone, label: 'Mobile' }] as method}
							<button
								onclick={() => (cart.paymentMethod = method.id as any)}
								class="flex flex-col items-center gap-0.5 rounded-md py-2 text-[11px] font-semibold transition-all {cart.paymentMethod ===
								method.id
									? 'bg-background text-primary shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								<method.icon class="h-4 w-4" />
								{method.label}
							</button>
						{/each}
					</div>

					<!-- Payment Details -->
					<div class="min-h-[120px]">
						{#if cart.paymentMethod === 'cash'}
							<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
								<div class="space-y-1.5">
									<div class="flex items-center justify-between">
										<Label class="text-xs font-semibold">Cash Received</Label>
										<button
											class="text-[10px] font-bold text-primary hover:underline"
											onclick={() => cart.exactAmount()}>Exact Amount</button
										>
									</div>
									<Input
										type="number"
										class="h-12 text-lg font-bold"
										placeholder="0.00"
										value={cart.cashReceived ?? ''}
										oninput={(e) =>
											(cart.cashReceived =
												e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
										onfocus={(e) => e.currentTarget.select()}
									/>
								</div>
								<div class="grid grid-cols-4 gap-1.5">
									{#each [100, 500, 1000, 2000] as a}
										<Button
											variant="outline"
											size="sm"
											class="text-xs font-bold"
											onclick={() => (cart.cashReceived = (cart.cashReceived ?? 0) + a)}>+{a}</Button
										>
									{/each}
								</div>
							</div>
						{:else if cart.paymentMethod === 'split'}
							<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
								<!-- Split Allocation -->
								<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
									<div class="space-y-1">
										<Label
											class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
											>Cash</Label
										>
										<Input
											type="number"
											value={cart.cashAmount ?? ''}
											oninput={(e) =>
												(cart.cashAmount =
													e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
											onfocus={(e) => e.currentTarget.select()}
											placeholder="0"
											class="h-10 text-sm font-bold"
										/>
									</div>
									<div class="space-y-1">
										<Label
											class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
											>Card</Label
										>
										<Input
											type="number"
											value={cart.cardAmount ?? ''}
											oninput={(e) =>
												(cart.cardAmount =
													e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
											onfocus={(e) => e.currentTarget.select()}
											placeholder="0"
											class="h-10 text-sm font-bold"
										/>
									</div>
									<div class="space-y-1">
										<Label
											class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
											>Mobile</Label
										>
										<Input
											type="number"
											value={cart.mobileAmount ?? ''}
											oninput={(e) =>
												(cart.mobileAmount =
													e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
											onfocus={(e) => e.currentTarget.select()}
											placeholder="0"
											class="h-10 text-sm font-bold"
										/>
									</div>
								</div>

								<!-- Mobile method selector (when mobile allocation > 0) -->
								{#if (cart.mobileAmount ?? 0) > 0}
									<div
										class="animate-in space-y-2 rounded-lg border bg-muted/30 p-3 duration-150 fade-in"
									>
										<div class="grid grid-cols-3 gap-1.5">
											{#each ['bkash', 'nagad', 'rocket'] as m}
												<button
													onclick={() => (cart.mobileMethod = m as any)}
													class="rounded-md border py-1.5 text-[10px] font-bold transition-all {cart.mobileMethod ===
													m
														? 'border-primary bg-primary/5 text-primary'
														: 'bg-background hover:bg-muted'}"
												>
													<span class="capitalize">{m}</span>
												</button>
											{/each}
										</div>
										<Input
											placeholder="TrxID (optional)"
											class="h-8 font-mono text-xs uppercase"
											bind:value={() => cart.mobileTrxId, (v) => (cart.mobileTrxId = v)}
										/>
									</div>
								{/if}

								<!-- Cash received (when cash allocation > 0) -->
								{#if (cart.cashAmount ?? 0) > 0}
									<div class="space-y-1.5">
										<div class="flex items-center justify-between">
											<Label class="text-xs font-semibold">Cash Received</Label>
											<button
												class="text-[10px] font-bold text-primary hover:underline"
												onclick={() => cart.exactAmount()}>Exact Amount</button
											>
										</div>
										<Input
											type="number"
											value={cart.cashReceived ?? ''}
											oninput={(e) =>
												(cart.cashReceived =
													e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
											onfocus={(e) => e.currentTarget.select()}
											class="h-10 font-bold"
											placeholder="Amount received…"
										/>
									</div>
								{/if}
							</div>
						{:else if cart.paymentMethod === 'mobile'}
							<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
								<div class="grid grid-cols-3 gap-1.5">
									{#each ['bkash', 'nagad', 'rocket'] as m}
										<button
											onclick={() => (cart.mobileMethod = m as any)}
											class="rounded-lg border py-2.5 text-xs font-bold transition-all {cart.mobileMethod ===
											m
												? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
												: 'bg-background hover:bg-muted'}"
										>
											<span class="capitalize">{m}</span>
										</button>
									{/each}
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs font-semibold">Transaction ID (Optional)</Label>
									<Input
										placeholder="Enter TrxID…"
										class="font-mono uppercase"
										bind:value={() => cart.mobileTrxId, (v) => (cart.mobileTrxId = v)}
									/>
								</div>
							</div>
						{:else}
							<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
								<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
									{#each [{ id: 'debit', label: 'Debit Card' }, { id: 'credit', label: 'Credit Card' }] as type}
										<button
											onclick={() => (cart.cardType = type.id as any)}
											class="rounded-md py-2 text-xs font-semibold transition-all {cart.cardType ===
											type.id
												? 'bg-background text-primary shadow-sm'
												: 'text-muted-foreground hover:text-foreground'}"
										>
											{type.label}
										</button>
									{/each}
								</div>
								<div class="space-y-1.5">
									<Label class="text-xs font-semibold">Card Ref / Last 4 Digits (Optional)</Label>
									<Input
										placeholder="e.g. 4921 or approval code"
										class="font-mono uppercase"
										bind:value={() => cart.cardRef, (v) => (cart.cardRef = v)}
									/>
								</div>
							</div>
						{/if}
					</div>

					<!-- Change Result -->
					{#if (cart.paymentMethod === 'cash' || cart.paymentMethod === 'split') && (cart.cashReceived ?? 0) > 0}
						<div
							class="flex animate-in items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 duration-200 zoom-in-95 dark:border-emerald-800 dark:bg-emerald-950/50"
						>
							<div class="flex items-center gap-2.5">
								<div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
									<Banknote class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
								</div>
								<span class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Change</span>
							</div>
							<span class="text-lg font-black text-emerald-600 dark:text-emerald-400"
								>{formatCurrency(cart.changeAmount)}</span
							>
						</div>
					{/if}

					<!-- Split payment mismatch warning -->
					{#if cart.paymentMethod === 'split' && !cart.splitValid}
						<div
							class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
						>
							Split amounts ({formatCurrency(cart.splitTotal)}) don't match total ({formatCurrency(
								cart.subtotal
							)})
						</div>
					{/if}

					{#if isNative}
						<Button
							onclick={handleLocalCheckout}
							class="h-12 w-full font-bold"
							disabled={loading ||
								(cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) ||
								(cart.paymentMethod === 'split' && !cart.splitValid) ||
								(cart.paymentMethod === 'split' &&
									(cart.cashAmount ?? 0) > 0 &&
									(cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
						>
							{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
							Complete Sale — {formatCurrency(cart.subtotal)}
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
								<input type="hidden" name="mobileAmount" value={cart.mobileAmount} />
								{#if (cart.mobileAmount ?? 0) > 0}
									<input type="hidden" name="mobileMethod" value={cart.mobileMethod} />
									<input type="hidden" name="mobileTrxId" value={cart.mobileTrxId} />
								{/if}
							{:else if cart.paymentMethod === 'mobile'}
								<input type="hidden" name="mobileMethod" value={cart.mobileMethod} />
								<input type="hidden" name="mobileTrxId" value={cart.mobileTrxId} />
							{/if}

							{#if cart.paymentMethod === 'card' || cart.paymentMethod === 'split'}
								<input type="hidden" name="cardType" value={cart.cardType} />
								<input type="hidden" name="cardRef" value={cart.cardRef} />
							{/if}

							<Button
								type="submit"
								class="h-12 w-full font-bold"
								disabled={loading ||
									(cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) ||
									(cart.paymentMethod === 'split' && !cart.splitValid) ||
									(cart.paymentMethod === 'split' &&
										(cart.cashAmount ?? 0) > 0 &&
										(cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
							>
								{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
								Complete Sale — {formatCurrency(cart.subtotal)}
							</Button>
						</form>
					{/if}
				</div>
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
<Dialog.Root
	bind:open={checkoutOpen}
	onOpenChange={(open) => {
		if (open) cart.resetPaymentFields();
	}}
>
	<Dialog.Content class="max-w-md overflow-hidden p-0">
		<div class="flex items-center justify-between px-5 pt-5 pb-3">
			<div>
				<Dialog.Title class="text-base font-bold">Complete Payment</Dialog.Title>
				<Dialog.Description class="text-xs text-muted-foreground"
					>Select method and finalize.</Dialog.Description
				>
			</div>
			<div class="text-right">
				<span class="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
					>Total</span
				>
				<div class="text-xl leading-tight font-black text-primary">
					{formatCurrency(cart.subtotal)}
				</div>
			</div>
		</div>

		<div class="space-y-4 px-5 pb-5">
			<!-- Payment Method Selector — Segmented Control -->
			<div class="grid grid-cols-2 sm:grid-cols-4 gap-0.5 rounded-lg bg-muted p-1">
				{#each [{ id: 'cash', icon: Banknote, label: 'Cash' }, { id: 'card', icon: CreditCard, label: 'Card' }, { id: 'split', icon: Users, label: 'Split' }, { id: 'mobile', icon: Smartphone, label: 'Mobile' }] as method}
					<button
						onclick={() => (cart.paymentMethod = method.id as any)}
						class="flex flex-col items-center gap-0.5 rounded-md py-2 text-[11px] font-semibold transition-all {cart.paymentMethod ===
						method.id
							? 'bg-background text-primary shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						<method.icon class="h-4 w-4" />
						{method.label}
					</button>
				{/each}
			</div>

			<!-- Payment Details -->
			<div class="min-h-[120px]">
				{#if cart.paymentMethod === 'cash'}
					<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
						<div class="space-y-1.5">
							<div class="flex items-center justify-between">
								<Label class="text-xs font-semibold">Cash Received</Label>
								<button
									class="text-[10px] font-bold text-primary hover:underline"
									onclick={() => cart.exactAmount()}>Exact Amount</button
								>
							</div>
							<Input
								type="number"
								class="h-12 text-lg font-bold"
								placeholder="0.00"
								value={cart.cashReceived ?? ''}
								oninput={(e) =>
									(cart.cashReceived =
										e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
								onfocus={(e) => e.currentTarget.select()}
							/>
						</div>
						<div class="grid grid-cols-4 gap-1.5">
							{#each [100, 500, 1000, 2000] as a}
								<Button
									variant="outline"
									size="sm"
									class="text-xs font-bold"
									onclick={() => (cart.cashReceived = (cart.cashReceived ?? 0) + a)}>+{a}</Button
								>
							{/each}
						</div>
					</div>
				{:else if cart.paymentMethod === 'split'}
					<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
						<!-- Split Allocation -->
						<div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
							<div class="space-y-1">
								<Label
									class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>Cash</Label
								>
								<Input
									type="number"
									value={cart.cashAmount ?? ''}
									oninput={(e) =>
										(cart.cashAmount =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
									onfocus={(e) => e.currentTarget.select()}
									placeholder="0"
									class="h-10 text-sm font-bold"
								/>
							</div>
							<div class="space-y-1">
								<Label
									class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>Card</Label
								>
								<Input
									type="number"
									value={cart.cardAmount ?? ''}
									oninput={(e) =>
										(cart.cardAmount =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
									onfocus={(e) => e.currentTarget.select()}
									placeholder="0"
									class="h-10 text-sm font-bold"
								/>
							</div>
							<div class="space-y-1">
								<Label
									class="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase"
									>Mobile</Label
								>
								<Input
									type="number"
									value={cart.mobileAmount ?? ''}
									oninput={(e) =>
										(cart.mobileAmount =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
									onfocus={(e) => e.currentTarget.select()}
									placeholder="0"
									class="h-10 text-sm font-bold"
								/>
							</div>
						</div>

						<!-- Mobile method selector (when mobile allocation > 0) -->
						{#if (cart.mobileAmount ?? 0) > 0}
							<div
								class="animate-in space-y-2 rounded-lg border bg-muted/30 p-3 duration-150 fade-in"
							>
								<div class="grid grid-cols-3 gap-1.5">
									{#each ['bkash', 'nagad', 'rocket'] as m}
										<button
											onclick={() => (cart.mobileMethod = m as any)}
											class="rounded-md border py-1.5 text-[10px] font-bold transition-all {cart.mobileMethod ===
											m
												? 'border-primary bg-primary/5 text-primary'
												: 'bg-background hover:bg-muted'}"
										>
											<span class="capitalize">{m}</span>
										</button>
									{/each}
								</div>
								<Input
									placeholder="TrxID (optional)"
									class="h-8 font-mono text-xs uppercase"
									bind:value={() => cart.mobileTrxId, (v) => (cart.mobileTrxId = v)}
								/>
							</div>
						{/if}

						<!-- Cash received (when cash allocation > 0) -->
						{#if (cart.cashAmount ?? 0) > 0}
							<div class="space-y-1.5">
								<div class="flex items-center justify-between">
									<Label class="text-xs font-semibold">Cash Received</Label>
									<button
										class="text-[10px] font-bold text-primary hover:underline"
										onclick={() => cart.exactAmount()}>Exact Amount</button
									>
								</div>
								<Input
									type="number"
									value={cart.cashReceived ?? ''}
									oninput={(e) =>
										(cart.cashReceived =
											e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
									onfocus={(e) => e.currentTarget.select()}
									class="h-10 font-bold"
									placeholder="Amount received…"
								/>
							</div>
						{/if}
					</div>
				{:else if cart.paymentMethod === 'mobile'}
					<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
						<div class="grid grid-cols-3 gap-1.5">
							{#each ['bkash', 'nagad', 'rocket'] as m}
								<button
									onclick={() => (cart.mobileMethod = m as any)}
									class="rounded-lg border py-2.5 text-xs font-bold transition-all {cart.mobileMethod ===
									m
										? 'border-primary bg-primary/5 text-primary ring-1 ring-primary'
										: 'bg-background hover:bg-muted'}"
								>
									<span class="capitalize">{m}</span>
								</button>
							{/each}
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs font-semibold">Transaction ID (Optional)</Label>
							<Input
								placeholder="Enter TrxID…"
								class="font-mono uppercase"
								bind:value={() => cart.mobileTrxId, (v) => (cart.mobileTrxId = v)}
							/>
						</div>
					</div>
				{:else}
					<div class="animate-in space-y-3 duration-200 fade-in slide-in-from-top-2">
						<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
							{#each [{ id: 'debit', label: 'Debit Card' }, { id: 'credit', label: 'Credit Card' }] as type}
								<button
									onclick={() => (cart.cardType = type.id as any)}
									class="rounded-md py-2 text-xs font-semibold transition-all {cart.cardType ===
									type.id
										? 'bg-background text-primary shadow-sm'
										: 'text-muted-foreground hover:text-foreground'}"
								>
									{type.label}
								</button>
							{/each}
						</div>
						<div class="space-y-1.5">
							<Label class="text-xs font-semibold">Card Ref / Last 4 Digits (Optional)</Label>
							<Input
								placeholder="e.g. 4921 or approval code"
								class="font-mono uppercase"
								bind:value={() => cart.cardRef, (v) => (cart.cardRef = v)}
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Change Result -->
			{#if (cart.paymentMethod === 'cash' || cart.paymentMethod === 'split') && (cart.cashReceived ?? 0) > 0}
				<div
					class="flex animate-in items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 duration-200 zoom-in-95 dark:border-emerald-800 dark:bg-emerald-950/50"
				>
					<div class="flex items-center gap-2.5">
						<div class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
							<Banknote class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
						</div>
						<span class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Change</span>
					</div>
					<span class="text-lg font-black text-emerald-600 dark:text-emerald-400"
						>{formatCurrency(cart.changeAmount)}</span
					>
				</div>
			{/if}

			<!-- Complete Sale Button -->
			<!-- Split payment mismatch warning -->
			{#if cart.paymentMethod === 'split' && !cart.splitValid}
				<div
					class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
				>
					Split amounts ({formatCurrency(cart.splitTotal)}) don't match total ({formatCurrency(
						cart.subtotal
					)})
				</div>
			{/if}

			{#if isNative}
				<Button
					onclick={handleLocalCheckout}
					class="h-12 w-full font-bold"
					disabled={loading ||
						(cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) ||
						(cart.paymentMethod === 'split' && !cart.splitValid) ||
						(cart.paymentMethod === 'split' &&
							(cart.cashAmount ?? 0) > 0 &&
							(cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
				>
					{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
					Complete Sale — {formatCurrency(cart.subtotal)}
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
						<input type="hidden" name="mobileAmount" value={cart.mobileAmount} />
						{#if (cart.mobileAmount ?? 0) > 0}
							<input type="hidden" name="mobileMethod" value={cart.mobileMethod} />
							<input type="hidden" name="mobileTrxId" value={cart.mobileTrxId} />
						{/if}
					{:else if cart.paymentMethod === 'mobile'}
						<input type="hidden" name="mobileMethod" value={cart.mobileMethod} />
						<input type="hidden" name="mobileTrxId" value={cart.mobileTrxId} />
					{/if}

					{#if cart.paymentMethod === 'card' || cart.paymentMethod === 'split'}
						<input type="hidden" name="cardType" value={cart.cardType} />
						<input type="hidden" name="cardRef" value={cart.cardRef} />
					{/if}

					<Button
						type="submit"
						class="h-12 w-full font-bold"
						disabled={loading ||
							(cart.paymentMethod === 'cash' && (cart.cashReceived ?? 0) < cart.subtotal) ||
							(cart.paymentMethod === 'split' && !cart.splitValid) ||
							(cart.paymentMethod === 'split' &&
								(cart.cashAmount ?? 0) > 0 &&
								(cart.cashReceived ?? 0) < (cart.cashAmount ?? 0))}
					>
						{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
						Complete Sale — {formatCurrency(cart.subtotal)}
					</Button>
				</form>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
{/if}

{#if isMobile}
	<Sheet.Root bind:open={customerDialogOpen}>
		<Sheet.Content side="bottom" class="max-h-[85vh] rounded-t-2xl">
			<Sheet.Header class="px-5 pt-5 pb-3">
				<Sheet.Title>Add New Customer</Sheet.Title>
				<Sheet.Description class="sr-only">Enter customer details</Sheet.Description>
			</Sheet.Header>
			<div class="overflow-y-auto px-5 pb-5">
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
				{/if}
			</div>
		</Sheet.Content>
	</Sheet.Root>
{:else}
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
{/if}

{#if completedOrder}
	{#if isMobile}
		<Sheet.Root open onOpenChange={() => (completedOrder = null)}>
			<Sheet.Content side="bottom" class="max-h-[85vh] rounded-t-2xl">
				<Sheet.Header class="px-5 pt-5 pb-3">
					<Sheet.Title class="sr-only">Order Complete</Sheet.Title>
					<Sheet.Description class="sr-only">Order completion details</Sheet.Description>
				</Sheet.Header>
				<div class="overflow-y-auto px-5 pb-5 space-y-6 text-center">
					<div class="flex flex-col items-center gap-2">
						<div class="rounded-full bg-emerald-100 p-4">
							<ShoppingCart class="h-8 w-8 text-emerald-600" />
						</div>
						<div class="text-4xl font-black">{formatCurrency(completedOrder.total)}</div>
					</div>
					{#if completedOrder.changeGiven > 0}<div
							class="rounded-xl bg-amber-50 p-4 text-xl font-bold text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
						>
							Change: {formatCurrency(completedOrder.changeGiven)}
						</div>{/if}

					<!-- Printer status warning with quick reconnect -->
					{#if printerState.status === 'disconnected' || printerState.status === 'connecting'}
						<div
							class="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-800 dark:bg-amber-950/30"
						>
							<div class="min-w-0">
								<p class="text-sm font-medium text-amber-700 dark:text-amber-400">
									{printerState.status === 'connecting' ? 'Connecting…' : 'Printer disconnected'}
								</p>
								<p class="truncate text-xs text-amber-600/70 dark:text-amber-500/70">
									{printerState.name || 'Tap reconnect or go to Settings'}
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								class="shrink-0 cursor-pointer border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
								onclick={async () => {
									const result = await printerState.reconnect();
									if (result.success) {
										toast.success('Printer reconnected');
									} else {
										toast.error(result.error || 'Could not reconnect');
									}
								}}
								disabled={printerState.status === 'connecting'}
							>
								{#if printerState.status === 'connecting'}
									<Loader2 class="mr-1 h-3 w-3 animate-spin" />
								{:else}
									<Bluetooth class="mr-1 h-3 w-3" />
								{/if}
								Reconnect
							</Button>
						</div>
					{:else if printerState.status === 'not-configured'}
						<div class="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
							No printer configured. <a
								href="/settings/preferences"
								class="font-medium text-primary underline underline-offset-2">Set up in Settings</a
							>
						</div>
					{/if}

					<div class="flex gap-2">
						<Button class="h-14 flex-1 cursor-pointer" onclick={() => handlePrintReceipt()}
							><Printer class="mr-2 h-5 w-5" /> Print</Button
						><Button
							variant="outline"
							class="h-14 flex-1 cursor-pointer"
							onclick={() => (completedOrder = null)}>Done</Button
						>
					</div>
				</div>
			</Sheet.Content>
		</Sheet.Root>
	{:else}
		<Dialog.Root open onOpenChange={() => (completedOrder = null)}>
			<Dialog.Content class="space-y-6 py-10 text-center">
				<div class="flex flex-col items-center gap-2">
					<div class="rounded-full bg-emerald-100 p-4">
						<ShoppingCart class="h-8 w-8 text-emerald-600" />
					</div>
					<div class="text-4xl font-black">{formatCurrency(completedOrder.total)}</div>
				</div>
				{#if completedOrder.changeGiven > 0}<div
						class="rounded-xl bg-amber-50 p-4 text-xl font-bold text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
					>
						Change: {formatCurrency(completedOrder.changeGiven)}
					</div>{/if}

				<!-- Printer status warning with quick reconnect -->
				{@const pStatus = printerState.status}
				{#if pStatus === 'disconnected' || pStatus === 'connecting'}
					<div
						class="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-800 dark:bg-amber-950/30"
					>
						<div class="min-w-0">
							<p class="text-sm font-medium text-amber-700 dark:text-amber-400">
								{pStatus === 'connecting' ? 'Connecting…' : 'Printer disconnected'}
							</p>
							<p class="truncate text-xs text-amber-600/70 dark:text-amber-500/70">
								{printerState.name || 'Tap reconnect or go to Settings'}
							</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							class="shrink-0 cursor-pointer border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-400"
							onclick={async () => {
								const result = await printerState.reconnect();
								if (result.success) {
									toast.success('Printer reconnected');
								} else {
									toast.error(result.error || 'Could not reconnect');
								}
							}}
							disabled={pStatus === 'connecting'}
						>
							{#if pStatus === 'connecting'}
								<Loader2 class="mr-1 h-3 w-3 animate-spin" />
							{:else}
								<Bluetooth class="mr-1 h-3 w-3" />
							{/if}
							Reconnect
						</Button>
					</div>
				{:else if pStatus === 'not-configured'}
					<div class="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
						No printer configured. <a
							href="/settings/preferences"
							class="font-medium text-primary underline underline-offset-2">Set up in Settings</a
						>
					</div>
				{/if}

				<div class="flex gap-2">
					<Button class="h-14 flex-1 cursor-pointer" onclick={() => handlePrintReceipt()}
						><Printer class="mr-2 h-5 w-5" /> Print</Button
					><Button
						variant="outline"
						class="h-14 flex-1 cursor-pointer"
						onclick={() => (completedOrder = null)}>Done</Button
					>
				</div>
			</Dialog.Content>
		</Dialog.Root>
	{/if}
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
