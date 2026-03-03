<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatCurrency } from '$lib/format';
	import { Printer, ArrowLeft } from '@lucide/svelte';
	import { browser } from '$app/environment';

	let { data } = $props();
	let labelContainer: HTMLDivElement | null = $state(null);

	onMount(async () => {
		if (browser) {
			const JsBarcode = (await import('jsbarcode')).default;
			const svgs = labelContainer?.querySelectorAll('.barcode-svg');
			svgs?.forEach((svg, i) => {
				JsBarcode(svg, data.variants[i].barcode, {
					format: 'CODE128',
					width: 1.5,
					height: 40,
					displayValue: true,
					fontSize: 10,
					margin: 2
				});
			});
		}
	});

	function getLabelPrinter(): string {
		return localStorage.getItem('pos-default-label-printer') || '';
	}

	async function printWithElectronOrFallback(html: string) {
		// @ts-ignore
		if (window.electron?.printToDevice) {
			const printerName = getLabelPrinter();
			// @ts-ignore
			return await window.electron.printToDevice(html, printerName, !!printerName);
		}
		// @ts-ignore
		if (window.electron?.printNative) {
			// @ts-ignore
			window.electron.printNative(html, true);
			return;
		}
		// Web fallback
		const printWindow = window.open('', '_blank');
		if (!printWindow) return;
		printWindow.document.write(html);
		printWindow.document.close();
		printWindow.onload = () => printWindow.print();
	}

	function printLabels() {
		if (!labelContainer) return;
		const html = `<!DOCTYPE html><html><head>
<style>
  @page { size: 50.8mm 25.4mm; margin: 0; }
  body { margin: 0; padding: 0; }
  .label {
    width: 50.8mm; height: 25.4mm;
    padding: 1.5mm; box-sizing: border-box;
    page-break-after: always;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: Arial, sans-serif;
  }
  .label:last-child { page-break-after: auto; }
  .product-name { font-size: 8px; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .variant-info { font-size: 7px; text-align: center; }
  .price { font-size: 11px; font-weight: bold; margin-top: 1mm; }
  svg { max-width: 44mm; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>${labelContainer.innerHTML}</body></html>`;

		printWithElectronOrFallback(html);
	}

	function printSingleLabel(element: HTMLElement) {
		const html = `<!DOCTYPE html><html><head>
<style>
  @page { size: 50.8mm 25.4mm; margin: 0; }
  body { margin: 0; padding: 0; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .label {
    width: 50.8mm; height: 25.4mm;
    padding: 1.5mm; box-sizing: border-box;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    font-family: Arial, sans-serif;
  }
  .product-name { font-size: 8px; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .variant-info { font-size: 7px; text-align: center; }
  .price { font-size: 11px; font-weight: bold; margin-top: 1mm; }
  svg { max-width: 44mm; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>${element.outerHTML}</body></html>`;

		printWithElectronOrFallback(html);
	}
</script>

<svelte:head>
	<title>Labels — {data.product.name} — Clothing POS</title>
</svelte:head>

<div class="space-y-4 p-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button
				variant="outline"
				size="icon"
				href="/inventory/{data.product.id}"
				class="cursor-pointer"
			>
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="flex flex-col">
				<h2 class="text-xl font-bold">Barcode Labels - {data.product.name}</h2>
				<p class="text-sm text-muted-foreground">Click on a label to print individually.</p>
			</div>
		</div>
		<Button onclick={printLabels} class="cursor-pointer">
			<Printer class="mr-2 h-4 w-4" /> Print All Labels
		</Button>
	</div>

	<div bind:this={labelContainer} class="flex flex-wrap gap-4">
		{#each data.variants as variant}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="label cursor-pointer rounded border bg-white p-2 transition-all hover:border-primary hover:shadow-lg"
				style="width: 50.8mm; height: 25.4mm; color: black;"
				onclick={(e) => printSingleLabel(e.currentTarget as HTMLElement)}
			>
				<div
					class="product-name"
					style="font-size: 8px; font-weight: bold; text-align: center; margin-bottom: 1mm;"
				>
					{data.product.name}
				</div>
				<svg class="barcode-svg" style="max-width: 44mm;"></svg>
				<div class="variant-info" style="font-size: 7px; text-align: center;">
					Size: {variant.size}{variant.color ? ` | Color: ${variant.color}` : ''}
				</div>
				<div class="price" style="font-size: 11px; font-weight: bold; margin-top: 1mm;">
					{formatCurrency(variant.price)}
				</div>
			</div>
		{/each}
	</div>
</div>
