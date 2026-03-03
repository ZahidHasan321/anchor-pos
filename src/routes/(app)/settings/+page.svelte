<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Store,
		MapPin,
		Phone,
		MessageSquare,
		Loader2,
		Globe,
		Mail,
		FileText,
		Scale,
		Printer,
		Eye,
		Pencil,
		Facebook,
		Instagram,
		Receipt
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { untrack } from 'svelte';

	let { data, form } = $props();
	let loading = $state(false);
	let isEditing = $state(false);
	let showReceiptPreview = $state(false);

	// Local state for preview
	let previewData = $state({
		store_name: '',
		store_address: '',
		store_phone: '',
		store_email: '',
		store_website: '',
		store_tax_id: '',
		receipt_footer: '',
		return_policy: '',
		exchange_policy: '',
		terms_conditions: '',
		store_facebook: '',
		store_instagram: '',
		store_bin: ''
	});

	$effect(() => {
		const settings = data.settings;
		untrack(() => {
			previewData = {
				store_name: settings.store_name || '',
				store_address: settings.store_address || '',
				store_phone: settings.store_phone || '',
				store_email: settings.store_email || '',
				store_website: settings.store_website || '',
				store_tax_id: settings.store_tax_id || '',
				receipt_footer: settings.receipt_footer || '',
				return_policy: settings.return_policy || '',
				exchange_policy: settings.exchange_policy || '',
				terms_conditions: settings.terms_conditions || '',
				store_facebook: settings.store_facebook || '',
				store_instagram: settings.store_instagram || '',
				store_bin: settings.store_bin || ''
			};

			if (!previewData.store_name) {
				isEditing = true;
			}
		});
	});

	$effect(() => {
		if (form?.success) {
			toast.success('Store profile updated successfully');
			isEditing = false;
		}
	});

	async function printTestReceipt() {
		const result = await printReceipt({
			storeSettings: { ...data.settings, ...previewData },
			orderId: '#TEST-RECEIPT',
			date: formatDateTime(new Date()),
			cashier: data.user?.name ?? 'Admin',
			items: [
				{ name: 'DUMMY PRODUCT', variant: 'Large / Black', qty: 1, total: 1200 },
				{ name: 'SAMPLE ITEM', variant: 'Medium / Blue', qty: 2, total: 1600 }
			],
			total: 2800,
			cashReceived: 3000,
			changeGiven: 200
		});
		if (result && !result.success) {
			toast.error(`Print failed: ${result.error}`);
		} else if (result?.success) {
			toast.success('Test receipt sent to printer');
		}
	}
</script>

