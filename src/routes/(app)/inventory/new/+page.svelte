<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
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

	let sizeData = $state<Record<string, { quantity: string; sellingPrice: string; costPrice: string }>>({});

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

<div class="p-6">
	<div class="mb-6 flex items-center gap-4">
		<Button variant="outline" size="icon" href="/inventory" class="cursor-pointer">
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-3xl font-bold tracking-tight">New Product</h1>
	</div>

	<div class="rounded-lg border bg-card shadow-sm">
		<div class="border-b p-6">
			<h2 class="text-xl font-semibold">Product Details</h2>
			<p class="text-sm text-muted-foreground">Create a new product and its size variants.</p>
		</div>
		<div class="p-6">
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
				class="space-y-8"
			>
				<div class="grid gap-6 md:grid-cols-2">
					<div class="space-y-4">
						<div class="space-y-2">
							<Label for="name">Product Name</Label>
							<Input
								id="name"
								name="name"
								placeholder="e.g. Premium Cotton T-Shirt"
								value={(form?.data?.name as string) ?? ''}
								class="h-11"
							/>
							{#if form?.errors?.name}
								<p class="text-sm text-destructive">{form.errors.name}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="description">Description (Optional)</Label>
							<Textarea
								id="description"
								name="description"
								placeholder="Brief product description..."
								value={(form?.data?.description as string) ?? ''}
								class="min-h-[120px] resize-none"
							/>
						</div>
					</div>

					<div class="space-y-4">
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

						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="templatePrice">Default Selling Price ({getCurrencySymbol()})</Label>
								<Input
									id="templatePrice"
									name="templatePrice"
									type="number"
									step="0.01"
									placeholder="0.00"
									value={(form?.data?.templatePrice as string) ?? ''}
									class="h-11"
								/>
								{#if form?.errors?.templatePrice}
									<p class="text-sm text-destructive">{form.errors.templatePrice}</p>
								{/if}
							</div>
							<div class="space-y-2">
								<Label for="costPrice">Default Cost Price ({getCurrencySymbol()})</Label>
								<Input
									id="costPrice"
									name="costPrice"
									type="number"
									step="0.01"
									placeholder="0.00"
									value={(form?.data?.costPrice as string) ?? ''}
									class="h-11"
								/>
								{#if form?.errors?.costPrice}
									<p class="text-sm text-destructive">{form.errors.costPrice}</p>
								{/if}
							</div>
						</div>
						<div class="space-y-2">
							<Label for="defaultDiscount">Default Discount (%)</Label>
							<Input
								id="defaultDiscount"
								name="defaultDiscount"
								type="number"
								step="0.01"
								placeholder="0"
								value={(form?.data?.defaultDiscount as string) ?? ''}
								class="h-11"
							/>
						</div>
					</div>
				</div>

				<div class="space-y-6 rounded-xl border bg-muted/30 p-6">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<Label class="text-lg font-bold">Size Variants</Label>
							<p class="text-sm text-muted-foreground">
								Select the sizes you want to create and set pricing & stock.
							</p>
						</div>
						<div class="w-[200px]">
							<Select.Root type="single" bind:value={selectedTemplate}>
								<Select.Trigger class="h-10 bg-background">
									{selectedTemplate === 'alpha' ? 'Alpha (S, M, L...)' : 'Numeric (28, 30...)'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="alpha" class="cursor-pointer">Alpha (S, M, L...)</Select.Item>
									<Select.Item value="numeric" class="cursor-pointer"
										>Numeric (28, 30...)</Select.Item
									>
								</Select.Content>
							</Select.Root>
						</div>
					</div>

					<div class="flex flex-wrap gap-2">
						{#each SIZE_TEMPLATES[selectedTemplate as keyof typeof SIZE_TEMPLATES] as size}
							<button
								type="button"
								class="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-semibold transition-colors {size in sizeData ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'}"
								onclick={() => toggleSize(size)}
							>
								{size}
							</button>
						{/each}
					</div>

					<!-- Custom size input -->
					<div class="flex max-w-md items-center gap-2">
						<Input
							placeholder="Custom size (e.g. OneSize, Free, 27)"
							bind:value={customSizeInput}
							onkeydown={(e: KeyboardEvent) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									addCustomSize();
								}
							}}
							class="h-10"
						/>
						<Button type="button" variant="outline" onclick={addCustomSize} class="cursor-pointer">
							<Plus class="mr-2 h-4 w-4" /> Add Size
						</Button>
					</div>

					{#if selectedSizes.length > 0}
						<div class="space-y-6 border-t border-muted-foreground/10 pt-4">
							<div class="space-y-3">
								<Label class="text-sm font-bold tracking-wider text-muted-foreground uppercase"
									>Per-Size Pricing & Stock</Label
								>
								<p class="text-xs text-muted-foreground">
									Leave price fields blank to use the defaults above.
								</p>
								<div class="overflow-x-auto rounded-lg border bg-background">
									<table class="w-full text-sm">
										<thead>
											<tr class="border-b bg-muted/50">
												<th class="px-3 py-2 text-left font-semibold">Size</th>
												<th class="px-3 py-2 text-left font-semibold">Selling ({getCurrencySymbol()})</th>
												<th class="px-3 py-2 text-left font-semibold">Cost ({getCurrencySymbol()})</th>
												<th class="px-3 py-2 text-left font-semibold">Qty</th>
												<th class="w-8 px-2 py-2"></th>
											</tr>
										</thead>
										<tbody>
											{#each selectedSizes as size}
												<tr class="border-b last:border-b-0">
													<td class="px-3 py-2 font-bold">{size}</td>
													<td class="px-3 py-2">
														<Input
															type="number"
															step="0.01"
															min="0"
															value={sizeData[size].sellingPrice}
															oninput={(e: Event) => {
																sizeData = {
																	...sizeData,
																	[size]: { ...sizeData[size], sellingPrice: (e.target as HTMLInputElement).value }
																};
															}}
															class="h-8 w-28 text-sm"
															placeholder="Default"
														/>
													</td>
													<td class="px-3 py-2">
														<Input
															type="number"
															step="0.01"
															min="0"
															value={sizeData[size].costPrice}
															oninput={(e: Event) => {
																sizeData = {
																	...sizeData,
																	[size]: { ...sizeData[size], costPrice: (e.target as HTMLInputElement).value }
																};
															}}
															class="h-8 w-28 text-sm"
															placeholder="Default"
														/>
													</td>
													<td class="px-3 py-2">
														<Input
															type="number"
															min="0"
															value={sizeData[size].quantity}
															oninput={(e: Event) => {
																sizeData = {
																	...sizeData,
																	[size]: { ...sizeData[size], quantity: (e.target as HTMLInputElement).value }
																};
															}}
															class="h-8 w-20 text-sm"
															placeholder="0"
														/>
													</td>
													<td class="px-2 py-2">
														<button
															type="button"
															class="cursor-pointer rounded-full p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive"
															onclick={() => removeSize(size)}
														>
															<X class="h-3 w-3" />
														</button>
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>

							<div class="max-w-xl space-y-2 rounded-lg border border-primary/10 bg-primary/5 p-4">
								<Label for="stockReason" class="text-sm font-bold">Stock Adjustment Reason</Label>
								<Input
									id="stockReason"
									name="stockReason"
									placeholder="e.g. Initial Opening Stock, New Shipment..."
									value={form?.data?.stockReason ?? ''}
									class="h-11 bg-background"
								/>
								<p class="text-[11px] text-muted-foreground">
									This will be recorded in the stock logs for all variants with quantity > 0.
								</p>
							</div>
						</div>
					{/if}

					<!-- Hidden form fields for sizes, quantities, and per-variant prices -->
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

				<div class="flex justify-end gap-4 pt-4">
					<Button variant="outline" href="/inventory" class="h-12 w-32 cursor-pointer"
						>Cancel</Button
					>
					<Button
						type="submit"
						class="h-12 w-48 cursor-pointer text-base font-bold"
						disabled={loading}
					>
						{#if loading}
							<Loader2 class="mr-2 h-5 w-5 animate-spin" />
							Creating...
						{:else}
							Create Product
						{/if}
					</Button>
				</div>
			</form>
		</div>
	</div>
</div>
