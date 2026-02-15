<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import * as Card from '$lib/components/ui/card';
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
		ShieldAlert
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	import { confirmState } from '$lib/confirm.svelte';
	import { printReceipt } from '$lib/print-receipt';

	let { data, form } = $props();
	let loading = $state(false);
	let isEditing = $state(false);

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
		terms_conditions: ''
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
			terms_conditions: data.settings.terms_conditions || ''
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
			date: new Date().toLocaleString('en-GB'),
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

<div class="space-y-6 p-3 sm:p-6">
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

	<div class="grid gap-6 lg:grid-cols-12">
		<div class="space-y-6 lg:col-span-8">
			<Card.Root>
				<Card.Header>
					<Card.Title>Store & Receipt Configuration</Card.Title>
					<Card.Description
						>Configure how your business appears on printed receipts.</Card.Description
					>
				</Card.Header>
				<Card.Content>
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
						class="space-y-8"
					>
						<div class="grid gap-6 md:grid-cols-2">
							<!-- Contact Info Group -->
							<div class="space-y-4">
								<h3 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
									Contact Information
								</h3>

								<div class="space-y-2">
									<Label for="store_name">Store Name</Label>
									<div class="relative">
										<Store
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="store_name"
											name="store_name"
											class="pl-10"
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
											bind:value={previewData.store_phone}
											readonly={!isEditing}
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="store_email">Email Address (Optional)</Label>
									<div class="relative">
										<Mail
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="store_email"
											name="store_email"
											type="email"
											class="pl-10"
											bind:value={previewData.store_email}
											readonly={!isEditing}
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="store_website">Website URL (Optional)</Label>
									<div class="relative">
										<Globe
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="store_website"
											name="store_website"
											class="pl-10"
											bind:value={previewData.store_website}
											readonly={!isEditing}
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="store_tax_id">VAT / Tax ID (Optional)</Label>
									<div class="relative">
										<FileText
											class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
										/>
										<Input
											id="store_tax_id"
											name="store_tax_id"
											class="pl-10"
											bind:value={previewData.store_tax_id}
											readonly={!isEditing}
										/>
									</div>
								</div>

								<div class="space-y-2">
									<Label for="store_address">Physical Address</Label>
									<div class="relative">
										<MapPin class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
										<Textarea
											id="store_address"
											name="store_address"
											class="min-h-[80px] pl-10"
											bind:value={previewData.store_address}
											readonly={!isEditing}
										/>
									</div>
								</div>
							</div>

							<!-- Policies Group -->
							<div class="space-y-4">
								<h3 class="text-sm font-bold tracking-wider text-muted-foreground uppercase">
									Receipt Policies & Footer
								</h3>

								<div class="space-y-2">
									<Label for="return_policy">Return Policy (Optional)</Label>
									<Textarea
										id="return_policy"
										name="return_policy"
										placeholder="e.g. Items can be returned within 7 days..."
										class="min-h-[60px]"
										bind:value={previewData.return_policy}
										readonly={!isEditing}
									/>
								</div>

								<div class="space-y-2">
									<Label for="exchange_policy">Exchange Policy (Optional)</Label>
									<Textarea
										id="exchange_policy"
										name="exchange_policy"
										placeholder="e.g. Exchanges accepted with original tag..."
										class="min-h-[60px]"
										bind:value={previewData.exchange_policy}
										readonly={!isEditing}
									/>
								</div>

								<div class="space-y-2">
									<Label for="terms_conditions">Terms & Conditions (Optional)</Label>
									<Textarea
										id="terms_conditions"
										name="terms_conditions"
										class="min-h-[60px]"
										bind:value={previewData.terms_conditions}
										readonly={!isEditing}
									/>
								</div>

								<div class="space-y-2">
									<Label for="receipt_footer">Receipt Footer Message</Label>
									<div class="relative">
										<MessageSquare class="absolute top-3 left-3 h-4 w-4 text-muted-foreground" />
										<Textarea
											id="receipt_footer"
											name="receipt_footer"
											class="min-h-[80px] pl-10"
											bind:value={previewData.receipt_footer}
											readonly={!isEditing}
										/>
									</div>
								</div>
							</div>
						</div>

						<div
							class="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
						>
							<div class="order-2 flex gap-2 sm:order-1">
								<Button
									variant="outline"
									type="button"
									class="cursor-pointer"
									onclick={printTestReceipt}
								>
									<Printer class="mr-2 h-4 w-4" />
									Print Test Receipt
								</Button>
							</div>

							<div class="order-1 flex items-center gap-2 sm:order-2">
								{#if !isEditing}
									<Button
										type="button"
										class="w-full cursor-pointer sm:w-[200px]"
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
										class="w-full cursor-pointer sm:w-[200px]"
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
					</form>
				</Card.Content>
			</Card.Root>
		</div>

		<!-- Live On-Screen Preview -->
		<div class="space-y-6 lg:col-span-4">
			<Card.Root class="sticky top-6 border-2 border-dashed">
				<Card.Header class="pb-2">
					<div class="flex items-center justify-between">
						<Card.Title class="text-sm">Live Receipt Preview</Card.Title>
						<Badge variant="outline">80mm Thermal</Badge>
					</div>
				</Card.Header>
				<Card.Content>
					<div
						class="rounded-lg bg-white p-4 text-[#1a1a1a] shadow-inner dark:bg-zinc-100 dark:text-zinc-900"
					>
						<!-- Dummy Receipt Content -->
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
										<td class="py-1"
											>SAMPLE PRODUCT<br /><span class="text-[9px]">Size: XL</span></td
										>
										<td class="py-1 text-center">1</td>
										<td class="py-1 text-right">1,200</td>
									</tr>
								</tbody>
							</table>

							<div class="my-2 border-t border-dashed border-black"></div>
							<div class="flex justify-between text-[13px] font-bold">
								<span>TOTAL</span>
								<span>৳ 1,200.00</span>
							</div>

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
					<p class="mt-4 text-[11px] text-muted-foreground italic">
						* This is a visual representation. Use "Print Test Receipt" to check actual thermal
						printer alignment.
					</p>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
