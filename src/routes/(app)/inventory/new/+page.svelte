<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import { ArrowLeft, Loader2, X, Plus } from '@lucide/svelte';
	import { getCurrencySymbol } from '$lib/format';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	const SIZE_TEMPLATES = {
		alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
		numeric: ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54']
	};

	let selectedTemplate = $state('alpha');
	let loading = $state(false);
	let customSizeInput = $state('');

	// Track default prices for placeholders in size table
	let defaultSellingPrice = $state('');
	let defaultCostPrice = $state('');

	$effect(() => {
		if (form?.data?.templatePrice) defaultSellingPrice = form.data.templatePrice as string;
		if (form?.data?.costPrice) defaultCostPrice = form.data.costPrice as string;
	});

	let sizeData = $state<
		Record<string, { quantity: string; sellingPrice: string; costPrice: string }>
	>({});

	// Clear selections when template changes
	$effect(() => {
		selectedTemplate;
		sizeData = {};
	});

	const selectedSizes = $derived(Object.keys(sizeData));

	function toggleSize(size: string) {
		if (size in sizeData) {
			const { [size]: _, ...rest } = sizeData;
			sizeData = rest;
		} else {
			sizeData = { ...sizeData, [size]: { quantity: '', sellingPrice: '', costPrice: '' } };
		}
	}

	function removeSize(size: string) {
		const { [size]: _, ...rest } = sizeData;
		sizeData = rest;
	}

	function addCustomSize() {
		const size = customSizeInput.trim();
		if (!size) return;
		if (size in sizeData) {
			toast.error(`Size "${size}" is already added`);
			return;
		}
		sizeData = { ...sizeData, [size]: { quantity: '', sellingPrice: '', costPrice: '' } };
		customSizeInput = '';
	}
</script>

<svelte:head>
	<title>New Product — Clothing POS</title>
</svelte:head>

