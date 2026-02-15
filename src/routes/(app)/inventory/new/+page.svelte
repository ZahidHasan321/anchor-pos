<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import * as Select from '$lib/components/ui/select';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ArrowLeft, Loader2, X, Plus } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	let { data, form } = $props();

	const SIZE_TEMPLATES = {
		alpha: ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL'],
		numeric: ['28', '30', '32', '34', '36', '38', '40', '42', '44', '46', '48', '50', '52', '54']
	};

	let selectedTemplate = $state('alpha');
	let loading = $state(false);
	let customSizeInput = $state('');

	let sizeQuantities = $state<Record<string, number>>({});

	// Clear selections when template changes
	$effect(() => {
		// Access selectedTemplate to track it
		selectedTemplate;
		sizeQuantities = {};
	});

	const selectedSizes = $derived(Object.keys(sizeQuantities));

	function toggleSize(size: string) {
		if (size in sizeQuantities) {
			const { [size]: _, ...rest } = sizeQuantities;
			sizeQuantities = rest;
		} else {
			sizeQuantities = { ...sizeQuantities, [size]: 0 };
		}
	}

	function removeSize(size: string) {
		const { [size]: _, ...rest } = sizeQuantities;
		sizeQuantities = rest;
	}

	function addCustomSize() {
		const size = customSizeInput.trim();
		if (!size) return;
		if (size in sizeQuantities) {
			toast.error(`Size "${size}" is already added`);
			return;
		}
		sizeQuantities = { ...sizeQuantities, [size]: 0 };
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
								<Label for="templatePrice">Base Price (৳)</Label>
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
								<Label for="defaultDiscount">Default Discount (%)</Label>
								<Input
									id="defaultDiscount"
									name="defaultDiscount"
									type="number"
									step="0.01"
									placeholder="0.00"
									value={(form?.data?.defaultDiscount as string) ?? '0'}
									class="h-11"
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="space-y-6 rounded-xl border bg-muted/30 p-6">
					<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<Label class="text-lg font-bold">Size Variants</Label>
							<p class="text-sm text-muted-foreground">
								Select the sizes you want to create and set initial stock.
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

					<div class="flex flex-wrap gap-x-6 gap-y-3">
						{#each SIZE_TEMPLATES[selectedTemplate as keyof typeof SIZE_TEMPLATES] as size}
							<div class="flex items-center space-x-2">
								<Checkbox
									id="size-{size}"
									checked={size in sizeQuantities}
									onCheckedChange={() => toggleSize(size)}
								/>
								<Label
									for="size-{size}"
									class="cursor-pointer text-sm leading-none font-semibold peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
								>
									{size}
								</Label>
							</div>
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
									>Quantity per size</Label
								>
								<div
									class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
								>
									{#each selectedSizes as size}
										<div
											class="group relative flex flex-col gap-1 rounded-lg border bg-background p-3 shadow-sm"
										>
											<button
												type="button"
												class="absolute top-1 right-1 cursor-pointer rounded-full p-1 text-muted-foreground/50 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
												onclick={() => removeSize(size)}
											>
												<X class="h-3 w-3" />
											</button>
											<span class="text-center text-xs font-bold">{size}</span>
											<Input
												type="number"
												min="0"
												value={sizeQuantities[size]}
												oninput={(e: Event) => {
													const val = parseInt((e.target as HTMLInputElement).value) || 0;
													sizeQuantities = { ...sizeQuantities, [size]: val };
												}}
												class="h-8 border-0 bg-muted/50 text-center text-sm focus-visible:ring-1"
												placeholder="0"
											/>
										</div>
									{/each}
								</div>
							</div>

							<div class="max-w-xl space-y-2 rounded-lg border border-primary/10 bg-primary/5 p-4">
								<Label for="stockReason" class="text-sm font-bold">Stock Adjustment Reason</Label>
								<Input
									id="stockReason"
									name="stockReason"
									placeholder="e.g. Initial Opening Stock, New Shipment..."
									value={form?.data?.stockReason ?? 'Initial Stock'}
									required
									class="h-11 bg-background"
								/>
								<p class="text-[11px] text-muted-foreground">
									This will be recorded in the stock logs for all variants with quantity > 0.
								</p>
							</div>
						</div>
					{/if}

					<!-- Hidden form fields for sizes and quantities -->
					{#each selectedSizes as size}
						<input type="hidden" name="sizes" value={size} />
						<input type="hidden" name="quantities" value={sizeQuantities[size]} />
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
