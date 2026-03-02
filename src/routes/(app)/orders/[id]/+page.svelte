<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { ArrowLeft, Printer, ShoppingBag, User, CreditCard, Banknote } from '@lucide/svelte';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { printReceipt } from '$lib/print-receipt';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	const isNative = $derived(browser && !!(window as any).electron);

	let nativeOrder = $state<any>(null);
	let nativeItems = $state<any[]>([]);
	let nativeSettings = $state<Record<string, string>>({});

	async function loadNativeOrderDetail() {
		if (!isNative || !powersync.ready) return;
		const orderId = data.orderId;

		const [orderRows, itemRows, settingsRows] = await Promise.all([
			powersync.db.getAll(`
				SELECT o.id, o.order_number as orderNumber, o.total_amount as totalAmount, o.status,
					o.payment_method as paymentMethod, o.discount_amount as discountAmount,
					o.cash_received as cashReceived, o.change_given as changeGiven,
					o.created_at as createdAt, o.customer_id as customerId,
					COALESCE(c.name, 'Walk-in Customer') as customerName, c.phone as customerPhone,
					COALESCE(u.name, 'System') as userName
				FROM orders o
				LEFT JOIN customers c ON o.customer_id = c.id
				LEFT JOIN users u ON o.user_id = u.id
				WHERE o.id = ?
			`, [orderId]),
			powersync.db.getAll(`
				SELECT oi.id, oi.order_id as orderId, oi.variant_id as variantId,
					oi.quantity, oi.price_at_sale as priceAtSale, oi.discount,
					oi.product_name as productName, oi.variant_label as variantLabel,
					oi.status, pv.product_id as productId
				FROM order_items oi
				LEFT JOIN product_variants pv ON oi.variant_id = pv.id
				WHERE oi.order_id = ?
			`, [orderId]),
			powersync.db.getAll('SELECT key, value FROM store_settings')
		]);

		nativeOrder = (orderRows as any[])[0] ?? null;
		nativeItems = itemRows as any[];
		nativeSettings = (settingsRows as any[]).reduce((acc: Record<string, string>, r: any) => { acc[r.key] = r.value; return acc; }, {});
	}

	$effect(() => {
		if (isNative && powersync.ready) loadNativeOrderDetail();
	});

	const order = $derived(isNative ? nativeOrder : data.order);
	const items = $derived(isNative ? nativeItems : data.items);
	const storeSettings = $derived(isNative ? nativeSettings : data.storeSettings);

	$effect(() => {
		if (form?.success) {
			toast.success('Order status updated');
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	function handlePrintReceipt() {
		const o = order;
		printReceipt({
			storeSettings: storeSettings,
			orderId: '#' + (o.orderNumber ?? o.id.slice(0, 8).toUpperCase()),
			orderUuid: o.id, // We'll pass both to printReceipt
			date: formatDateTime(o.createdAt),
			cashier: o.userName ?? '',
			items: items.map((item: any) => ({
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
	<title>Order #{order?.orderNumber ?? order?.id?.slice(0, 8).toUpperCase()} — Clothing POS</title>
</svelte:head>

{#if order}
<div class="space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" size="icon" href="/orders" class="cursor-pointer">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Order #{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}</h1>
			</div>
		</div>
		<div class="flex gap-2">
			{#if data.user?.role !== 'sales' && order.status === 'completed'}
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
							<Table.Head class="text-right"></Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each items as item}
							<Table.Row class={item.status === 'refunded' ? 'opacity-50 grayscale bg-muted/30' : ''}>
								<Table.Cell>
									<div class="flex items-center gap-2">
										{#if item.status === 'refunded'}
											<Badge variant="destructive" class="h-5 px-1.5 text-[9px] uppercase tracking-wider">Refunded</Badge>
										{/if}
										<div>
											{#if item.productId}
												<a
													href="/inventory/{item.productId}"
													class="font-medium text-primary hover:underline"
												>
													{item.productName}
												</a>
											{:else}
												<div class="font-medium">{item.productName}</div>
											{/if}
											<div class="text-xs text-muted-foreground">{item.variantLabel}</div>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="text-center">{item.quantity}</Table.Cell>
								<Table.Cell class="text-right">{formatCurrency(item.priceAtSale)}</Table.Cell>
								<Table.Cell class="text-right font-bold">
									{formatCurrency(
										item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100)
									)}
								</Table.Cell>
								<Table.Cell class="text-right">
									{#if item.status !== 'refunded' && order.status === 'completed' && data.user?.role !== 'sales'}
										<form method="POST" action="?/refundItem" use:enhance>
											<input type="hidden" name="itemId" value={item.id} />
											<Button
												variant="ghost"
												size="sm"
												type="button"
												class="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
												onclick={async (e) => {
													const formElement = e.currentTarget.closest('form');
													if (await confirmState.confirm({
														title: 'Refund Item',
														message: `Refund ${item.productName} (${item.variantLabel})? This will restore stock and update order total.`,
														confirmText: 'Refund',
														variant: 'destructive'
													})) {
														formElement?.requestSubmit();
													}
												}}
											>
												Refund
											</Button>
										</form>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
			<Card.Footer class="flex flex-col items-end gap-2 border-t bg-muted/20 p-6">
				<div class="flex w-full max-w-xs justify-between text-sm">
					<span>Subtotal</span>
					<span>{formatCurrency(order.totalAmount + (order.discountAmount || 0))}</span>
				</div>
				<div class="flex w-full max-w-xs justify-between text-sm text-destructive">
					<span>Discount</span>
					<span>-{formatCurrency(order.discountAmount || 0)}</span>
				</div>
				<div class="flex w-full max-w-xs justify-between border-t pt-2 text-xl font-black">
					<span>Total</span>
					<span>{formatCurrency(order.totalAmount)}</span>
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
								variant={order.status === 'completed' ? 'secondary' : 'destructive'}
								class="capitalize">{order.status}</Badge
							>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<User class="h-4 w-4 text-primary" />
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Cashier</div>
							<div class="font-medium">{order.userName}</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							{#if order.paymentMethod === 'cash'}
								<Banknote class="h-4 w-4 text-primary" />
							{:else}
								<CreditCard class="h-4 w-4 text-primary" />
							{/if}
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Payment Method</div>
							<div class="font-medium capitalize">{order.paymentMethod}</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root>
				<Card.Header>
					<Card.Title>Customer</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if order.customerId}
						<a
							href="/customers/{order.customerId}"
							class="text-lg font-bold text-primary hover:underline"
						>
							{order.customerName}
						</a>
					{:else}
						<div class="text-lg font-bold">{order.customerName ?? 'Walk-in Customer'}</div>
					{/if}
					{#if order.customerPhone}
						<div class="text-muted-foreground">{order.customerPhone}</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
{:else}
<div class="space-y-6 p-6">
	<div class="flex items-center gap-4">
		<div class="h-10 w-10 animate-pulse rounded-md bg-muted"></div>
		<div class="h-9 w-48 animate-pulse rounded-md bg-muted"></div>
	</div>
	<div class="grid gap-6 md:grid-cols-3">
		<div class="md:col-span-2 h-64 animate-pulse rounded-xl bg-muted"></div>
		<div class="space-y-6">
			<div class="h-40 animate-pulse rounded-xl bg-muted"></div>
			<div class="h-32 animate-pulse rounded-xl bg-muted"></div>
		</div>
	</div>
</div>
{/if}