<div class="p-4 pb-24 sm:p-6 md:pb-6">
	<div class="mb-5 flex items-center gap-4">
		<Button
			variant="outline"
			size="icon"
			href="/inventory"
			class="cursor-pointer"
			aria-label="Back to inventory"
		>
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">New Product</h1>
	</div>

	<form
		method="POST"
		use:enhance={() => {
			loading = true;
			return async ({ update, result }) => {
				loading = false;
				if (result.type === 'failure') {
					toast.error('Please fix the errors below');
				}
				await update();
			};
		}}
	>
		<div class="grid gap-5 lg:grid-cols-5">
			<!-- Left: Product Details -->
			<div class="space-y-4 rounded-lg border bg-card p-4 sm:p-5 lg:col-span-2">
				<h2 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
					Product Details
				</h2>

				<div class="space-y-2">
					<Label for="name">Product Name</Label>
					<Input
						id="name"
						name="name"
						placeholder="e.g. Premium Cotton T-Shirt"
						value={(form?.data?.name as string) ?? ''}
					/>
					{#if form?.errors?.name}
						<p class="text-sm text-destructive">{form.errors.name}</p>
					{/if}
				</div>

				<div class="space-y-2">
					<Label for="category">Category</Label>
					<Autocomplete
						id="category"
						name="category"
						placeholder="e.g. T-Shirt, Jeans"
						value={(form?.data?.category as string) ?? ''}
						suggestions={data.categories}
					/>
					{#if form?.errors?.category}
						<p class="text-sm text-destructive">{form.errors.category}</p>
					{/if}
				</div>

				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="templatePrice">Selling Price ({getCurrencySymbol()})</Label>
						<Input
							id="templatePrice"
							name="templatePrice"
							type="number"
							step="0.01"
							placeholder="0.00"
							bind:value={defaultSellingPrice}
						/>
						{#if form?.errors?.templatePrice}
							<p class="text-sm text-destructive">{form.errors.templatePrice}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="costPrice">Cost Price ({getCurrencySymbol()})</Label>
						<Input
							id="costPrice"
							name="costPrice"
							type="number"
							step="0.01"
							placeholder="0.00"
							bind:value={defaultCostPrice}
						/>
						{#if form?.errors?.costPrice}
							<p class="text-sm text-destructive">{form.errors.costPrice}</p>
						{/if}
					</div>
				</div>

				<div class="space-y-2">
					<Label for="defaultDiscount">Discount (%)</Label>
					<Input
						id="defaultDiscount"
						name="defaultDiscount"
						type="number"
						step="0.01"
						placeholder="0"
						value={(form?.data?.defaultDiscount as string) ?? ''}
					/>
				</div>

				<div class="space-y-2">
					<Label for="description">Description (Optional)</Label>
					<Input
						id="description"
						name="description"
						placeholder="Brief product description…"
						value={(form?.data?.description as string) ?? ''}
					/>
				</div>
			</div>

			<!-- Right: Size Variants -->
			<div class="space-y-3 rounded-lg border bg-card p-4 sm:p-5 lg:col-span-3">
				<!-- Header -->
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div class="flex items-center gap-2">
						<h2 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
							Size Variants
						</h2>
						{#if selectedSizes.length > 0}
							<span
								class="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground"
							>
								{selectedSizes.length}
							</span>
						{/if}
					</div>
					<div class="flex items-center rounded-lg border bg-muted p-0.5">
						<button
							type="button"
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-all {selectedTemplate ===
							'alpha'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted-foreground/10'}"
							onclick={() => (selectedTemplate = 'alpha')}
						>
							Alpha (S, M, L…)
						</button>
						<button
							type="button"
							class="h-7 rounded-md px-2.5 text-xs font-medium transition-all {selectedTemplate ===
							'numeric'
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:bg-muted-foreground/10'}"
							onclick={() => (selectedTemplate = 'numeric')}
						>
							Numeric (28, 30…)
						</button>
					</div>
				</div>

				<!-- Size buttons + custom -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#each SIZE_TEMPLATES[selectedTemplate as keyof typeof SIZE_TEMPLATES] as size}
						<button
							type="button"
							class="cursor-pointer rounded-md border px-2.5 py-1 text-sm font-semibold transition-all {size in
							sizeData
								? 'border-primary bg-primary text-primary-foreground shadow-sm'
								: 'border-border bg-background hover:bg-muted'}"
							onclick={() => toggleSize(size)}
						>
							{size}
						</button>
					{/each}
					<span class="mx-1 text-muted-foreground/30">|</span>
					<div class="flex items-center gap-1">
						<Input
							placeholder="Custom…"
							bind:value={customSizeInput}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addCustomSize();
								}
							}}
							class="h-8 w-28 text-sm"
						/>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							onclick={addCustomSize}
							class="h-8 w-8 cursor-pointer"
							aria-label="Add custom size"
						>
							<Plus class="h-3.5 w-3.5" />
						</Button>
					</div>
				</div>

				<!-- Size table -->
				{#if selectedSizes.length > 0}
					<div class="overflow-x-auto rounded-lg border">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b bg-muted/50">
									<th class="px-3 py-1.5 text-left font-semibold">Size</th>
									<th class="px-3 py-1.5 text-left font-semibold text-blue-600 dark:text-blue-400"
										>Qty</th
									>
									<th class="px-3 py-1.5 text-left font-semibold"
										>Selling ({getCurrencySymbol()})</th
									>
									<th class="px-3 py-1.5 text-left font-semibold">Cost ({getCurrencySymbol()})</th>
									<th class="w-10 px-2 py-1.5"></th>
								</tr>
							</thead>
							<tbody>
								{#each selectedSizes as size}
									<tr class="border-b last:border-b-0 hover:bg-muted/30">
										<td class="px-3 py-1">
											<span
												class="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-primary/10 px-2 text-xs font-bold text-primary"
											>
												{size}
											</span>
										</td>
										<td class="px-3 py-1">
											<Input
												type="number"
												min="0"
												value={sizeData[size].quantity}
												oninput={(e: Event) => {
													sizeData = {
														...sizeData,
														[size]: {
															...sizeData[size],
															quantity: (e.target as HTMLInputElement).value
														}
													};
												}}
												class="h-8 w-20 border-blue-200 text-sm focus-visible:ring-blue-500/30 dark:border-blue-800"
												placeholder="0"
											/>
										</td>
										<td class="px-3 py-1">
											<Input
												type="number"
												step="0.01"
												min="0"
												value={sizeData[size].sellingPrice}
												oninput={(e: Event) => {
													sizeData = {
														...sizeData,
														[size]: {
															...sizeData[size],
															sellingPrice: (e.target as HTMLInputElement).value
														}
													};
												}}
												class="h-8 w-24 text-sm"
												placeholder={defaultSellingPrice || '0.00'}
											/>
										</td>
										<td class="px-3 py-1">
											<Input
												type="number"
												step="0.01"
												min="0"
												value={sizeData[size].costPrice}
												oninput={(e: Event) => {
													sizeData = {
														...sizeData,
														[size]: {
															...sizeData[size],
															costPrice: (e.target as HTMLInputElement).value
														}
													};
												}}
												class="h-8 w-24 text-sm"
												placeholder={defaultCostPrice || '0.00'}
											/>
										</td>
										<td class="px-2 py-1">
											<button
												type="button"
												class="cursor-pointer rounded-md p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
												onclick={() => removeSize(size)}
												title="Remove {size}"
											>
												<X class="h-4 w-4" />
											</button>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>

					<div class="flex items-center gap-2">
						<Label for="stockReason" class="shrink-0 text-xs text-muted-foreground">Reason:</Label>
						<Input
							id="stockReason"
							name="stockReason"
							placeholder="e.g. Opening stock, New shipment…"
							value={form?.data?.stockReason ?? ''}
							class="h-8 w-56 text-sm"
						/>
					</div>
				{:else}
					<div
						class="flex h-32 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground"
					>
						Click sizes above to add variants
					</div>
				{/if}

				<!-- Hidden form fields -->
				{#each selectedSizes as size}
					<input type="hidden" name="sizes" value={size} />
					<input type="hidden" name="quantities" value={sizeData[size].quantity} />
					<input type="hidden" name="sellingPrices" value={sizeData[size].sellingPrice} />
					<input type="hidden" name="costPrices" value={sizeData[size].costPrice} />
				{/each}

				{#if form?.errors?.sizes}
					<p class="text-sm font-medium text-destructive">{form.errors.sizes}</p>
				{/if}
			</div>
		</div>

		<!-- Submit -->
		<div class="mt-5 flex justify-end gap-3">
			<Button variant="outline" href="/inventory" class="h-11 w-28 cursor-pointer">Cancel</Button>
			<Button type="submit" class="h-11 w-44 cursor-pointer text-base font-bold" disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-5 w-5 animate-spin" />
					Creating…
				{:else}
					Create Product
				{/if}
			</Button>
		</div>
	</form>
</div>
