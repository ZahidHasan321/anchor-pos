<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import { Separator } from '$lib/components/ui/separator';
	import * as Card from '$lib/components/ui/card';
	import {
		Loader2,
		Printer,
		Percent,
		Package,
		CircleDollarSign,
		Settings
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { printReceipt } from '$lib/print-receipt';
	import { formatDateTime } from '$lib/format';
	import { untrack } from 'svelte';
	import * as Select from '$lib/components/ui/select';

	let { data, form } = $props();
	let loading = $state(false);

	// --- Printer Settings (Electron only) ---
	let isElectron = $state(false);
	let printerList: Array<{ name: string; isDefault: boolean }> = $state([]);
	let loadingPrinters = $state(false);
	let defaultReceiptPrinter = $state('');
	let defaultLabelPrinter = $state('');
	let testPrintingReceipt = $state(false);
	let testPrintingLabel = $state(false);
	let useThermalPrinter = $state(false);
	let thermalPrinterInterface = $state('');
	let thermalPrinterType = $state('epson');
	let thermalPrinterDrawer = $state(false);
	let thermalPaperWidth = $state('80');
	let thermalCharacterSet = $state('PC437_USA');
	let thermalConnectionType = $state('usb_share');
	let testingThermal = $state(false);

	$effect(() => {
		// @ts-ignore
		isElectron = typeof window !== 'undefined' && !!window.electron?.getPrinters;
		if (isElectron) {
			defaultReceiptPrinter = localStorage.getItem('pos-default-receipt-printer') || '';
			defaultLabelPrinter = localStorage.getItem('pos-default-label-printer') || '';
			useThermalPrinter = localStorage.getItem('pos-use-thermal-printer') === 'true';
			thermalPrinterInterface = localStorage.getItem('pos-thermal-printer-interface') || '';
			thermalPrinterType = localStorage.getItem('pos-thermal-printer-type') || 'epson';
			thermalPrinterDrawer = localStorage.getItem('pos-thermal-printer-drawer') === 'true';
			thermalPaperWidth = localStorage.getItem('pos-thermal-printer-width') || '80';
			thermalCharacterSet = localStorage.getItem('pos-thermal-printer-charset') || 'PC437_USA';
			thermalConnectionType = localStorage.getItem('pos-thermal-connection-type') || 'usb_share';
			refreshPrinters();
		}
	});

	async function refreshPrinters() {
		loadingPrinters = true;
		try {
			// @ts-ignore
			const printers = await window.electron.getPrinters();
			printerList = printers.map((p: any) => ({ name: p.name, isDefault: p.isDefault }));
		} catch (e) {
			console.error('Failed to get printers:', e);
			printerList = [];
		}
		loadingPrinters = false;
	}

	function saveReceiptPrinter(name: string) {
		defaultReceiptPrinter = name;
		if (name) {
			localStorage.setItem('pos-default-receipt-printer', name);
		} else {
			localStorage.removeItem('pos-default-receipt-printer');
		}
		toast.success(name ? `Receipt printer set to "${name}"` : 'Receipt printer cleared');
	}

	function saveLabelPrinter(name: string) {
		defaultLabelPrinter = name;
		if (name) {
			localStorage.setItem('pos-default-label-printer', name);
		} else {
			localStorage.removeItem('pos-default-label-printer');
		}
		toast.success(name ? `Label printer set to "${name}"` : 'Label printer cleared');
	}

	function saveThermalSettings() {
		localStorage.setItem('pos-use-thermal-printer', useThermalPrinter.toString());
		localStorage.setItem('pos-thermal-printer-interface', thermalPrinterInterface);
		localStorage.setItem('pos-thermal-printer-type', thermalPrinterType);
		localStorage.setItem('pos-thermal-printer-drawer', thermalPrinterDrawer.toString());
		localStorage.setItem('pos-thermal-printer-width', thermalPaperWidth);
		localStorage.setItem('pos-thermal-printer-charset', thermalCharacterSet);
		localStorage.setItem('pos-thermal-connection-type', thermalConnectionType);
		toast.success('Thermal printer settings saved');
	}

	async function testThermalPrint() {
		if (!thermalPrinterInterface) {
			toast.error('Set a printer interface first');
			return;
		}
		testingThermal = true;
		try {
			// @ts-ignore
			const result = await window.electron.testThermalPrint({
				interface: thermalPrinterInterface,
				type: thermalPrinterType,
				paperWidth: thermalPaperWidth,
				characterSet: thermalCharacterSet
			});
			if (result?.success) {
				toast.success('Thermal test print sent successfully');
			} else {
				toast.error(`Thermal test failed: ${result?.error || 'Unknown error'}`);
			}
		} catch (e: any) {
			toast.error(`Thermal test error: ${e.message}`);
		}
		testingThermal = false;
	}

	async function testReceiptPrint() {
		testPrintingReceipt = true;
		try {
			const result = await printReceipt({
				storeSettings: data.settings,
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
				toast.success('Test receipt printed successfully');
			}
		} catch (e: any) {
			toast.error(`Print error: ${e.message}`);
		}
		testPrintingReceipt = false;
	}

	async function testLabelPrint() {
		testPrintingLabel = true;
		const printerName = defaultLabelPrinter || '';
		const html = `<!DOCTYPE html><html><head>
<style>@page { size: 50.8mm 25.4mm; margin: 0; } body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; } .label { text-align: center; } .name { font-size: 10px; font-weight: bold; } .price { font-size: 14px; font-weight: bold; margin-top: 2mm; }</style>
</head><body><div class="label"><div class="name">TEST LABEL</div><div class="price">$0.00</div></div></body></html>`;
		try {
			// @ts-ignore
			const result = await window.electron.printToDevice(html, printerName, true);
			if (result && !result.success) {
				toast.error(`Label print failed: ${result.error}`);
			} else if (result?.success) {
				toast.success('Test label printed successfully');
			}
		} catch (e: any) {
			toast.error(`Label print error: ${e.message}`);
		}
		testPrintingLabel = false;
	}

	let prefData = $state({
		tax_enabled: 'false',
		tax_rate: '0',
		sd_enabled: 'false',
		sd_rate: '0',
		low_stock_threshold: '5'
	});

	$effect(() => {
		const settings = data.settings;
		untrack(() => {
			prefData = {
				tax_enabled: settings.tax_enabled || 'false',
				tax_rate: settings.tax_rate || '0',
				sd_enabled: settings.sd_enabled || 'false',
				sd_rate: settings.sd_rate || '0',
				low_stock_threshold: settings.low_stock_threshold || '5'
			};
		});
	});

	$effect(() => {
		if (form?.success) {
			toast.success('Preferences updated successfully');
		}
	});
</script>

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
	<div class="flex items-center justify-between">
		<h2 class="text-xl font-bold tracking-tight">Application Preferences</h2>
		<Button
			type="button"
			class="cursor-pointer"
			disabled={loading}
			onclick={async (e) => {
				const formElement = e.currentTarget.closest('form');
				if (
					await confirmState.confirm({
						title: 'Save Preferences',
						message: 'Save these application preferences?',
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
				Save Preferences
			{/if}
		</Button>
	</div>

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
						bind:value={prefData.low_stock_threshold}
					/>
				</div>
				<p class="text-xs text-muted-foreground">
					Alerts will show when any variant's stock is at or below this number.
				</p>
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
						VAT, supplementary duty, and tax calculation settings.
					</Card.Description>
				</div>
			</div>
		</Card.Header>
		<Card.Content class="space-y-4 px-4 sm:px-6">
			<div class="rounded-lg border bg-muted/20 p-4">
				<div class="space-y-4">
					<div class="flex items-center justify-between gap-4">
						<div class="min-w-0 space-y-0.5">
							<Label>Enable VAT/Tax</Label>
							<p class="text-xs text-muted-foreground">Apply tax to all sales automatically</p>
						</div>
						<Switch
							checked={prefData.tax_enabled === 'true'}
							onCheckedChange={(v) => (prefData.tax_enabled = v ? 'true' : 'false')}
						/>
						<input type="hidden" name="tax_enabled" value={prefData.tax_enabled} />
					</div>

					{#if prefData.tax_enabled === 'true'}
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
										bind:value={prefData.tax_rate}
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
							checked={prefData.sd_enabled === 'true'}
							onCheckedChange={(v) => (prefData.sd_enabled = v ? 'true' : 'false')}
						/>
						<input type="hidden" name="sd_enabled" value={prefData.sd_enabled} />
					</div>

					{#if prefData.sd_enabled === 'true'}
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
										bind:value={prefData.sd_rate}
									/>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- ==================== PRINTER SETUP (Electron only) ==================== -->
	{#if isElectron}
		<Card.Root>
			<Card.Header class="px-4 pb-4 sm:px-6">
				<div class="flex items-center gap-2.5">
					<div class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
						<Printer class="h-4 w-4 text-blue-600 dark:text-blue-400" />
					</div>
					<div class="flex-1">
						<Card.Title class="text-sm sm:text-base">Printer Setup</Card.Title>
						<Card.Description class="text-xs sm:text-sm">
							Select default printers for receipts and labels.
						</Card.Description>
					</div>
					<Button
						variant="ghost"
						size="sm"
						class="cursor-pointer"
						onclick={refreshPrinters}
						disabled={loadingPrinters}
					>
						{#if loadingPrinters}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							Refresh
						{/if}
					</Button>
				</div>
			</Card.Header>
			<Card.Content class="space-y-4 px-4 sm:px-6">
				{#if printerList.length === 0 && !loadingPrinters}
					<div class="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
						No printers detected. Make sure your printer drivers are installed and the printer is connected.
					</div>
				{:else}
					<div class="grid gap-4 sm:grid-cols-2">
						<!-- Receipt Printer -->
						<div class="space-y-2">
							<Label>Default Receipt Printer</Label>
							<Select.Root
								type="single"
								value={defaultReceiptPrinter || undefined}
								onValueChange={(v) => saveReceiptPrinter(v ?? '')}
							>
								<Select.Trigger class="w-full cursor-pointer">
									{defaultReceiptPrinter || 'System default (dialog)'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="" label="System default (dialog)">System default (dialog)</Select.Item>
									{#each printerList as printer}
										<Select.Item value={printer.name} label={printer.name}>
											{printer.name}{printer.isDefault ? ' (OS default)' : ''}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									class="cursor-pointer text-xs"
									onclick={testReceiptPrint}
									disabled={testPrintingReceipt}
								>
									{#if testPrintingReceipt}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									{:else}
										<Printer class="mr-1 h-3 w-3" />
									{/if}
									Test Receipt
								</Button>
							</div>
						</div>

						<!-- Label Printer -->
						<div class="space-y-2">
							<Label>Default Label Printer</Label>
							<Select.Root
								type="single"
								value={defaultLabelPrinter || undefined}
								onValueChange={(v) => saveLabelPrinter(v ?? '')}
							>
								<Select.Trigger class="w-full cursor-pointer">
									{defaultLabelPrinter || 'System default (dialog)'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value="" label="System default (dialog)">System default (dialog)</Select.Item>
									{#each printerList as printer}
										<Select.Item value={printer.name} label={printer.name}>
											{printer.name}{printer.isDefault ? ' (OS default)' : ''}
										</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
							<div class="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									class="cursor-pointer text-xs"
									onclick={testLabelPrint}
									disabled={testPrintingLabel}
								>
									{#if testPrintingLabel}
										<Loader2 class="mr-1 h-3 w-3 animate-spin" />
									{:else}
										<Printer class="mr-1 h-3 w-3" />
									{/if}
									Test Label
								</Button>
							</div>
						</div>
					</div>

					<Separator class="my-4" />

					<div class="space-y-4">
						<div class="flex items-center justify-between gap-4">
							<div class="min-w-0 space-y-0.5">
								<Label>Native ESC/POS Thermal Printing</Label>
								<p class="text-xs text-muted-foreground">Bypass HTML rendering and print directly using thermal commands (supports cash drawer). Works with XPrinter and other ESC/POS printers.</p>
							</div>
							<Switch
								checked={useThermalPrinter}
								onCheckedChange={(v) => { useThermalPrinter = v; saveThermalSettings(); }}
							/>
						</div>

						{#if useThermalPrinter}
							<div class="space-y-4 animate-in duration-200 fade-in slide-in-from-top-1 rounded-lg border bg-muted/20 p-4">
								<!-- Connection Type -->
								<div class="space-y-2">
									<Label>Connection Type</Label>
									<Select.Root
										type="single"
										value={thermalConnectionType}
										onValueChange={(v) => {
											thermalConnectionType = v ?? 'usb_share';
											thermalPrinterInterface = '';
											saveThermalSettings();
										}}
									>
										<Select.Trigger class="w-full cursor-pointer">
											{thermalConnectionType === 'usb_share' ? 'USB (Windows Share)' : thermalConnectionType === 'bluetooth' ? 'Bluetooth (COM Port)' : thermalConnectionType === 'usb_direct' ? 'USB (Direct COM Port)' : 'USB (Windows Share)'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="usb_share" label="USB (Windows Share)">USB (Windows Share)</Select.Item>
											<Select.Item value="usb_direct" label="USB (Direct COM Port)">USB (Direct COM Port)</Select.Item>
											<Select.Item value="bluetooth" label="Bluetooth (COM Port)">Bluetooth (COM Port)</Select.Item>
										</Select.Content>
									</Select.Root>
								</div>

								<!-- Interface Input (contextual based on connection type) -->
								<div class="space-y-2">
									<Label for="thermal_interface">Printer Interface</Label>
									{#if thermalConnectionType === 'usb_share'}
										<Input
											id="thermal_interface"
											placeholder="//localhost/XPrinter"
											bind:value={thermalPrinterInterface}
											onblur={saveThermalSettings}
										/>
										<p class="text-[10px] text-muted-foreground">Share your USB printer in Windows, then enter <code class="bg-muted px-1 rounded">//localhost/ShareName</code>. To find the share name: Printer Settings &gt; Right-click printer &gt; Properties &gt; Sharing tab.</p>
									{:else if thermalConnectionType === 'usb_direct'}
										<Input
											id="thermal_interface"
											placeholder="\\.\COM3"
											bind:value={thermalPrinterInterface}
											onblur={saveThermalSettings}
										/>
										<p class="text-[10px] text-muted-foreground">Enter the COM port (e.g. <code class="bg-muted px-1 rounded">\\.\COM3</code>). Check Device Manager &gt; Ports to find your printer's COM port number.</p>
									{:else}
										<Input
											id="thermal_interface"
											placeholder="\\.\COM5"
											bind:value={thermalPrinterInterface}
											onblur={saveThermalSettings}
										/>
										<p class="text-[10px] text-muted-foreground">Pair your Bluetooth printer first, then enter its COM port (e.g. <code class="bg-muted px-1 rounded">\\.\COM5</code>). Check Device Manager &gt; Ports (COM & LPT) for the Bluetooth serial port.</p>
									{/if}
								</div>

								<div class="grid gap-4 sm:grid-cols-2">
									<!-- Printer Type -->
									<div class="space-y-2">
										<Label>Printer Type</Label>
										<Select.Root
											type="single"
											value={thermalPrinterType}
											onValueChange={(v) => { thermalPrinterType = v ?? 'epson'; saveThermalSettings(); }}
										>
											<Select.Trigger class="w-full cursor-pointer">
												{thermalPrinterType === 'star' ? 'Star PRNT' : 'EPSON (ESC/POS)'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="epson" label="EPSON (ESC/POS)">EPSON (ESC/POS)</Select.Item>
												<Select.Item value="star" label="Star PRNT">Star PRNT</Select.Item>
											</Select.Content>
										</Select.Root>
										<p class="text-[10px] text-muted-foreground">XPrinter uses ESC/POS. Most thermal printers are ESC/POS compatible.</p>
									</div>

									<!-- Paper Width -->
									<div class="space-y-2">
										<Label>Paper Width</Label>
										<Select.Root
											type="single"
											value={thermalPaperWidth}
											onValueChange={(v) => { thermalPaperWidth = v ?? '80'; saveThermalSettings(); }}
										>
											<Select.Trigger class="w-full cursor-pointer">
												{thermalPaperWidth === '58' ? '58mm (32 chars)' : '80mm (48 chars)'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="80" label="80mm (48 chars)">80mm (48 chars)</Select.Item>
												<Select.Item value="58" label="58mm (32 chars)">58mm (32 chars)</Select.Item>
											</Select.Content>
										</Select.Root>
									</div>

									<!-- Character Set -->
									<div class="space-y-2">
										<Label>Character Set</Label>
										<Select.Root
											type="single"
											value={thermalCharacterSet}
											onValueChange={(v) => { thermalCharacterSet = v ?? 'PC437_USA'; saveThermalSettings(); }}
										>
											<Select.Trigger class="w-full cursor-pointer">
												{thermalCharacterSet === 'PC437_USA' ? 'PC437 USA (Default)' : thermalCharacterSet === 'PC850_MULTILINGUAL' ? 'PC850 Multilingual' : thermalCharacterSet === 'PC852_LATIN2' ? 'PC852 Latin 2' : thermalCharacterSet === 'PC858_EURO' ? 'PC858 Euro' : thermalCharacterSet === 'WPC1252' ? 'WPC1252 Latin' : 'PC437 USA (Default)'}
											</Select.Trigger>
											<Select.Content>
												<Select.Item value="PC437_USA" label="PC437 USA (Default)">PC437 USA (Default)</Select.Item>
												<Select.Item value="PC850_MULTILINGUAL" label="PC850 Multilingual">PC850 Multilingual</Select.Item>
												<Select.Item value="PC852_LATIN2" label="PC852 Latin 2">PC852 Latin 2</Select.Item>
												<Select.Item value="PC858_EURO" label="PC858 Euro">PC858 Euro</Select.Item>
												<Select.Item value="WPC1252" label="WPC1252 Latin">WPC1252 Latin</Select.Item>
											</Select.Content>
										</Select.Root>
										<p class="text-[10px] text-muted-foreground">Change if special characters print incorrectly.</p>
									</div>
								</div>

								<!-- Cash Drawer Toggle -->
								<div class="flex items-center justify-between gap-4 mt-2">
									<div class="min-w-0 space-y-0.5">
										<Label>Open Cash Drawer on Print</Label>
										<p class="text-xs text-muted-foreground">Sends command to open drawer after printing.</p>
									</div>
									<Switch
										checked={thermalPrinterDrawer}
										onCheckedChange={(v) => { thermalPrinterDrawer = v; saveThermalSettings(); }}
									/>
								</div>

								<!-- Test Thermal Print Button -->
								<div class="pt-2">
									<Button
										variant="outline"
										size="sm"
										class="cursor-pointer text-xs"
										onclick={testThermalPrint}
										disabled={testingThermal || !thermalPrinterInterface}
									>
										{#if testingThermal}
											<Loader2 class="mr-1 h-3 w-3 animate-spin" />
											Testing...
										{:else}
											<Printer class="mr-1 h-3 w-3" />
											Test Thermal Print
										{/if}
									</Button>
									<p class="text-[10px] text-muted-foreground mt-1">Sends a test page directly via ESC/POS commands to verify the connection.</p>
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</form>
