<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import * as Card from '$lib/components/ui/card';
	import { ArrowLeft, Loader2 } from '@lucide/svelte';
	import { getCurrencySymbol } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
	import { goto } from '$app/navigation';

	let { data, form } = $props();
	let loading = $state(false);

	// Native: load product and categories from PowerSync
	let nativeProduct = $state<any>(null);
	let nativeCategories = $state<string[]>([]);

	async function loadNativeEditData() {
		if (!isNative || !powersync.ready) return;
		const productId = data.product?.id ?? data.productId;
		if (!productId) return;

		const [productRows, catRows] = await Promise.all([
			powersync.db.getAll('SELECT * FROM products WHERE id = ?', [productId]),
			powersync.db.getAll('SELECT DISTINCT category FROM products')
		]);

		const row = (productRows as any[])[0];
		nativeProduct = row
			? {
					...row,
					templatePrice: row.template_price,
					costPrice: row.cost_price,
					defaultDiscount: row.default_discount
				}
			: null;
		nativeCategories = (catRows as any[]).map((r: any) => r.category).sort();
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			powersync.dataVersion;
			loadNativeEditData();
		}
	});

	const currentProduct = $derived(isNative && nativeProduct ? nativeProduct : data.product);
	const currentCategories = $derived(
		isNative && nativeCategories.length > 0 ? nativeCategories : data.categories
	);

	let initialData = $derived(currentProduct);

	async function nativeUpdateProduct(formData: FormData) {
		if (!isNative || !powersync.ready) return;
		loading = true;
		try {
			const name = (formData.get('name') as string)?.trim();
			const category = (formData.get('category') as string)?.trim();
			const templatePrice = parseFloat(formData.get('templatePrice') as string);
			const costPrice = parseFloat(formData.get('costPrice') as string) || 0;
			const defaultDiscount = parseFloat(formData.get('defaultDiscount') as string) || 0;
			const description = (formData.get('description') as string)?.trim() || null;

			if (!name || !category || isNaN(templatePrice) || templatePrice <= 0) {
				toast.error('Please fill in all required fields');
				loading = false;
				return;
			}

			await powersync.db.execute(
				`UPDATE products SET name = ?, category = ?, template_price = ?, cost_price = ?, default_discount = ?, description = ? WHERE id = ?`,
				[name, category, templatePrice, costPrice, defaultDiscount, description, currentProduct.id]
			);
			toast.success('Product updated');
			goto(`/inventory/${currentProduct.id}`);
		} catch (e) {
			toast.error('Failed to update product');
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Edit {currentProduct.name} — Clothing POS</title>
</svelte:head>

<div class="p-6">
	<div class="mb-6 flex items-center gap-4">
		<Button
			variant="outline"
			size="icon"
			href="/inventory/{currentProduct.id}"
			aria-label="Back to product"
			class="cursor-pointer"
		>
			<ArrowLeft class="h-4 w-4" />
		</Button>
		<h1 class="text-3xl font-bold tracking-tight">Edit Product</h1>
	</div>

	<Card.Root class="mx-auto max-w-2xl">
		<Card.Header>
			<Card.Title>Product Details</Card.Title>
			<Card.Description>Update basic product information.</Card.Description>
		</Card.Header>
		<Card.Content>
			{#if isNative}
				<form
					class="space-y-6"
					onsubmit={(e) => {
						e.preventDefault();
						nativeUpdateProduct(new FormData(e.currentTarget as HTMLFormElement));
					}}
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="name">Product Name</Label>
							<Input id="name" name="name" value={initialData.name} />
						</div>
						<div class="space-y-2">
							<Label for="category">Category</Label>
							<Autocomplete
								id="category"
								name="category"
								value={initialData.category}
								suggestions={currentCategories}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="description">Description (Optional)</Label>
						<Textarea id="description" name="description" value={initialData.description ?? ''} />
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="templatePrice">Selling Price ({getCurrencySymbol()})</Label>
							<Input
								id="templatePrice"
								name="templatePrice"
								type="number"
								step="0.01"
								placeholder="0.00"
								value={initialData.templatePrice}
							/>
						</div>
						<div class="space-y-2">
							<Label for="costPrice">Cost / Buying Price ({getCurrencySymbol()})</Label>
							<Input
								id="costPrice"
								name="costPrice"
								type="number"
								step="0.01"
								placeholder="0.00"
								value={initialData.costPrice || ''}
							/>
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
							value={initialData.defaultDiscount || ''}
						/>
					</div>

					<Button
						type="button"
						class="w-full cursor-pointer"
						disabled={loading}
						onclick={async (e) => {
							const formElement = e.currentTarget.closest('form');
							if (
								await confirmState.confirm({
									title: 'Update Product',
									message: 'Are you sure you want to save these changes to the product?',
									confirmText: 'Save Changes',
									variant: 'default'
								})
							) {
								formElement?.requestSubmit();
							}
						}}
					>
						{#if loading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Saving…
						{:else}
							Save Changes
						{/if}
					</Button>
				</form>
			{:else}
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
					class="space-y-6"
				>
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="name">Product Name</Label>
							<Input
								id="name"
								name="name"
								value={(form?.data?.name as string) ?? initialData.name}
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
								value={(form?.data?.category as string) ?? initialData.category}
								suggestions={currentCategories}
							/>
							{#if form?.errors?.category}
								<p class="text-sm text-destructive">{form.errors.category}</p>
							{/if}
						</div>
					</div>

					<div class="space-y-2">
						<Label for="description">Description (Optional)</Label>
						<Textarea
							id="description"
							name="description"
							value={(form?.data?.description as string) ?? initialData.description ?? ''}
						/>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="templatePrice">Selling Price ({getCurrencySymbol()})</Label>
							<Input
								id="templatePrice"
								name="templatePrice"
								type="number"
								step="0.01"
								placeholder="0.00"
								value={(form?.data?.templatePrice as string) ?? initialData.templatePrice}
							/>
							{#if form?.errors?.templatePrice}
								<p class="text-sm text-destructive">{form.errors.templatePrice}</p>
							{/if}
						</div>
						<div class="space-y-2">
							<Label for="costPrice">Cost / Buying Price ({getCurrencySymbol()})</Label>
							<Input
								id="costPrice"
								name="costPrice"
								type="number"
								step="0.01"
								placeholder="0.00"
								value={(form?.data?.costPrice as string) ?? (initialData.costPrice || '')}
							/>
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
							value={(form?.data?.defaultDiscount as string) ?? (initialData.defaultDiscount || '')}
						/>
					</div>

					<Button
						type="button"
						class="w-full cursor-pointer"
						disabled={loading}
						onclick={async (e) => {
							const formElement = e.currentTarget.closest('form');
							if (
								await confirmState.confirm({
									title: 'Update Product',
									message: 'Are you sure you want to save these changes to the product?',
									confirmText: 'Save Changes',
									variant: 'default'
								})
							) {
								formElement?.requestSubmit();
							}
						}}
					>
						{#if loading}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Saving…
						{:else}
							Save Changes
						{/if}
					</Button>
				</form>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
