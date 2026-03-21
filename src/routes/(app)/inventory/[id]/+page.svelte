<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		ArrowLeft,
		Plus,
		Trash,
		Printer,
		Pencil,
		Loader2,
		Package,
		X,
		Check,
		PackageOpen,
		History,
		ChevronDown
	} from '@lucide/svelte';
	import { formatCurrency, getCurrencySymbol, formatDateTime } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { navigating } from '$app/stores';
	import { confirmState } from '$lib/confirm.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
	import { generateId, toDbDate } from '$lib/utils';

	let { data, form } = $props();

	// ── Native data loading ──
	let nativeProduct = $state<any>(null);
	let nativeVariants = $state<any[]>([]);
	let nativeStockHistory = $state<any[]>([]);

	async function loadNativeProductDetail() {
		if (!isNative || !powersync.ready) return;
		const productId = data.product?.id ?? data.productId;
		if (!productId) return;

		const [productRows, variantRows] = await Promise.all([
			powersync.db.getAll('SELECT * FROM products WHERE id = ?', [productId]),
			powersync.db.getAll(
				`SELECT id, product_id as productId, size, barcode, price,
				 COALESCE(cost_price, 0) as costPrice, discount, stock_quantity as stockQuantity
				 FROM product_variants WHERE product_id = ?`,
				[productId]
			)
		]);

		nativeProduct = (productRows as any[])[0]
			? {
					...(productRows as any[])[0],
					templatePrice: (productRows as any[])[0].template_price,
					costPrice: (productRows as any[])[0].cost_price,
					defaultDiscount: (productRows as any[])[0].default_discount
				}
			: null;
		nativeVariants = variantRows as any[];

		// Stock history
		const vIds = (variantRows as any[]).map((v: any) => v.id);
		if (vIds.length > 0) {
			const placeholders = vIds.map(() => '?').join(',');
			const historyRows = await powersync.db.getAll(
				`SELECT sl.id, sl.variant_id as variantId, pv.size, sl.change_amount as changeAmount,
				 sl.reason, u.name as userName, sl.created_at as createdAt
				 FROM stock_logs sl
				 INNER JOIN product_variants pv ON sl.variant_id = pv.id
				 LEFT JOIN users u ON sl.user_id = u.id
				 WHERE sl.variant_id IN (${placeholders})
				 ORDER BY sl.created_at DESC LIMIT 50`,
				vIds
			);
			nativeStockHistory = historyRows as any[];
		}
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			powersync.dataVersion;
			loadNativeProductDetail();
		}
	});

	const currentProduct = $derived(isNative && nativeProduct ? nativeProduct : data.product);
	const currentVariants = $derived(
		isNative && nativeVariants.length > 0 ? nativeVariants : data.variants
	);
	const currentStockHistory = $derived(isNative ? nativeStockHistory : (data.stockHistory ?? []));

	// ── Mode state ──
	let editingVariantId = $state<string | null>(null);
	let stockHistoryOpen = $state(false);
	let batchStockMode = $state(false);

	// ── Inline edit state ──
	let editPrice = $state('');
	let editCostPrice = $state('');
	let editDiscount = $state('');
	let editLoading = $state(false);

	// ── Batch stock state ──
	let batchStockData = $state<Record<string, string>>({});
	let batchStockReason = $state('');
	let batchStockLoading = $state(false);

	// ── Add variant state ──
	let variantDialogOpen = $state(false);
	let newVariantPrice = $state('');
	let newVariantCostPrice = $state('');
	let newVariantDiscount = $state('');
	let newVariantInitialStock = $state('');
	let addVariantLoading = $state(false);

	let deleteLoading = $state(false);

	const SIZE_TEMPLATES = {
		alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
		numeric: ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54']
	};
	let variantTemplate = $state('alpha');
	let variantSelectedSizes = $state<string[]>([]);
	let customVariantSizeInput = $state('');

	$effect(() => {
		variantTemplate;
		variantSelectedSizes = [];
	});

	const existingSizes = $derived(currentVariants.map((v: any) => v.size));
	const availableSizes = $derived(
		SIZE_TEMPLATES[variantTemplate as keyof typeof SIZE_TEMPLATES].filter(
			(s) => !existingSizes.includes(s)
		)
	);

	// ── Computed ──
	const totalStock = $derived(
		currentVariants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0)
	);

	const margin = $derived.by(() => {
		const cost = currentProduct.costPrice ?? 0;
		const price = currentProduct.templatePrice;
		if (cost > 0 && price > 0) return Math.round(((price - cost) / price) * 100);
		return null;
	});

	const batchChangedCount = $derived(
		Object.entries(batchStockData).filter(([id, qty]) => {
			const variant = currentVariants.find((v: any) => v.id === id);
			return variant && qty !== '' && parseInt(qty) !== variant.stockQuantity;
		}).length
	);

	// ── Helpers ──
	function stockChipClass(qty: number): string {
		if (qty === 0)
			return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900';
		if (qty <= 5)
			return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
		return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
	}

	function stockRowBg(qty: number): string {
		if (qty === 0) return 'bg-red-50/40 dark:bg-red-950/15';
		if (qty <= 5) return 'bg-amber-50/40 dark:bg-amber-950/15';
		return '';
	}

	// ── Mode transitions ──
	function startInlineEdit(variant: any) {
		editingVariantId = variant.id;
		editPrice = variant.price?.toString() ?? '';
		editCostPrice = variant.costPrice?.toString() ?? '0';
		editDiscount = variant.discount?.toString() ?? '0';
	}

	function cancelInlineEdit() {
		editingVariantId = null;
	}

	function enterBatchStockMode() {
		batchStockMode = true;
		editingVariantId = null;
		batchStockData = {};
		for (const v of currentVariants) {
			batchStockData[v.id] = v.stockQuantity.toString();
		}
		batchStockReason = '';
	}

	function cancelBatchStock() {
		batchStockMode = false;
	}

	function toggleVariantSize(size: string) {
		if (variantSelectedSizes.includes(size)) {
			variantSelectedSizes = variantSelectedSizes.filter((s) => s !== size);
		} else {
			variantSelectedSizes = [...variantSelectedSizes, size];
		}
	}

	function removeVariantSize(size: string) {
		variantSelectedSizes = variantSelectedSizes.filter((s) => s !== size);
	}

	function addCustomVariantSize() {
		const size = customVariantSizeInput.trim();
		if (!size) return;
		if (variantSelectedSizes.includes(size) || existingSizes.includes(size)) {
			toast.error(`Size "${size}" already exists`);
			return;
		}
		variantSelectedSizes = [...variantSelectedSizes, size];
		customVariantSizeInput = '';
	}

	// ── Native actions ──
	async function nativeInlineEditSave() {
		if (!editingVariantId || !isNative || !powersync.ready) return;
		editLoading = true;
		try {
			const price = editPrice ? parseFloat(editPrice) : 0;
			const costPrice = editCostPrice ? parseFloat(editCostPrice) : 0;
			const discount = editDiscount ? parseFloat(editDiscount) : 0;
			await powersync.db.execute(
				`UPDATE product_variants SET price = ?, cost_price = ?, discount = ? WHERE id = ?`,
				[price, costPrice, discount, editingVariantId]
			);
			toast.success('Variant updated');
			editingVariantId = null;
			loadNativeProductDetail();
		} catch (e) {
			toast.error('Failed to update variant');
		} finally {
			editLoading = false;
		}
	}

	async function nativeBatchStockSave() {
		if (!isNative || !powersync.ready) return;
		batchStockLoading = true;
		try {
			let count = 0;
			for (const [variantId, qtyStr] of Object.entries(batchStockData)) {
				const newQty = parseInt(qtyStr);
				const variant = currentVariants.find((v: any) => v.id === variantId);
				if (!variant || isNaN(newQty) || newQty === variant.stockQuantity) continue;
				const delta = newQty - variant.stockQuantity;
				await powersync.db.execute(`UPDATE product_variants SET stock_quantity = ? WHERE id = ?`, [
					newQty,
					variantId
				]);
				await powersync.db.execute(
					`INSERT INTO stock_logs (id, variant_id, change_amount, reason, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
					[generateId(), variantId, delta, batchStockReason, data.user?.id, toDbDate(new Date())]
				);
				count++;
			}
			toast.success(`Stock updated for ${count} variant(s)`);
			batchStockMode = false;
			batchStockReason = '';
			loadNativeProductDetail();
		} catch (e) {
			toast.error('Failed to update stock');
		} finally {
			batchStockLoading = false;
		}
	}

	async function nativeAddVariants(
		sizes: string[],
		price: number,
		costPrice: number,
		discount: number,
		initialStock: number
	) {
		if (!isNative || !powersync.ready) return;
		const product = currentProduct;
		const shortId = product.id.substring(0, 4).toUpperCase();
		const catPrefix = product.category.substring(0, 3).toUpperCase();
		for (const size of sizes) {
			const barcode = `${catPrefix}-${shortId}-${size}`;
			await powersync.db.execute(
				`INSERT INTO product_variants (id, product_id, size, barcode, price, cost_price, discount, stock_quantity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[generateId(), product.id, size, barcode, price, costPrice, discount, initialStock]
			);
		}
		toast.success('Variants added');
		variantDialogOpen = false;
		variantSelectedSizes = [];
		customVariantSizeInput = '';
		newVariantPrice = '';
		newVariantCostPrice = '';
		newVariantDiscount = '';
		newVariantInitialStock = '';
		loadNativeProductDetail();
	}

	async function nativeDeleteVariant(variantId: string) {
		if (!isNative || !powersync.ready) return;
		await powersync.db.execute(`DELETE FROM product_variants WHERE id = ?`, [variantId]);
		toast.success('Variant deleted');
		loadNativeProductDetail();
	}

	async function nativeDeleteProduct() {
		if (!isNative || !powersync.ready) return;
		const product = currentProduct;
		await powersync.db.execute(`DELETE FROM product_variants WHERE product_id = ?`, [product.id]);
		await powersync.db.execute(`DELETE FROM products WHERE id = ?`, [product.id]);
		toast.success('Product deleted');
		window.location.href = '/inventory';
	}

	// ── Form result handlers ──
	$effect(() => {
		if (form?.editVariantSuccess) {
			toast.success('Variant updated');
			editingVariantId = null;
		}
		if (form?.batchStockSuccess) {
			toast.success('Stock updated for all variants');
			batchStockMode = false;
			batchStockReason = '';
		}
		if (form?.batchStockError) {
			toast.error(form.batchStockError);
		}
		if (form?.variantSuccess) {
			if (form.variantWarning) {
				toast.warning(form.variantWarning);
			} else {
				toast.success('Variants added');
			}
			variantDialogOpen = false;
			variantSelectedSizes = [];
			customVariantSizeInput = '';
			newVariantPrice = '';
			newVariantCostPrice = '';
			newVariantDiscount = '';
			newVariantInitialStock = '';
		}
		if (form?.variantError) toast.error(form.variantError);
		if (form?.deleteVariantSuccess) toast.success('Variant deleted');
		if (form?.stockSuccess) toast.success('Stock updated');
		if (form?.stockError) toast.error(form.stockError);
		if (form?.error) toast.error(form.error);
	});

	// ── Form references (web mode) ──
	let editFormEl = $state<HTMLFormElement | null>(null);
	let batchStockFormEl = $state<HTMLFormElement | null>(null);
</script>

<svelte:head>
	<title>{currentProduct.name} — Inventory — Clothing POS</title>
</svelte:head>

<div class="space-y-5 p-4 pb-24 sm:p-6 md:pb-6">
	{#if $navigating}
		<div class="animate-pulse space-y-5">
			<div class="flex items-center gap-4">
				<div class="h-10 w-10 rounded-md bg-muted"></div>
				<div class="space-y-2">
					<div class="h-8 w-48 rounded bg-muted"></div>
					<div class="h-4 w-32 rounded bg-muted"></div>
				</div>
			</div>
			<div class="h-14 rounded-lg bg-muted/50"></div>
			<div class="flex gap-2">
				{#each Array(5) as _}<div class="h-8 w-16 rounded-md bg-muted"></div>{/each}
			</div>
			<div class="h-[400px] rounded-lg border bg-muted/50"></div>
		</div>
	{:else}
		<!-- ── Header ── -->
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="flex items-start gap-3">
				<Button
					variant="outline"
					size="icon"
					href="/inventory"
					class="mt-1 shrink-0 cursor-pointer"
					aria-label="Back to inventory"
				>
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div>
					<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{currentProduct.name}</h1>
					<div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<Badge variant="secondary">{currentProduct.category}</Badge>
						<span class="font-semibold tabular-nums">{totalStock} in stock</span>
					</div>
				</div>
			</div>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					href="/inventory/{currentProduct.id}/labels"
					class="cursor-pointer"
				>
					<Printer class="mr-1.5 h-3.5 w-3.5" /> Labels
				</Button>
				<Button
					variant="outline"
					size="sm"
					href="/inventory/{currentProduct.id}/edit"
					class="cursor-pointer"
				>
					<Pencil class="mr-1.5 h-3.5 w-3.5" /> Edit Product
				</Button>
				{#if data.user?.role === 'admin'}
					{#if isNative}
						<Button
							variant="destructive"
							size="sm"
							type="button"
							disabled={deleteLoading}
							class="cursor-pointer"
							onclick={async () => {
								if (
									await confirmState.confirm({
										title: 'Delete Product',
										message: `Delete "${currentProduct.name}" and all variants? This cannot be undone.`,
										confirmText: 'Delete',
										variant: 'destructive'
									})
								) {
									deleteLoading = true;
									await nativeDeleteProduct();
									deleteLoading = false;
								}
							}}
						>
							{#if deleteLoading}
								<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
							{:else}
								<Trash class="mr-1.5 h-3.5 w-3.5" />
							{/if}
							Delete
						</Button>
					{:else}
						<form
							method="POST"
							action="?/deleteProduct"
							use:enhance={() => {
								deleteLoading = true;
								return async ({ update }) => {
									deleteLoading = false;
									await update();
								};
							}}
						>
							<Button
								variant="destructive"
								size="sm"
								type="button"
								disabled={deleteLoading}
								class="cursor-pointer"
								onclick={async (e) => {
									const formElement = e.currentTarget.closest('form');
									if (
										await confirmState.confirm({
											title: 'Delete Product',
											message: `Delete "${currentProduct.name}" and all variants? This cannot be undone.`,
											confirmText: 'Delete',
											variant: 'destructive'
										})
									) {
										formElement?.requestSubmit();
									}
								}}
							>
								{#if deleteLoading}
									<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
								{:else}
									<Trash class="mr-1.5 h-3.5 w-3.5" />
								{/if}
								Delete
							</Button>
						</form>
					{/if}
				{/if}
			</div>
		</div>

		<!-- ── Product Info Bar ── -->
		<div class="rounded-lg border bg-muted/30 px-4 py-3">
			<div class="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
				<div>
					<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
						>Base Price</span
					>
					<span class="ml-1.5 font-semibold">{formatCurrency(currentProduct.templatePrice)}</span>
				</div>
				<div class="hidden h-4 w-px bg-border sm:block"></div>
				<div>
					<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
						>Cost</span
					>
					<span class="ml-1.5 font-semibold">{formatCurrency(currentProduct.costPrice ?? 0)}</span>
				</div>
				{#if margin !== null}
					<div class="hidden h-4 w-px bg-border sm:block"></div>
					<div>
						<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
							>Margin</span
						>
						<span class="ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400"
							>{margin}%</span
						>
					</div>
				{/if}
				{#if currentProduct.defaultDiscount}
					<div class="hidden h-4 w-px bg-border sm:block"></div>
					<div>
						<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
							>Default Discount</span
						>
						<span class="ml-1.5 font-semibold">{currentProduct.defaultDiscount}%</span>
					</div>
				{/if}
			</div>
			{#if currentProduct.description}
				<p class="mt-2 text-sm leading-relaxed text-muted-foreground">
					{currentProduct.description}
				</p>
			{/if}
			<p class="mt-1.5 text-[11px] text-muted-foreground/60">
				Base price & discount apply to new variants only. Each variant has its own pricing.
			</p>
		</div>

		<!-- ── Size Overview ── -->
		<div class="flex flex-wrap gap-1.5">
			{#each currentVariants as variant}
				<div
					class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 {stockChipClass(
						variant.stockQuantity
					)}"
					title="{variant.size}: {variant.stockQuantity} in stock — {formatCurrency(variant.price)}"
				>
					<span class="text-xs font-semibold">{variant.size}</span>
					<span class="text-sm font-bold tabular-nums">{variant.stockQuantity}</span>
				</div>
			{/each}
		</div>

		<!-- ── Variants Table ── -->
		<Card.Root class="pb-0 {batchStockMode ? 'ring-2 ring-blue-500/30' : ''}">
			<Card.Header>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					{#if batchStockMode}
						<div class="flex-1">
							<Card.Title class="flex items-center gap-2">
								<PackageOpen class="h-4 w-4 text-blue-600" />
								Stock Adjustment
							</Card.Title>
							<div class="mt-2">
								<Input
									placeholder="Reason — e.g. New shipment, Recount, Damage…"
									bind:value={batchStockReason}
									class="h-9 max-w-md text-sm"
								/>
							</div>
						</div>
						<div class="flex gap-2">
							<Button variant="outline" size="sm" onclick={cancelBatchStock} class="cursor-pointer">
								Cancel
							</Button>
							<Button
								size="sm"
								disabled={batchStockLoading || !batchStockReason.trim() || batchChangedCount === 0}
								class="cursor-pointer"
								onclick={async () => {
									if (
										await confirmState.confirm({
											title: 'Save Stock Changes',
											message: `Update stock for ${batchChangedCount} variant(s)?\nReason: ${batchStockReason}`,
											confirmText: 'Save All',
											variant: 'default'
										})
									) {
										if (isNative) {
											await nativeBatchStockSave();
										} else {
											batchStockFormEl?.requestSubmit();
										}
									}
								}}
							>
								{#if batchStockLoading}
									<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
								{/if}
								Save {batchChangedCount} Change{batchChangedCount !== 1 ? 's' : ''}
							</Button>
						</div>
					{:else}
						<div>
							<Card.Title>Variants & Stock</Card.Title>
							<Card.Description>
								{currentVariants.length} size{currentVariants.length !== 1 ? 's' : ''}
							</Card.Description>
						</div>
						<div class="flex gap-2">
							{#if data.user?.role !== 'sales'}
								<Button
									variant="outline"
									size="sm"
									onclick={enterBatchStockMode}
									class="cursor-pointer"
								>
									<Package class="mr-1.5 h-3.5 w-3.5" /> Adjust Stock
								</Button>
								<Button
									variant="outline"
									size="sm"
									onclick={() => (variantDialogOpen = true)}
									class="cursor-pointer"
								>
									<Plus class="mr-1.5 h-3.5 w-3.5" /> Add Sizes
								</Button>
							{/if}
						</div>
					{/if}
				</div>
			</Card.Header>
			<Card.Content class="p-0">
				<div class="overflow-x-auto">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="w-[70px]">Size</Table.Head>
								<Table.Head class="hidden md:table-cell">Barcode</Table.Head>
								<Table.Head>Price</Table.Head>
								<Table.Head class="hidden lg:table-cell">Cost</Table.Head>
								<Table.Head class="hidden sm:table-cell">Discount</Table.Head>
								<Table.Head class={batchStockMode ? 'min-w-[180px]' : ''}>Stock</Table.Head>
								{#if !batchStockMode}
									<Table.Head class="w-[100px] text-right">Actions</Table.Head>
								{/if}
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each currentVariants as variant (variant.id)}
								{@const isEditing = editingVariantId === variant.id}
								{@const batchQty = batchStockData[variant.id]}
								{@const batchDelta =
									batchStockMode && batchQty !== undefined
										? parseInt(batchQty) - variant.stockQuantity
										: 0}

								<Table.Row
									class={batchStockMode
										? ''
										: isEditing
											? 'bg-blue-50/50 dark:bg-blue-950/20'
											: stockRowBg(variant.stockQuantity)}
								>
									<!-- Size -->
									<Table.Cell class="font-bold">{variant.size}</Table.Cell>

									<!-- Barcode -->
									<Table.Cell class="hidden md:table-cell">
										<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
											>{variant.barcode}</code
										>
									</Table.Cell>

									<!-- Price -->
									<Table.Cell>
										{#if isEditing}
											<Input
												type="number"
												step="0.01"
												min="0"
												bind:value={editPrice}
												class="h-8 w-24 text-sm"
											/>
										{:else}
											<span class="font-medium">{formatCurrency(variant.price)}</span>
										{/if}
									</Table.Cell>

									<!-- Cost -->
									<Table.Cell class="hidden lg:table-cell">
										{#if isEditing}
											<Input
												type="number"
												step="0.01"
												min="0"
												bind:value={editCostPrice}
												class="h-8 w-24 text-sm"
											/>
										{:else}
											<span class="text-sm text-muted-foreground"
												>{formatCurrency(variant.costPrice ?? currentProduct.costPrice ?? 0)}</span
											>
										{/if}
									</Table.Cell>

									<!-- Discount -->
									<Table.Cell class="hidden sm:table-cell">
										{#if isEditing}
											<div class="flex items-center gap-1">
												<Input
													type="number"
													step="0.01"
													min="0"
													max="100"
													bind:value={editDiscount}
													class="h-8 w-20 text-sm"
												/>
												<span class="text-xs text-muted-foreground">%</span>
											</div>
										{:else if variant.discount && variant.discount > 0}
											<span class="text-sm font-medium text-emerald-600 dark:text-emerald-400"
												>{variant.discount}%</span
											>
										{:else}
											<span class="text-sm text-muted-foreground">—</span>
										{/if}
									</Table.Cell>

									<!-- Stock -->
									<Table.Cell>
										{#if batchStockMode}
											<div class="flex items-center gap-2">
												<span class="w-8 text-right text-sm text-muted-foreground tabular-nums"
													>{variant.stockQuantity}</span
												>
												<span class="text-muted-foreground">→</span>
												<Input
													type="number"
													min="0"
													value={batchStockData[variant.id]}
													oninput={(e) => {
														batchStockData = {
															...batchStockData,
															[variant.id]: (e.target as HTMLInputElement).value
														};
													}}
													class="h-8 w-20 text-sm"
												/>
												{#if batchDelta !== 0 && !isNaN(batchDelta)}
													<span
														class="text-xs font-bold tabular-nums {batchDelta > 0
															? 'text-emerald-600'
															: 'text-red-600'}"
													>
														{batchDelta > 0 ? '+' : ''}{batchDelta}
													</span>
												{/if}
											</div>
										{:else}
											<span
												class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold {stockChipClass(
													variant.stockQuantity
												)}"
											>
												{variant.stockQuantity}
											</span>
										{/if}
									</Table.Cell>

									<!-- Actions -->
									{#if !batchStockMode}
										<Table.Cell class="text-right">
											{#if isEditing}
												<div class="flex justify-end gap-1">
													<Button
														variant="ghost"
														size="icon"
														class="h-8 w-8 cursor-pointer text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
														disabled={editLoading}
														onclick={async () => {
															if (isNative) {
																await nativeInlineEditSave();
															} else {
																editFormEl?.requestSubmit();
															}
														}}
														aria-label="Save changes"
														title="Save"
													>
														{#if editLoading}
															<Loader2 class="h-3.5 w-3.5 animate-spin" />
														{:else}
															<Check class="h-3.5 w-3.5" />
														{/if}
													</Button>
													<Button
														variant="ghost"
														size="icon"
														class="h-8 w-8 cursor-pointer"
														onclick={cancelInlineEdit}
														aria-label="Cancel editing"
														title="Cancel"
													>
														<X class="h-3.5 w-3.5" />
													</Button>
												</div>
											{:else if data.user?.role !== 'sales'}
												<div class="flex justify-end gap-1">
													<Button
														variant="ghost"
														size="icon"
														class="h-8 w-8 cursor-pointer text-blue-600 hover:bg-blue-50 hover:text-blue-700"
														onclick={() => startInlineEdit(variant)}
														aria-label="Edit variant"
														title="Edit pricing"
													>
														<Pencil class="h-3.5 w-3.5" />
													</Button>
													{#if isNative}
														<Button
															variant="ghost"
															size="icon"
															type="button"
															class="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
															title="Delete variant"
															aria-label="Delete variant"
															onclick={async () => {
																if (
																	await confirmState.confirm({
																		title: 'Delete Variant',
																		message: `Delete size ${variant.size}? This cannot be undone.`,
																		confirmText: 'Delete',
																		variant: 'destructive'
																	})
																) {
																	await nativeDeleteVariant(variant.id);
																}
															}}
														>
															<Trash class="h-3.5 w-3.5" />
														</Button>
													{:else}
														<form method="POST" action="?/deleteVariant" use:enhance>
															<input type="hidden" name="variantId" value={variant.id} />
															<Button
																variant="ghost"
																size="icon"
																type="button"
																class="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
																title="Delete variant"
																aria-label="Delete variant"
																onclick={async (e) => {
																	const formElement = e.currentTarget.closest('form');
																	if (
																		await confirmState.confirm({
																			title: 'Delete Variant',
																			message: `Delete size ${variant.size}? This cannot be undone.`,
																			confirmText: 'Delete',
																			variant: 'destructive'
																		})
																	) {
																		formElement?.requestSubmit();
																	}
																}}
															>
																<Trash class="h-3.5 w-3.5" />
															</Button>
														</form>
													{/if}
												</div>
											{/if}
										</Table.Cell>
									{/if}
								</Table.Row>
							{:else}
								<Table.Row>
									<Table.Cell
										colspan={batchStockMode ? 6 : 7}
										class="h-32 text-center text-muted-foreground italic"
									>
										<div class="flex flex-col items-center justify-center gap-2">
											<Package class="h-8 w-8 opacity-20" />
											<p>No variants yet.</p>
											<Button
												variant="outline"
												size="sm"
												onclick={() => (variantDialogOpen = true)}
												class="mt-2 cursor-pointer"
											>
												<Plus class="mr-1.5 h-3.5 w-3.5" /> Add Sizes
											</Button>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			</Card.Content>
		</Card.Root>
		<!-- ── Stock History ── -->
		{#if currentStockHistory.length > 0}
			<Card.Root>
				<Card.Header class="pb-0">
					<button
						class="flex w-full cursor-pointer items-center justify-between"
						onclick={() => (stockHistoryOpen = !stockHistoryOpen)}
					>
						<div class="flex items-center gap-2">
							<History class="h-4 w-4 text-muted-foreground" />
							<Card.Title>Stock History</Card.Title>
							<span class="text-xs text-muted-foreground">
								({currentStockHistory.length} entries)
							</span>
						</div>
						<ChevronDown
							class="h-4 w-4 text-muted-foreground transition-transform {stockHistoryOpen
								? 'rotate-180'
								: ''}"
						/>
					</button>
				</Card.Header>
				{#if stockHistoryOpen}
					<Card.Content class="p-0 pt-3">
						<div class="overflow-x-auto">
							<Table.Root>
								<Table.Header>
									<Table.Row>
										<Table.Head>Date</Table.Head>
										<Table.Head>Size</Table.Head>
										<Table.Head>Change</Table.Head>
										<Table.Head>Reason</Table.Head>
										<Table.Head class="hidden sm:table-cell">By</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each currentStockHistory as log}
										<Table.Row>
											<Table.Cell class="text-xs text-muted-foreground">
												{formatDateTime(log.createdAt)}
											</Table.Cell>
											<Table.Cell>
												<span
													class="inline-flex h-6 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-[11px] font-bold text-primary"
												>
													{log.size}
												</span>
											</Table.Cell>
											<Table.Cell>
												<span
													class="text-sm font-bold tabular-nums {log.changeAmount > 0
														? 'text-emerald-600 dark:text-emerald-400'
														: 'text-red-600 dark:text-red-400'}"
												>
													{log.changeAmount > 0 ? '+' : ''}{log.changeAmount}
												</span>
											</Table.Cell>
											<Table.Cell class="text-sm">{log.reason}</Table.Cell>
											<Table.Cell class="hidden text-xs text-muted-foreground sm:table-cell"
												>{log.userName ?? 'System'}</Table.Cell
											>
										</Table.Row>
									{/each}
								</Table.Body>
							</Table.Root>
						</div>
					</Card.Content>
				{/if}
			</Card.Root>
		{/if}
	{/if}
</div>

<!-- ── Hidden forms (web mode) ── -->
<form
	method="POST"
	action="?/editVariant"
	use:enhance={() => {
		editLoading = true;
		return async ({ update }) => {
			editLoading = false;
			await update();
		};
	}}
	bind:this={editFormEl}
	class="hidden"
>
	<input name="variantId" value={editingVariantId ?? ''} />
	<input name="price" value={editPrice} />
	<input name="costPrice" value={editCostPrice} />
	<input name="discount" value={editDiscount} />
</form>

<form
	method="POST"
	action="?/batchAdjustStock"
	use:enhance={() => {
		batchStockLoading = true;
		return async ({ update }) => {
			batchStockLoading = false;
			await update();
		};
	}}
	bind:this={batchStockFormEl}
	class="hidden"
>
	<input name="reason" value={batchStockReason} />
	{#each currentVariants as variant}
		<input name="variantIds" value={variant.id} />
		<input
			name="quantities"
			value={batchStockData[variant.id] ?? variant.stockQuantity.toString()}
		/>
	{/each}
</form>

<!-- ── Add Variant Dialog ── -->
<Dialog.Root bind:open={variantDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add New Sizes</Dialog.Title>
			<Dialog.Description>Add size variants to {currentProduct.name}.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/addVariant"
			use:enhance={() => {
				addVariantLoading = true;
				return async ({ update }) => {
					addVariantLoading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<!-- Size template selector -->
			<div class="space-y-3 rounded-lg border p-3">
				<div class="flex items-center justify-between">
					<Label class="text-sm font-semibold">Select Sizes</Label>
					<div class="flex items-center rounded-lg border bg-muted p-0.5">
						<button
							type="button"
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-all {variantTemplate ===
							'alpha'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted-foreground/10'}"
							onclick={() => (variantTemplate = 'alpha')}
						>
							Alpha
						</button>
						<button
							type="button"
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-all {variantTemplate ===
							'numeric'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted-foreground/10'}"
							onclick={() => (variantTemplate = 'numeric')}
						>
							Numeric
						</button>
					</div>
				</div>

				{#if availableSizes.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each availableSizes as size}
							<button
								type="button"
								class="cursor-pointer rounded-md border px-2.5 py-1 text-sm font-semibold transition-colors {variantSelectedSizes.includes(
									size
								)
									? 'border-primary bg-primary/10 text-primary'
									: 'border-border hover:bg-muted'}"
								onclick={() => toggleVariantSize(size)}
							>
								{size}
							</button>
						{/each}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground italic">
						All sizes from this template already exist.
					</p>
				{/if}

				<div class="flex items-center gap-2">
					<Input
						placeholder="Custom size…"
						bind:value={customVariantSizeInput}
						class="h-8 max-w-[200px] text-sm"
						onkeydown={(e: KeyboardEvent) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addCustomVariantSize();
							}
						}}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={addCustomVariantSize}
						class="cursor-pointer"
					>
						<Plus class="mr-1 h-3 w-3" /> Add
					</Button>
				</div>

				{#if variantSelectedSizes.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each variantSelectedSizes as size}
							<span
								class="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-0.5 text-sm font-medium"
							>
								{size}
								<input type="hidden" name="sizes" value={size} />
								<button
									type="button"
									class="cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:text-destructive"
									onclick={() => removeVariantSize(size)}
								>
									<X class="h-3 w-3" />
								</button>
							</span>
						{/each}
					</div>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label class="text-xs">Selling Price ({getCurrencySymbol()})</Label>
					<Input
						name="price"
						type="number"
						step="0.01"
						placeholder="Default"
						bind:value={newVariantPrice}
						class="h-9 text-sm"
					/>
					<p class="text-[10px] text-muted-foreground">
						{formatCurrency(currentProduct.templatePrice)}
					</p>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Cost Price ({getCurrencySymbol()})</Label>
					<Input
						name="costPrice"
						type="number"
						step="0.01"
						placeholder="Default"
						bind:value={newVariantCostPrice}
						class="h-9 text-sm"
					/>
					<p class="text-[10px] text-muted-foreground">
						{formatCurrency(currentProduct.costPrice ?? 0)}
					</p>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1.5">
					<Label class="text-xs">Discount (%)</Label>
					<Input
						name="discount"
						type="number"
						step="0.01"
						placeholder="Default"
						bind:value={newVariantDiscount}
						class="h-9 text-sm"
					/>
					<p class="text-[10px] text-muted-foreground">
						{currentProduct.defaultDiscount}%
					</p>
				</div>
				<div class="space-y-1.5">
					<Label class="text-xs">Initial Stock (per size)</Label>
					<Input
						name="initialStock"
						type="number"
						min="0"
						placeholder="0"
						bind:value={newVariantInitialStock}
						class="h-9 text-sm"
					/>
				</div>
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					disabled={addVariantLoading || variantSelectedSizes.length === 0}
					class="w-full cursor-pointer"
					onclick={async (e) => {
						if (isNative) {
							addVariantLoading = true;
							const price = newVariantPrice
								? parseFloat(newVariantPrice)
								: currentProduct.templatePrice;
							const costPrice = newVariantCostPrice
								? parseFloat(newVariantCostPrice)
								: currentProduct.costPrice || 0;
							const discount = newVariantDiscount
								? parseFloat(newVariantDiscount)
								: currentProduct.defaultDiscount || 0;
							const initialStock = parseInt(newVariantInitialStock) || 0;
							await nativeAddVariants(
								variantSelectedSizes,
								price,
								costPrice,
								discount,
								initialStock
							);
							addVariantLoading = false;
						} else {
							const formElement = e.currentTarget.closest('form');
							formElement?.requestSubmit();
						}
					}}
				>
					{#if addVariantLoading}
						<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
					{/if}
					Add {variantSelectedSizes.length} Size{variantSelectedSizes.length !== 1 ? 's' : ''}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
