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

	let { data, form } = $props();
	let loading = $state(false);

	let initialData = $derived(data.product);
</script>

<svelte:head>
	<title>Edit {data.product.name} — Clothing POS</title>
</svelte:head>

<div class="p-6">
	<div class="mb-6 flex items-center gap-4">
		<Button
			variant="outline"
			size="icon"
			href="/inventory/{data.product.id}"
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
						<Input id="name" name="name" value={(form?.data?.name as string) ?? initialData.name} />
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
							suggestions={data.categories}
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
						Saving...
					{:else}
						Save Changes
					{/if}
				</Button>
			</form>
		</Card.Content>
	</Card.Root>
</div>
