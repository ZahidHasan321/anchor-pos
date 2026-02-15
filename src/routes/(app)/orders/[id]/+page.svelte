<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { ArrowLeft, Printer, ShoppingBag, User, CreditCard, Banknote } from '@lucide/svelte';
	import { formatBDT, formatDateTime } from '$lib/format';
	import { printReceipt } from '$lib/print-receipt';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();

	$effect(() => {
		if (form?.success) {
			toast.success('Order status updated');
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	function handlePrintReceipt() {
		const o = data.order;
		printReceipt({
			storeSettings: data.storeSettings,
			orderId: '#' + o.orderNumber,
			orderUuid: o.id, // We'll pass both to printReceipt
			date: formatDateTime(o.createdAt),
			cashier: o.userName ?? '',
			items: data.items.map((item) => ({
				name: item.productName,
				variant: item.variantLabel,
				qty: item.quantity,
				total: item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100)
			})),
			total: o.totalAmount,
			cashReceived: o.cashReceived || 0,
			changeGiven: o.changeGiven || 0,
			footerNote: 'Reprinted on ' + new Date().toLocaleString(),
			isReprint: true
		});
	}
</script>

<svelte:head>
	<title>Order #{data.order.orderNumber} — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" size="icon" href="/orders" class="cursor-pointer">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Order #{data.order.orderNumber}</h1>
				<p class="text-xs tracking-widest text-muted-foreground uppercase opacity-50">
					Reference: {data.order.id}
				</p>
			</div>
		</div>
		<div class="flex gap-2">
			{#if data.user?.role !== 'sales' && data.order.status === 'completed'}
				<div class="mr-4 flex gap-2 border-r pr-4">
					<form method="POST" action="?/updateStatus" use:enhance>
						<input type="hidden" name="status" value="refunded" />
						<Button
							variant="outline"
							type="button"
							class="cursor-pointer text-amber-600"
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (await confirmState.confirm('Mark this order as refunded?')) {
									formElement?.requestSubmit();
								}
							}}
						>
							Mark Refunded
						</Button>
					</form>
					<form method="POST" action="?/updateStatus" use:enhance>
						<input type="hidden" name="status" value="void" />
						<Button
							variant="destructive"
							type="button"
							class="cursor-pointer"
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (await confirmState.confirm('Void this order? This cannot be undone.')) {
									formElement?.requestSubmit();
								}
							}}
						>
							Void Order
						</Button>
					</form>
				</div>
			{/if}
			<Button onclick={handlePrintReceipt} class="cursor-pointer">
				<Printer class="mr-2 h-4 w-4" /> Reprint Receipt
			</Button>
		</div>
	</div>

	<div class="grid gap-6 md:grid-cols-3">
		<Card.Root class="md:col-span-2">
			<Card.Header>
				<Card.Title>Order Items</Card.Title>
			</Card.Header>
			<Card.Content>
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Product</Table.Head>
							<Table.Head class="text-center">Quantity</Table.Head>
							<Table.Head class="text-right">Price</Table.Head>
							<Table.Head class="text-right">Total</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each data.items as item}
							<Table.Row>
								<Table.Cell>
									<div class="font-medium">{item.productName}</div>
									<div class="text-xs text-muted-foreground">{item.variantLabel}</div>
								</Table.Cell>
								<Table.Cell class="text-center">{item.quantity}</Table.Cell>
								<Table.Cell class="text-right">{formatBDT(item.priceAtSale)}</Table.Cell>
								<Table.Cell class="text-right font-bold">
									{formatBDT(item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100))}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
			<Card.Footer class="flex flex-col items-end gap-2 border-t bg-muted/20 p-6">
				<div class="flex w-full max-w-xs justify-between text-sm">
					<span>Subtotal</span>
					<span>{formatBDT(data.order.totalAmount + (data.order.discountAmount || 0))}</span>
				</div>
				<div class="flex w-full max-w-xs justify-between text-sm text-destructive">
					<span>Discount</span>
					<span>-{formatBDT(data.order.discountAmount || 0)}</span>
				</div>
				<div class="flex w-full max-w-xs justify-between border-t pt-2 text-xl font-black">
					<span>Total</span>
					<span>{formatBDT(data.order.totalAmount)}</span>
				</div>
			</Card.Footer>
		</Card.Root>

		<div class="space-y-6">
			<Card.Root>
				<Card.Header>
					<Card.Title>Order Info</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<ShoppingBag class="h-4 w-4 text-primary" />
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Order Status</div>
							<Badge
								variant={data.order.status === 'completed' ? 'secondary' : 'destructive'}
								class="capitalize">{data.order.status}</Badge
							>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<User class="h-4 w-4 text-primary" />
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Cashier</div>
							<div class="font-medium">{data.order.userName}</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							{#if data.order.paymentMethod === 'cash'}
								<Banknote class="h-4 w-4 text-primary" />
							{:else}
								<CreditCard class="h-4 w-4 text-primary" />
							{/if}
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Payment Method</div>
							<div class="font-medium capitalize">{data.order.paymentMethod}</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Customer</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if data.order.customerId}
						<a
							href="/customers/{data.order.customerId}"
							class="text-lg font-bold text-primary hover:underline"
						>
							{data.order.customerName}
						</a>
					{:else}
						<div class="text-lg font-bold">{data.order.customerName ?? 'Walk-in Customer'}</div>
					{/if}
					{#if data.order.customerPhone}
						<div class="text-muted-foreground">{data.order.customerPhone}</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
