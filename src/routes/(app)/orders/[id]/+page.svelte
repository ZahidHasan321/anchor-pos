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
		if (isNative && powersync.ready) {
			powersync.dataVersion; // re-run when sync completes with new data
			loadNativeOrderDetail();
		}
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
		const originalTotal = items.reduce((acc: number, item: any) => acc + (item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100)), 0);
		
		printReceipt({
			storeSettings: storeSettings,
			orderId: '#' + (o.orderNumber ?? o.id.slice(0, 8).toUpperCase()),
			orderUuid: o.id,
			date: formatDateTime(o.createdAt),
			cashier: o.userName ?? '',
			items: items.map((item: any) => ({
				name: item.productName,
				variant: item.variantLabel,
				qty: item.quantity,
				total: item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100),
				status: item.status
			})),
			total: o.totalAmount,
			originalTotal: originalTotal,
			cashReceived: o.cashReceived || 0,
			changeGiven: o.changeGiven || 0,
			status: o.status,
			footerNote: 'Reprinted on ' + new Date().toLocaleString(),
			isReprint: true
		});
	}
</script>

<svelte:head>
	<title>Order #{order?.orderNumber ?? order?.id?.slice(0, 8).toUpperCase()} — Clothing POS</title>
</svelte:head>

{#if order}
<div class="space-y-6 p-4 sm:p-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<Button variant="outline" size="icon" href="/orders" class="h-9 w-9 shrink-0">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div class="overflow-hidden">
				<h1 class="truncate text-xl font-black tracking-tight sm:text-3xl">
					Order #{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
				</h1>
				<p class="text-[10px] uppercase tracking-widest text-muted-foreground">
					{formatDateTime(order.createdAt)}
				</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if data.user?.role !== 'sales' && order.status === 'completed'}
				<div class="flex gap-2 border-r pr-2 sm:mr-2 sm:pr-4">
					<form method="POST" action="?/updateStatus" use:enhance>
						<input type="hidden" name="status" value="refunded" />
						<Button
							variant="outline"
							size="sm"
							type="button"
							class="h-9 px-3 text-xs font-bold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (await confirmState.confirm('Mark this entire order as refunded?')) {
									formElement?.requestSubmit();
								}
							}}
						>
							Refund
						</Button>
					</form>
					<form method="POST" action="?/updateStatus" use:enhance>
						<input type="hidden" name="status" value="void" />
						<Button
							variant="destructive"
							size="sm"
							type="button"
							class="h-9 px-3 text-xs font-bold"
							onclick={async (e) => {
								const formElement = e.currentTarget.closest('form');
								if (await confirmState.confirm('Void this order? This cannot be undone.')) {
									formElement?.requestSubmit();
								}
							}}
						>
							Void
						</Button>
					</form>
				</div>
			{/if}
			<Button onclick={handlePrintReceipt} size="sm" class="h-9 px-3 text-xs font-bold">
				<Printer class="mr-2 h-3.5 w-3.5" /> Receipt
			</Button>
		</div>
	</div>

	<div class="grid gap-6 lg:grid-cols-3">
		<Card.Root class="lg:col-span-2 overflow-hidden border-primary/10 shadow-sm">
			<Card.Header class="bg-muted/30 pb-4">
				<Card.Title class="text-lg font-bold">Order Items</Card.Title>
			</Card.Header>
			<Card.Content class="p-0">
				<Table.Root>
					<Table.Header class="bg-muted/10">
						<Table.Row>
							<Table.Head class="pl-4">Product</Table.Head>
							<Table.Head class="hidden text-center sm:table-cell">Qty</Table.Head>
							<Table.Head class="hidden text-right sm:table-cell">Price</Table.Head>
							<Table.Head class="text-right pr-4">Total</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each items as item}
							<Table.Row class="{item.status === 'refunded' ? 'opacity-40 grayscale bg-muted/20' : ''} group">
								<Table.Cell class="pl-4 py-4">
									<div class="flex flex-col gap-1">
										<div class="flex items-center gap-2">
											{#if item.status === 'refunded'}
												<Badge variant="destructive" class="h-4 px-1 text-[8px] font-black uppercase tracking-tighter">Refunded</Badge>
											{/if}
											{#if item.productId}
												<a
													href="/inventory/{item.productId}"
													class="text-sm font-bold text-primary hover:underline"
												>
													{item.productName}
												</a>
											{:else}
												<span class="text-sm font-bold">{item.productName}</span>
											{/if}
										</div>
										<div class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{item.variantLabel}</div>
										<!-- Mobile-only info -->
										<div class="flex items-center gap-2 text-[10px] font-bold sm:hidden">
											<span class="rounded bg-muted px-1.5 py-0.5">{item.quantity}x</span>
											<span class="text-muted-foreground">{formatCurrency(item.priceAtSale)}</span>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell class="hidden text-center sm:table-cell font-bold">{item.quantity}</Table.Cell>
								<Table.Cell class="hidden text-right sm:table-cell text-muted-foreground">{formatCurrency(item.priceAtSale)}</Table.Cell>
								<Table.Cell class="text-right pr-4 py-4">
									<div class="flex flex-col items-end gap-2">
										<span class="font-black text-sm">
											{formatCurrency(
												item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100)
											)}
										</span>
										{#if item.status !== 'refunded' && order.status === 'completed' && data.user?.role !== 'sales'}
											<form method="POST" action="?/refundItem" use:enhance class="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
												<input type="hidden" name="itemId" value={item.id} />
												<Button
													variant="ghost"
													size="sm"
													type="button"
													class="h-7 px-2 text-[10px] font-bold text-destructive hover:bg-destructive/10"
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
													Refund Item
												</Button>
											</form>
										{/if}
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</Card.Content>
			<Card.Footer class="flex flex-col items-end gap-2 border-t bg-muted/10 p-4 sm:p-6">
				<div class="flex w-full max-w-[240px] justify-between text-xs font-medium text-muted-foreground">
					<span>Subtotal</span>
					<span>{formatCurrency(order.totalAmount + (order.discountAmount || 0))}</span>
				</div>
				<div class="flex w-full max-w-[240px] justify-between text-xs font-bold text-destructive">
					<span>Discount</span>
					<span>-{formatCurrency(order.discountAmount || 0)}</span>
				</div>
				<div class="mt-2 flex w-full max-w-[240px] justify-between border-t border-primary/20 pt-3">
					<span class="text-sm font-bold uppercase tracking-widest text-muted-foreground">Total</span>
					<span class="text-2xl font-black tracking-tighter text-primary">{formatCurrency(order.totalAmount)}</span>
				</div>
			</Card.Footer>
		</Card.Root>

		<div class="space-y-6">
			<Card.Root class="border-primary/10 shadow-sm overflow-hidden">
				<Card.Header class="bg-muted/30 pb-4">
					<Card.Title class="text-base font-bold">Transaction Details</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4 pt-4">
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="rounded-full bg-primary/10 p-2">
								<ShoppingBag class="h-3.5 w-3.5 text-primary" />
							</div>
							<span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</span>
						</div>
						<Badge
							variant={order.status === 'completed' ? 'secondary' : 'destructive'}
							class="h-5 px-2 text-[10px] font-black uppercase tracking-wider">{order.status}</Badge
						>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="rounded-full bg-primary/10 p-2">
								<User class="h-3.5 w-3.5 text-primary" />
							</div>
							<span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cashier</span>
						</div>
						<span class="text-sm font-black">{order.userName}</span>
					</div>
					<div class="flex items-center justify-between">
						<div class="flex items-center gap-3">
							<div class="rounded-full bg-primary/10 p-2">
								{#if order.paymentMethod === 'cash'}
									<Banknote class="h-3.5 w-3.5 text-primary" />
								{:else}
									<CreditCard class="h-3.5 w-3.5 text-primary" />
								{/if}
							</div>
							<span class="text-xs font-bold text-muted-foreground uppercase tracking-wider">Payment</span>
						</div>
						<span class="text-sm font-black capitalize">{order.paymentMethod}</span>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="border-primary/10 shadow-sm overflow-hidden">
				<Card.Header class="bg-muted/30 pb-4">
					<Card.Title class="text-base font-bold">Customer Info</Card.Title>
				</Card.Header>
				<Card.Content class="pt-4">
					{#if order.customerId}
						<a
							href="/customers/{order.customerId}"
							class="text-lg font-black text-primary hover:underline"
						>
							{order.customerName}
						</a>
					{:else}
						<div class="text-lg font-black">{order.customerName ?? 'Walk-in Customer'}</div>
					{/if}
					{#if order.customerPhone}
						<div class="mt-1 flex items-center gap-2 text-xs font-bold text-muted-foreground">
							<span class="h-1.5 w-1.5 rounded-full bg-primary/40"></span>
							{order.customerPhone}
						</div>
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
