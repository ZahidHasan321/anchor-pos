<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Store,
		MapPin,
		Phone,
		MessageSquare,
		Loader2,
		Users,
		ClipboardList,
		Globe,
		Mail,
		FileText,
		Scale,
		Printer,
		Eye,
		Pencil,
		ShieldAlert,
		Facebook,
		Instagram,
		Percent,
		Package,
		Receipt,
		CircleDollarSign
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { confirmState } from '$lib/confirm.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { formatCurrency, formatDateTime } from '$lib/format';

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
		tax_enabled: 'false',
		tax_rate: '0',
		sd_enabled: 'false',
		sd_rate: '0',
		store_facebook: '',
		store_instagram: '',
		store_bin: '',
		low_stock_threshold: '5'
	});

	$effect(() => {
		previewData = {
			store_name: data.settings.store_name || '',
			store_address: data.settings.store_address || '',
			store_phone: data.settings.store_phone || '',
			store_email: data.settings.store_email || '',
			store_website: data.settings.store_website || '',
			store_tax_id: data.settings.store_tax_id || '',
			receipt_footer: data.settings.receipt_footer || '',
			return_policy: data.settings.return_policy || '',
			exchange_policy: data.settings.exchange_policy || '',
			terms_conditions: data.settings.terms_conditions || '',
			tax_enabled: data.settings.tax_enabled || 'false',
			tax_rate: data.settings.tax_rate || '0',
			sd_enabled: data.settings.sd_enabled || 'false',
			sd_rate: data.settings.sd_rate || '0',
			store_facebook: data.settings.store_facebook || '',
			store_instagram: data.settings.store_instagram || '',
			store_bin: data.settings.store_bin || '',
			low_stock_threshold: data.settings.low_stock_threshold || '5'
		};
	});

	$effect(() => {
		if (form?.success) {
			toast.success('Settings updated successfully');
			isEditing = false;
		}
	});

	const navItems = [
		{ label: 'Store Settings', href: '/settings', icon: Store },
		{ label: 'User Management', href: '/settings/users', icon: Users },
		{ label: 'Role Permissions', href: '/settings/permissions', icon: ShieldAlert },
		{ label: 'Audit Log', href: '/settings/audit', icon: ClipboardList }
	];

	function printTestReceipt() {
		printReceipt({
			storeSettings: previewData,
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
	}
</script>

<svelte:head>
	<title>Settings — Clothing POS</title>
</svelte:head>

<div class="space-y-5 p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 md:pb-6">
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
			<p class="text-sm text-muted-foreground sm:text-base">
				Configure your store and manage system settings.
			</p>
		</div>
	</div>

	<!-- Settings Navigation Tabs -->
	<div class="flex flex-wrap gap-2 border-b pb-4">
		{#each navItems as item}
			<Button
				variant={page.url.pathname === item.href ? 'default' : 'ghost'}
				href={item.href}
				class="h-9 flex-1 cursor-pointer px-3 text-xs sm:flex-none sm:text-sm"
			>
				<item.icon class="mr-2 h-4 w-4" />
				{item.label}
			</Button>
		{/each}
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
		class="space-y-5"
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

		<!-- ==================== TAX & COMPLIANCE ==================== -->
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
						<CircleDollarSign class="h-4 w-4 text-orange-600 dark:text-orange-400" />
					</div>
					<div>
						<Card.Title class="text-sm sm:text-base">Tax & Compliance</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							VAT, supplementary duty, tax IDs, and BIN numbers.
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

				<Separator />

				<div class="rounded-lg border bg-muted/20 p-4">
					<div class="space-y-4">
						<div class="flex items-center justify-between gap-4">
							<div class="min-w-0 space-y-0.5">
								<Label>Enable VAT/Tax</Label>
								<p class="text-xs text-muted-foreground">Apply tax to all sales automatically</p>
							</div>
							<Switch
								disabled={!isEditing}
								checked={previewData.tax_enabled === 'true'}
								onCheckedChange={(v) => (previewData.tax_enabled = v ? 'true' : 'false')}
							/>
							<input type="hidden" name="tax_enabled" value={previewData.tax_enabled} />
						</div>

						{#if previewData.tax_enabled === 'true'}
							<div class="animate-in duration-200 fade-in slide-in-from-top-1">
								<div class="space-y-2">
									<Label for="tax_rate">VAT/Tax Rate (%)</Label>
									<div class="relative max-w-xs">
										<Percent
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="tax_rate"
											name="tax_rate"
											type="number"
											step="0.01"
											class="pl-10"
											placeholder="0"
											bind:value={previewData.tax_rate}
											readonly={!isEditing}
										/>
									</div>
								</div>
							</div>
						{/if}

						<Separator />

						<div class="flex items-center justify-between gap-4">
							<div class="min-w-0 space-y-0.5">
								<Label>Enable Supplementary Duty (SD)</Label>
								<p class="text-xs text-muted-foreground">Apply SD before Tax calculation</p>
							</div>
							<Switch
								disabled={!isEditing}
								checked={previewData.sd_enabled === 'true'}
								onCheckedChange={(v) => (previewData.sd_enabled = v ? 'true' : 'false')}
							/>
							<input type="hidden" name="sd_enabled" value={previewData.sd_enabled} />
						</div>

						{#if previewData.sd_enabled === 'true'}
							<div class="animate-in duration-200 fade-in slide-in-from-top-1">
								<div class="space-y-2">
									<Label for="sd_rate">SD Rate (%)</Label>
									<div class="relative max-w-xs">
										<Percent
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="sd_rate"
											name="sd_rate"
											type="number"
											step="0.01"
											class="pl-10"
											placeholder="0"
											bind:value={previewData.sd_rate}
											readonly={!isEditing}
										/>
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<!-- ==================== INVENTORY ==================== -->
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
						<Package class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
					</div>
					<div>
						<Card.Title class="text-sm sm:text-base">Inventory</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							Stock alert thresholds and inventory behaviour.
						</Card.Description>
					</div>
				</div>
			</Card.Header>
			<Card.Content class="px-4 sm:px-6">
				<div class="max-w-xs space-y-2">
					<Label for="low_stock_threshold">Low Stock Threshold</Label>
					<div class="relative">
						<Package
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="low_stock_threshold"
							name="low_stock_threshold"
							type="number"
							min="1"
							class="pl-10"
							bind:value={previewData.low_stock_threshold}
							readonly={!isEditing}
						/>
					</div>
					<p class="text-xs text-muted-foreground">
						Alerts will show when any variant's stock is at or below this number.
					</p>
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
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

				<div class="flex items-center gap-2">
					{#if !isEditing}
						<Button
							type="button"
							class="w-full cursor-pointer sm:w-auto"
							onclick={() => (isEditing = true)}
						>
							<Pencil class="mr-2 h-4 w-4" />
							Edit Settings
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
										title: 'Save Settings',
										message: 'Are you sure you want to update the store settings?',
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
								Save All Settings
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
