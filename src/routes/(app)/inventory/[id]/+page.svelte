<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import {
		ArrowLeft,
		Plus,
		Minus,
		Trash,
		Printer,
		Pencil,
		Loader2,
		Package,
		AlertTriangle,
		PackageX,
		CircleCheck,
		X
	} from '@lucide/svelte';
	import { formatCurrency, getCurrencySymbol } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { navigating } from '$app/stores';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();

	let stockDialogOpen = $state(false);
	let variantDialogOpen = $state(false);
	let editVariantDialogOpen = $state(false);
	let selectedVariantId = $state('');
	let newStockQuantity = $state(0);
	let adjustReason = $state('');
	let newVariantPrice = $state('');
	let newVariantCostPrice = $state('');
	let newVariantDiscount = $state('');
	let newVariantInitialStock = $state('');
	let loading = $state(false);
	let deleteLoading = $state(false);

	// Variant editing state
	let editingVariant = $state<any>(null);
	let editVariantPrice = $state('');
	let editVariantCostPrice = $state('');
	let editVariantDiscount = $state('');

	function openStockDialog(variant: any) {
		selectedVariantId = variant.id;
		newStockQuantity = variant.stockQuantity;
		adjustReason = '';
		stockDialogOpen = true;
	}

	const SIZE_TEMPLATES = {
		alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
		numeric: ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54']
	};

	let variantTemplate = $state('alpha');
	let variantSelectedSizes = $state<string[]>([]);
	let customVariantSizeInput = $state('');

	// Clear selected sizes when template changes
	$effect(() => {
		variantTemplate;
		variantSelectedSizes = [];
	});

	const existingSizes = $derived(data.variants.map((v: any) => v.size));
	const availableSizes = $derived(
		SIZE_TEMPLATES[variantTemplate as keyof typeof SIZE_TEMPLATES].filter(
			(s) => !existingSizes.includes(s)
		)
	);

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

	function openEditVariant(variant: any) {
		editingVariant = variant;
		editVariantPrice = variant.price?.toString() ?? '';
		editVariantCostPrice = variant.costPrice?.toString() ?? '0';
		editVariantDiscount = variant.discount?.toString() ?? '0';
		editVariantDialogOpen = true;
	}

	$effect(() => {
		if (form?.stockSuccess) {
			toast.success('Stock updated successfully');
			stockDialogOpen = false;
			adjustReason = '';
		}
		if (form?.stockError) {
			toast.error(form.stockError);
		}
		if (form?.variantSuccess) {
			toast.success('Variants added successfully');
			variantDialogOpen = false;
			variantSelectedSizes = [];
			customVariantSizeInput = '';
			newVariantPrice = '';
			newVariantCostPrice = '';
			newVariantDiscount = '';
			newVariantInitialStock = '';
		}
		if (form?.variantError) {
			toast.error(form.variantError);
		}
		if (form?.deleteVariantSuccess) {
			toast.success('Variant deleted');
		}
		if (form?.editVariantSuccess) {
			toast.success('Variant updated');
			editVariantDialogOpen = false;
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	const totalStock = $derived(data.variants.reduce((sum: number, v: any) => sum + v.stockQuantity, 0));
	const healthyCount = $derived(data.variants.filter((v: any) => v.stockQuantity > 5).length);
	const lowCount = $derived(
		data.variants.filter((v: any) => v.stockQuantity > 0 && v.stockQuantity <= 5).length
	);
	const outCount = $derived(data.variants.filter((v: any) => v.stockQuantity === 0).length);

	// Per-variant stock value: sum of (variant costPrice * stockQuantity)
	const totalStockValue = $derived(
		data.variants.reduce((sum: number, v: any) => {
			const cost = v.costPrice ?? data.product.costPrice ?? 0;
			return sum + cost * v.stockQuantity;
		}, 0)
	);

	// Profit margins across variants
	const variantMargins = $derived(
		data.variants
			.filter((v: any) => {
				const cost = v.costPrice ?? data.product.costPrice ?? 0;
				return cost > 0 && v.price > 0;
			})
			.map((v: any) => {
				const cost = v.costPrice ?? data.product.costPrice ?? 0;
				return Math.round(((v.price - cost) / v.price) * 100);
			})
	);
	const minMargin = $derived(variantMargins.length > 0 ? Math.min(...variantMargins) : 0);
	const maxMargin = $derived(variantMargins.length > 0 ? Math.max(...variantMargins) : 0);

	function stockChipClass(qty: number): string {
		if (qty === 0)
			return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-900';
		if (qty <= 5)
			return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-900';
		return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-900';
	}

	function stockBadgeVariant(qty: number): 'destructive' | 'secondary' | 'outline' {
		if (qty === 0) return 'destructive';
		if (qty <= 5) return 'secondary';
		return 'outline';
	}
</script>

<svelte:head>
	<title>{data.product.name} — Inventory — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-6">
	{#if $navigating}
		<div class="animate-pulse space-y-6">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<div class="h-10 w-10 rounded-md bg-muted"></div>
					<div class="space-y-2">
						<div class="h-8 w-48 rounded bg-muted"></div>
						<div class="h-4 w-32 rounded bg-muted"></div>
					</div>
				</div>
				<div class="flex gap-2">
					<div class="h-10 w-24 rounded bg-muted"></div>
					<div class="h-10 w-24 rounded bg-muted"></div>
				</div>
			</div>
			<div class="grid gap-4 sm:grid-cols-4">
				{#each Array(4) as _}
					<div class="h-20 rounded-lg border bg-muted/50"></div>
				{/each}
			</div>
			<div class="grid gap-6 lg:grid-cols-3">
				<div class="h-[400px] rounded-lg border bg-muted/50 lg:col-span-2"></div>
				<div class="space-y-6">
					<div class="h-[200px] rounded-lg border bg-muted/50"></div>
					<div class="h-[150px] rounded-lg border bg-muted/50"></div>
				</div>
			</div>
		</div>
	{:else}
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button variant="outline" size="icon" href="/inventory" class="cursor-pointer">
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div>
					<h1 class="text-3xl font-bold tracking-tight">{data.product.name}</h1>
					<div class="mt-1 flex items-center gap-2 text-muted-foreground">
						<Badge variant="secondary">{data.product.category}</Badge>
						<span>Total Stock: {totalStock}</span>
					</div>
				</div>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" href="/inventory/{data.product.id}/labels" class="cursor-pointer">
					<Printer class="mr-2 h-4 w-4" /> Labels
				</Button>
				<Button variant="outline" href="/inventory/{data.product.id}/edit" class="cursor-pointer">
					<Pencil class="mr-2 h-4 w-4" /> Edit
				</Button>
				{#if data.user?.role === 'admin'}
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
							type="button"
							disabled={deleteLoading}
							class="cursor-pointer"
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (
									await confirmState.confirm(
										'Are you sure you want to delete this product? This action cannot be undone.'
									)
								) {
									formElement?.requestSubmit();
								}
							}}
						>
							{#if deleteLoading}
								<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							{:else}
								<Trash class="mr-2 h-4 w-4" />
							{/if}
							Delete
						</Button>
					</form>
				{/if}
			</div>
		</div>

		<!-- Stock Health Summary -->
		<div class="grid gap-4 sm:grid-cols-4">
			<Card.Root>
				<Card.Content class="flex items-center gap-3 p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
						<Package class="h-4 w-4 text-primary" />
					</div>
					<div>
						<p class="text-xs text-muted-foreground">Total Stock</p>
						<p class="text-xl font-bold break-words break-all">{totalStock}</p>
					</div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center gap-3 p-4">
					<div
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10"
					>
						<CircleCheck class="h-4 w-4 text-emerald-500" />
					</div>
					<div>
						<p class="text-xs text-muted-foreground">Healthy</p>
						<p class="text-xl font-bold break-words break-all">{healthyCount}</p>
					</div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center gap-3 p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
						<AlertTriangle class="h-4 w-4 text-amber-500" />
					</div>
					<div>
						<p class="text-xs text-muted-foreground">Low Stock</p>
						<p class="text-xl font-bold break-words break-all">{lowCount}</p>
					</div>
				</Card.Content>
			</Card.Root>
			<Card.Root>
				<Card.Content class="flex items-center gap-3 p-4">
					<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
						<PackageX class="h-4 w-4 text-red-500" />
					</div>
					<div>
						<p class="text-xs text-muted-foreground">Out of Stock</p>
						<p class="text-xl font-bold break-words break-all">{outCount}</p>
					</div>
				</Card.Content>
			</Card.Root>
		</div>

		<div class="grid gap-6 lg:grid-cols-3">
			<!-- Variants Table -->
			<Card.Root class="lg:col-span-2">
				<Card.Header>
					<div class="flex items-center justify-between">
						<div>
							<Card.Title>Variants & Stock</Card.Title>
							<Card.Description>Manage individual sizes and colors.</Card.Description>
						</div>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								onclick={() => (variantDialogOpen = true)}
								class="cursor-pointer"
							>
								<Plus class="mr-1 h-3.5 w-3.5" /> Add Variant
							</Button>
						</div>
					</div>
				</Card.Header>
				<Card.Content>
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Size</Table.Head>
								<Table.Head>Barcode</Table.Head>
								<Table.Head>Price</Table.Head>
								<Table.Head>Cost</Table.Head>
								<Table.Head>Stock</Table.Head>
								<Table.Head class="text-right">Actions</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each data.variants as variant}
								<Table.Row>
									<Table.Cell class="font-medium">{variant.size}</Table.Cell>
									<Table.Cell>
										<code class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
											>{variant.barcode}</code
										>
									</Table.Cell>
									<Table.Cell>
										<div>{formatCurrency(variant.price)}</div>
										{#if variant.discount && variant.discount > 0}
											<div class="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
												-{variant.discount}% discount
											</div>
										{/if}
									</Table.Cell>
									<Table.Cell>
										<div class="text-sm">{formatCurrency(variant.costPrice ?? data.product.costPrice ?? 0)}</div>
									</Table.Cell>
									<Table.Cell>
										<span
											class="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold {stockChipClass(
												variant.stockQuantity
											)}"
										>
											{variant.stockQuantity}
										</span>
									</Table.Cell>
									<Table.Cell class="text-right">
										<div class="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 cursor-pointer text-blue-600 hover:bg-blue-50 hover:text-blue-700"
												onclick={() => openStockDialog(variant)}
												title="Update stock"
											>
												<Package class="h-3.5 w-3.5" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												class="h-8 w-8 cursor-pointer"
												onclick={() => openEditVariant(variant)}
												title="Edit variant"
											>
												<Pencil class="h-3.5 w-3.5" />
											</Button>
											<form method="POST" action="?/deleteVariant" use:enhance>
												<input type="hidden" name="variantId" value={variant.id} />
												<Button
													variant="ghost"
													size="icon"
													type="button"
													class="h-8 w-8 cursor-pointer text-muted-foreground hover:text-destructive"
													title="Delete variant"
													onclick={async (e) => {
														const formElement = e.currentTarget.closest('form');
														if (
															await confirmState.confirm(
																`Delete variant ${variant.size}? This cannot be undone.`
															)
														) {
															formElement?.requestSubmit();
														}
													}}
												>
													<Trash class="h-3.5 w-3.5" />
												</Button>
											</form>
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
			</Card.Root>

			<!-- Product Info Sidebar -->
			<div class="space-y-6">
				<Card.Root>
					<Card.Header>
						<Card.Title>Product Info</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						<div>
							<p class="text-xs text-muted-foreground">Default Selling Price</p>
							<p class="text-xl font-bold break-words break-all">
								{formatCurrency(data.product.templatePrice)}
							</p>
						</div>
						<div>
							<p class="text-xs text-muted-foreground">Default Cost Price</p>
							<p class="text-lg font-bold break-words break-all">
								{formatCurrency(data.product.costPrice ?? 0)}
							</p>
						</div>
						<div>
							<p class="text-xs text-muted-foreground">Total Stock Value (At Cost)</p>
							<p class="text-lg font-bold break-words break-all text-indigo-600 dark:text-indigo-400">
								{formatCurrency(totalStockValue)}
							</p>
						</div>
						{#if variantMargins.length > 0}
							<div>
								<p class="text-xs text-muted-foreground">Profit Margin</p>
								{#if minMargin === maxMargin}
									<p class="font-medium text-emerald-600 dark:text-emerald-400">
										{minMargin}%
									</p>
								{:else}
									<p class="font-medium text-emerald-600 dark:text-emerald-400">
										{minMargin}% – {maxMargin}%
									</p>
								{/if}
							</div>
						{/if}
						<div>
							<p class="text-xs text-muted-foreground">Default Discount</p>
							<p class="font-medium">{data.product.defaultDiscount}%</p>
						</div>
						{#if data.product.description}
							<div>
								<p class="text-xs text-muted-foreground">Description</p>
								<p class="text-sm">{data.product.description}</p>
							</div>
						{/if}
					</Card.Content>
				</Card.Root>

				<!-- Size Stock Overview (visual) -->
				<Card.Root>
					<Card.Header>
						<Card.Title>Size Overview</Card.Title>
					</Card.Header>
					<Card.Content>
						<div class="flex flex-wrap gap-2">
							{#each data.variants as variant}
								<div
									class="flex min-w-[3.5rem] flex-col items-center rounded-lg border p-2 {stockChipClass(
										variant.stockQuantity
									)}"
									title="{variant.size}: {variant.stockQuantity} in stock — {formatCurrency(
										variant.price
									)}"
								>
									<span class="text-xs font-medium">{variant.size}</span>
									<span class="text-lg font-bold">{variant.stockQuantity}</span>
									<span class="text-[10px] text-muted-foreground"
										>{formatCurrency(variant.price)}</span
									>
								</div>
							{/each}
						</div>
					</Card.Content>
				</Card.Root>
			</div>
		</div>
	{/if}
</div>

<!-- Update Stock Dialog -->
<Dialog.Root bind:open={stockDialogOpen}>
	<Dialog.Content>
		{@const selectedVariant = data.variants.find((v: any) => v.id === selectedVariantId)}
		<Dialog.Header>
			<Dialog.Title>Update Stock: {selectedVariant?.size}</Dialog.Title>
			<Dialog.Description>Set the new stock level for this variant.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/adjustStock"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<input type="hidden" name="variantId" value={selectedVariantId} />

			<div class="space-y-2">
				<Label for="newQuantity">New Stock Quantity</Label>
				<div class="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="icon"
						onclick={() => (newStockQuantity = Math.max(0, newStockQuantity - 1))}
						class="cursor-pointer"
					>
						<Minus class="h-4 w-4" />
					</Button>
					<Input
						id="newQuantity"
						name="newQuantity"
						type="number"
						min="0"
						bind:value={newStockQuantity}
						class="text-center text-lg font-bold"
						required
					/>
					<Button
						type="button"
						variant="outline"
						size="icon"
						onclick={() => (newStockQuantity += 1)}
						class="cursor-pointer"
					>
						<Plus class="h-4 w-4" />
					</Button>
				</div>
				<p class="text-center text-xs text-muted-foreground">
					Current stock: <span class="font-bold">{selectedVariant?.stockQuantity}</span>
					&rarr; New stock:
					<span
						class="font-bold {newStockQuantity > (selectedVariant?.stockQuantity ?? 0)
							? 'text-emerald-600'
							: newStockQuantity < (selectedVariant?.stockQuantity ?? 0)
								? 'text-red-600'
								: ''}">{newStockQuantity}</span
					>
				</p>
			</div>

			<div class="space-y-2">
				<Label for="adjust-reason">Reason for Update</Label>
				<Input
					id="adjust-reason"
					name="reason"
					placeholder="e.g. Restock, Damage, Correction..."
					bind:value={adjustReason}
					required
				/>
			</div>

			<Dialog.Footer>
				<Button
					type="button"
					disabled={loading || !adjustReason || !selectedVariantId}
					class="w-full cursor-pointer"
					onclick={async (e) => {
						const formElement = e.currentTarget.closest('form');
						const diff = newStockQuantity - (selectedVariant?.stockQuantity ?? 0);
						if (diff === 0) {
							stockDialogOpen = false;
							return;
						}
						const action = diff > 0 ? 'Add' : 'Remove';
						if (
							await confirmState.confirm({
								title: 'Update Stock',
								message: `Are you sure you want to change stock from ${selectedVariant?.stockQuantity} to ${newStockQuantity}? (${action} ${Math.abs(diff)} units)`,
								confirmText: 'Confirm Update',
								variant: diff > 0 ? 'default' : 'destructive'
							})
						) {
							formElement?.requestSubmit();
						}
					}}
				>
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Save Stock Level
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Add Variant Dialog -->
<Dialog.Root bind:open={variantDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add New Variants</Dialog.Title>
			<Dialog.Description>Add new size variants to this product.</Dialog.Description>
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
			<!-- Size Template Selector -->
			<div class="space-y-4 rounded-lg border p-4">
				<div class="flex items-center justify-between">
					<Label class="text-sm font-semibold">Select Sizes</Label>
					<div class="w-[180px]">
						<Select.Root type="single" bind:value={variantTemplate}>
							<Select.Trigger>
								{variantTemplate === 'alpha' ? 'Alpha (S, M, L...)' : 'Numeric (28, 30...)'}
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="alpha" class="cursor-pointer">Alpha (S, M, L...)</Select.Item>
								<Select.Item value="numeric" class="cursor-pointer">Numeric (28, 30...)</Select.Item
								>
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				{#if availableSizes.length > 0}
					<div class="flex flex-wrap gap-3">
						{#each availableSizes as size}
							<button
								type="button"
								class="flex cursor-pointer items-center space-x-2 rounded-md border px-3 py-1.5 text-sm transition-colors {variantSelectedSizes.includes(size) ? 'border-primary bg-primary/10 font-semibold text-primary' : 'border-border hover:bg-muted'}"
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

				<!-- Custom size input -->
				<div class="flex items-center gap-2">
					<Input
						placeholder="Custom size (e.g. OneSize, Free, 27)"
						bind:value={customVariantSizeInput}
						class="max-w-[240px]"
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
						<Plus class="mr-1 h-3.5 w-3.5" /> Add
					</Button>
				</div>

				<!-- Selected sizes as removable badges -->
				{#if variantSelectedSizes.length > 0}
					<div class="flex flex-wrap gap-2">
						{#each variantSelectedSizes as size}
							<span
								class="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-sm font-medium"
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

			<div class="space-y-2">
				<Label for="new-price">Selling Price ({getCurrencySymbol()})</Label>
				<Input
					id="new-price"
					name="price"
					type="number"
					step="0.01"
					placeholder="Leave blank to use default"
					bind:value={newVariantPrice}
				/>
				<p class="text-xs text-muted-foreground">
					Default: {formatCurrency(data.product.templatePrice)}
				</p>
			</div>

			<div class="space-y-2">
				<Label for="new-cost-price">Cost Price ({getCurrencySymbol()})</Label>
				<Input
					id="new-cost-price"
					name="costPrice"
					type="number"
					step="0.01"
					placeholder="Leave blank to use default"
					bind:value={newVariantCostPrice}
				/>
				<p class="text-xs text-muted-foreground">
					Default: {formatCurrency(data.product.costPrice ?? 0)}
				</p>
			</div>

			<div class="space-y-2">
				<Label for="new-discount">Discount (%)</Label>
				<Input
					id="new-discount"
					name="discount"
					type="number"
					step="0.01"
					placeholder="Leave blank to use default"
					bind:value={newVariantDiscount}
				/>
				<p class="text-xs text-muted-foreground">Default: {data.product.defaultDiscount}%</p>
			</div>

			<div class="space-y-2">
				<Label for="new-stock">Initial Stock (per size)</Label>
				<Input
					id="new-stock"
					name="initialStock"
					type="number"
					min="0"
					placeholder="0"
					bind:value={newVariantInitialStock}
				/>
			</div>

			<Dialog.Footer>
				<Button
					type="submit"
					disabled={loading || variantSelectedSizes.length === 0}
					class="w-full cursor-pointer"
				>
					{#if loading}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					Add {variantSelectedSizes.length} Variant{variantSelectedSizes.length !== 1 ? 's' : ''}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit Variant Dialog -->
<Dialog.Root bind:open={editVariantDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit Variant</Dialog.Title>
			<Dialog.Description>
				{editingVariant?.size}
			</Dialog.Description>
		</Dialog.Header>
		<form method="POST" action="?/editVariant" use:enhance class="space-y-4">
			<input type="hidden" name="variantId" value={editingVariant?.id} />
			<div class="space-y-2">
				<Label>Selling Price ({getCurrencySymbol()})</Label>
				<Input
					name="price"
					type="number"
					step="0.01"
					placeholder="Enter price"
					bind:value={editVariantPrice}
				/>
				<p class="text-xs text-muted-foreground">
					Default: {formatCurrency(data.product.templatePrice)}
				</p>
			</div>
			<div class="space-y-2">
				<Label>Cost Price ({getCurrencySymbol()})</Label>
				<Input
					name="costPrice"
					type="number"
					step="0.01"
					placeholder="Enter cost price"
					bind:value={editVariantCostPrice}
				/>
				<p class="text-xs text-muted-foreground">
					Default: {formatCurrency(data.product.costPrice ?? 0)}
				</p>
			</div>
			<div class="space-y-2">
				<Label>Default Discount (%)</Label>
				<Input
					name="discount"
					type="number"
					step="0.01"
					placeholder="0.00"
					bind:value={editVariantDiscount}
				/>
				<p class="text-xs text-muted-foreground">
					Applies automatically to POS sales (editable there)
				</p>
			</div>
			<Dialog.Footer>
				<Button
					type="button"
					class="w-full cursor-pointer"
					onclick={async (e) => {
						const formElement = e.currentTarget.closest('form');
						if (
							await confirmState.confirm({
								title: 'Update Variant',
								message: `Are you sure you want to update the price/discount for variant ${editingVariant?.size}?`,
								confirmText: 'Save Changes',
								variant: 'default'
							})
						) {
							formElement?.requestSubmit();
						}
					}}
				>
					Save Changes
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