<div class="space-y-6">
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-end">
		<div class="flex gap-2">
			<Button
				variant="outline"
				type="button"
				size="sm"
				class="h-9 cursor-pointer text-xs sm:text-sm"
				onclick={() => (showReceiptPreview = true)}
			>
				<Eye class="mr-2 h-4 w-4" />
				Preview Receipt
			</Button>
			<Button
				variant="outline"
				type="button"
				size="sm"
				class="h-9 cursor-pointer text-xs sm:text-sm"
				onclick={printTestReceipt}
			>
				<Printer class="mr-2 h-4 w-4" />
				Print Test
			</Button>
		</div>
	</div>

	<form
		method="POST"
		action="?/update"
		use:enhance={() => {
			loading = true;
			return async ({ update }) => {
				loading = false;
				await update();
			};
		}}
		class="space-y-5 pb-20 md:pb-0"
	>
		<!-- ==================== STORE IDENTITY ==================== -->
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
						<Store class="h-4 w-4 text-primary" />
					</div>
					<div>
						<Card.Title class="text-sm sm:text-base">Store Identity</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							Your store name, address, and contact details.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4 px-4 sm:px-6">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="store_name">Store Name <span class="text-red-500">*</span></Label>
						<div class="relative">
							<Store
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_name"
								name="store_name"
								class="pl-10"
								placeholder="Your Store Name"
								bind:value={previewData.store_name}
								readonly={!isEditing}
								required
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="store_phone">Phone Number</Label>
						<div class="relative">
							<Phone
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_phone"
								name="store_phone"
								class="pl-10"
								placeholder="01XXXXXXXXX"
								bind:value={previewData.store_phone}
								readonly={!isEditing}
							/>
						</div>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="store_address">Physical Address</Label>
					<div class="relative">
						<MapPin class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
						<Textarea
							id="store_address"
							name="store_address"
							class="min-h-[72px] pl-10"
							placeholder="123 Store Address, City, Country"
							bind:value={previewData.store_address}
							readonly={!isEditing}
						/>
					</div>
				</div>

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="store_email">Email Address</Label>
						<div class="relative">
							<Mail
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_email"
								name="store_email"
								type="email"
								class="pl-10"
								placeholder="store@example.com"
								bind:value={previewData.store_email}
								readonly={!isEditing}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="store_website">Website URL</Label>
						<div class="relative">
							<Globe
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_website"
								name="store_website"
								class="pl-10"
								placeholder="www.yourstore.com"
								bind:value={previewData.store_website}
								readonly={!isEditing}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="store_facebook">Facebook Page</Label>
						<div class="relative">
							<Facebook
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_facebook"
								name="store_facebook"
								class="pl-10"
								placeholder="facebook.com/yourstore"
								bind:value={previewData.store_facebook}
								readonly={!isEditing}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="store_instagram">Instagram Profile</Label>
						<div class="relative">
							<Instagram
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_instagram"
								name="store_instagram"
								class="pl-10"
								placeholder="@yourstore"
								bind:value={previewData.store_instagram}
								readonly={!isEditing}
							/>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- ==================== REGISTRATION ==================== -->
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
						<FileText class="h-4 w-4 text-orange-600 dark:text-orange-400" />
					</div>
					<div>
						<Card.Title class="text-sm sm:text-base">Business Registration</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							Tax IDs and BIN numbers for compliance.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4 px-4 sm:px-6">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="store_tax_id">VAT / Tax ID</Label>
						<div class="relative">
							<FileText
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_tax_id"
								name="store_tax_id"
								class="pl-10"
								placeholder="Your VAT/Tax ID"
								bind:value={previewData.store_tax_id}
								readonly={!isEditing}
							/>
						</div>
					</div>

					<div class="space-y-2">
						<Label for="store_bin">BIN Number / Mushak</Label>
						<div class="relative">
							<Scale
								class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								id="store_bin"
								name="store_bin"
								class="pl-10"
								placeholder="e.g. 00XXXXXXXX-XXXX"
								bind:value={previewData.store_bin}
								readonly={!isEditing}
							/>
						</div>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- ==================== RECEIPT POLICIES ==================== -->
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
						<Receipt class="h-4 w-4 text-violet-600 dark:text-violet-400" />
					</div>
					<div>
						<Card.Title class="text-sm sm:text-base">Receipt Policies & Footer</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							Policies and messages printed on customer receipts.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4 px-4 sm:px-6">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="return_policy">Return Policy</Label>
						<Textarea
							id="return_policy"
							name="return_policy"
							placeholder="e.g. Items can be returned within 7 days with original receipt..."
							class="min-h-[90px]"
							bind:value={previewData.return_policy}
							readonly={!isEditing}
						/>
					</div>

					<div class="space-y-2">
						<Label for="exchange_policy">Exchange Policy</Label>
						<Textarea
							id="exchange_policy"
							name="exchange_policy"
							placeholder="e.g. Exchanges accepted within 14 days with original tag..."
							class="min-h-[90px]"
							bind:value={previewData.exchange_policy}
							readonly={!isEditing}
						/>
					</div>
				</div>

				<div class="space-y-2">
					<Label for="terms_conditions">Terms & Conditions</Label>
					<Textarea
						id="terms_conditions"
						name="terms_conditions"
						placeholder="Any terms and conditions to print on receipts..."
						class="min-h-[80px]"
						bind:value={previewData.terms_conditions}
						readonly={!isEditing}
					/>
				</div>

				<div class="space-y-2">
					<Label for="receipt_footer">Footer Message</Label>
					<div class="relative">
						<MessageSquare class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
						<Textarea
							id="receipt_footer"
							name="receipt_footer"
							class="min-h-[80px] pl-10"
							placeholder="Thank you for shopping with us!"
							bind:value={previewData.receipt_footer}
							readonly={!isEditing}
						/>
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- ==================== STICKY ACTION BAR ==================== -->
		<div
			class="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur-sm md:static md:border-t-0 md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none"
		>
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
				<div class="flex items-center gap-2">
					{#if !isEditing}
						<Button
							type="button"
							class="w-full cursor-pointer sm:w-auto"
							onclick={() => (isEditing = true)}
						>
							<Pencil class="mr-2 h-4 w-4" />
							Edit Profile
						</Button>
					{:else}
						<Button
							variant="ghost"
							type="button"
							class="cursor-pointer"
							onclick={() => (isEditing = false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							class="w-full cursor-pointer sm:w-auto"
							disabled={loading}
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (
									await confirmState.confirm({
										title: 'Save Profile',
										message: 'Update your store profile details?',
										confirmText: 'Save',
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
								Save Profile
							{/if}
						</Button>
					{/if}
				</div>
			</div>
		</div>
	</form>
</div>

<!-- Receipt Preview Dialog -->
<Dialog.Root bind:open={showReceiptPreview}>
	<Dialog.Content class="max-w-sm p-0">
		<Dialog.Header class="px-5 pt-5 pb-0">
			<div class="flex items-center justify-between">
				<Dialog.Title class="text-sm">Receipt Preview</Dialog.Title>
				<Badge variant="outline">80mm Thermal</Badge>
			</div>
			<Dialog.Description class="text-xs text-muted-foreground">
				Visual representation of your printed receipt.
			</Dialog.Description>
		</Dialog.Header>
		<div class="max-h-[70vh] overflow-y-auto px-5 pb-5">
			<div
				class="rounded-lg bg-white p-4 text-[#1a1a1a] shadow-inner dark:bg-zinc-100 dark:text-zinc-900"
			>
				<div class="font-mono text-[11px] leading-tight">
					<div class="text-center">
						<div class="text-[14px] font-bold uppercase">
							{previewData.store_name || 'STORE NAME'}
						</div>
						<div class="mt-1">{previewData.store_address || '123 Store Address, City'}</div>
						<div>Phone: {previewData.store_phone || '01XXXXXXXXX'}</div>
						{#if previewData.store_email}<div>{previewData.store_email}</div>{/if}
						{#if previewData.store_website}<div>{previewData.store_website}</div>{/if}
						{#if previewData.store_tax_id}<div class="mt-1">
								VAT: {previewData.store_tax_id}
							</div>{/if}
						{#if previewData.store_bin}<div class="mt-1">BIN: {previewData.store_bin}</div>{/if}
					</div>

					<div class="my-2 border-t border-dashed border-black"></div>
					<div>Order: #PREVIEW</div>
					<div>Date: {new Date().toLocaleDateString()}</div>

					<div class="my-2 border-t border-dashed border-black"></div>
					<table class="w-full text-left">
						<tbody>
							<tr class="font-bold">
								<td class="py-1">Item</td>
								<td class="py-1 text-center">Qty</td>
								<td class="py-1 text-right">Price</td>
							</tr>
							<tr>
								<td class="py-1">SAMPLE PRODUCT<br /><span class="text-[9px]">Size: XL</span></td>
								<td class="py-1 text-center">1</td>
								<td class="py-1 text-right">1,200</td>
							</tr>
						</tbody>
					</table>

					<div class="my-2 border-t border-dashed border-black"></div>
					<div class="flex justify-between text-[13px] font-bold">
						<span>TOTAL</span>
						<span>{formatCurrency(1200)}</span>
					</div>

					{#if previewData.store_facebook || previewData.store_instagram}
						<div class="mt-2 text-center text-[9px]">
							{#if previewData.store_facebook}<div>FB: {previewData.store_facebook}</div>{/if}
							{#if previewData.store_instagram}<div>IG: {previewData.store_instagram}</div>{/if}
						</div>
					{/if}

					{#if previewData.return_policy || previewData.exchange_policy || previewData.terms_conditions}
						<div class="my-2 border-t border-dashed border-black"></div>
						<div class="space-y-1 text-[9px]">
							{#if previewData.return_policy}<div>
									<strong>Return:</strong>
									{previewData.return_policy}
								</div>{/if}
							{#if previewData.exchange_policy}<div>
									<strong>Exchange:</strong>
									{previewData.exchange_policy}
								</div>{/if}
							{#if previewData.terms_conditions}<div>
									<strong>T&C:</strong>
									{previewData.terms_conditions}
								</div>{/if}
						</div>
					{/if}

					<div class="mt-4 text-center">
						<div class="text-[10px] italic">{previewData.receipt_footer || 'Thank you!'}</div>
						<div class="mt-2 text-[9px]">*** End of Receipt ***</div>
					</div>
				</div>
			</div>
		</div>
		<div class="flex items-center justify-between border-t px-5 py-3">
			<p class="text-[11px] text-muted-foreground italic">
				Use "Print Test" for actual thermal output.
			</p>
			<Button variant="outline" size="sm" class="cursor-pointer" onclick={printTestReceipt}>
				<Printer class="mr-2 h-3.5 w-3.5" />
				Print
			</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>
