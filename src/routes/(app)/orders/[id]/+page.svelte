<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import {
		ArrowLeft,
		Printer,
		PrinterCheck,
		ShoppingBag,
		User,
		CreditCard,
		Banknote,
		Bluetooth,
		Loader2
	} from '@lucide/svelte';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { printReceipt } from '$lib/print-receipt';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { isNative } from '$lib/electron-data.svelte';
	import { printerState } from '$lib/stores/printer.svelte';
	import { generateId, toDbDate } from '$lib/utils';

	const pStatus = $derived(printerState.status);

	let { data, form } = $props();

	let nativeOrder = $state<any>(null);
	let nativeItems = $state<any[]>([]);
	let nativeSettings = $state<Record<string, string>>({});

	async function loadNativeOrderDetail() {
		if (!isNative || !powersync.ready) return;
		const orderId = data.orderId;

		const [orderRows, itemRows, settingsRows] = await Promise.all([
			powersync.db.getAll(
				`
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
			`,
				[orderId]
			),
			powersync.db.getAll(
				`
				SELECT oi.id, oi.order_id as orderId, oi.variant_id as variantId,
					oi.quantity, oi.price_at_sale as priceAtSale, oi.discount,
					oi.product_name as productName, oi.variant_label as variantLabel,
					oi.status, pv.product_id as productId
				FROM order_items oi
				LEFT JOIN product_variants pv ON oi.variant_id = pv.id
				WHERE oi.order_id = ?
			`,
				[orderId]
			),
			powersync.db.getAll('SELECT key, value FROM store_settings')
		]);

		nativeOrder = (orderRows as any[])[0] ?? null;
		nativeItems = itemRows as any[];
		nativeSettings = (settingsRows as any[]).reduce((acc: Record<string, string>, r: any) => {
			acc[r.key] = r.value;
			return acc;
		}, {});
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

	async function nativeUpdateStatus(status: string) {
		if (!isNative || !powersync.ready || !order) return;
		const orderId = order.id;
		if (status === 'refunded' || status === 'void') {
			await powersync.db.execute(`UPDATE orders SET status = ? WHERE id = ?`, [status, orderId]);
			// Restore stock for all active items
			const activeItems = items.filter((i: any) => i.status !== 'refunded');
			for (const item of activeItems) {
				if (item.variantId) {
					await powersync.db.execute(
						`UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?`,
						[item.quantity, item.variantId]
					);
				}
				await powersync.db.execute(`UPDATE order_items SET status = 'refunded' WHERE id = ?`, [
					item.id
				]);
			}
			// Record cashbook outflow
			await powersync.db.execute(
				`INSERT INTO cashbook (id, amount, type, category, description, user_id, created_at)
				 VALUES (?, ?, 'out', ?, ?, ?, ?)`,
				[
					generateId(),
					order.totalAmount,
					status === 'void' ? 'void' : 'refund',
					`${status === 'void' ? 'Void' : 'Refund'}: Order #${order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}`,
					data.user?.id,
					toDbDate(new Date())
				]
			);
			toast.success(`Order ${status === 'void' ? 'voided' : 'refunded'}`);
			loadNativeOrderDetail();
		}
	}

	async function nativeRefundItem(itemId: string) {
		if (!isNative || !powersync.ready) return;
		const item = items.find((i: any) => i.id === itemId);
		if (!item) return;
		const refundAmount = item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100);
		await powersync.db.execute(`UPDATE order_items SET status = 'refunded' WHERE id = ?`, [itemId]);
		if (item.variantId) {
			await powersync.db.execute(
				`UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?`,
				[item.quantity, item.variantId]
			);
		}
		// Update order total
		await powersync.db.execute(`UPDATE orders SET total_amount = total_amount - ? WHERE id = ?`, [
			refundAmount,
			order.id
		]);
		// Record cashbook outflow
		await powersync.db.execute(
			`INSERT INTO cashbook (id, amount, type, category, description, user_id, created_at)
			 VALUES (?, ?, 'out', 'refund', ?, ?, ?)`,
			[
				generateId(),
				refundAmount,
				`Refund item: ${item.productName} (${item.variantLabel})`,
				data.user?.id,
				toDbDate(new Date())
			]
		);
		toast.success('Item refunded');
		loadNativeOrderDetail();
	}

	$effect(() => {
		if (form?.success) {
			toast.success('Order status updated');
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	async function handlePrintReceipt() {
		const o = order;
		const originalTotal = items.reduce(
			(acc: number, item: any) =>
				acc + item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100),
			0
		);

		const result = await printReceipt({
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
			paymentMethod: o.paymentMethod,
			status: o.status,
			footerNote: 'Reprinted on ' + new Date().toLocaleString(),
			isReprint: true
		});
		if (result && !result.success && result.error) {
			toast.error(result.error);
		}
	}
</script>

<svelte:head>
	<title>Order #{order?.orderNumber ?? order?.id?.slice(0, 8).toUpperCase()} — Clothing POS</title>
</svelte:head>

{#if order}
	<div class="space-y-6 p-4 sm:p-6">
		<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-3">
				<Button
					variant="outline"
					size="icon"
					href="/orders"
					aria-label="Back to orders"
					class="h-9 w-9 shrink-0"
				>
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div class="overflow-hidden">
					<h1 class="truncate text-xl font-black tracking-tight sm:text-3xl">
						Order #{order.orderNumber ?? order.id.slice(0, 8).toUpperCase()}
					</h1>
					<p class="text-[10px] tracking-widest text-muted-foreground uppercase">
						{formatDateTime(order.createdAt)}
					</p>
				</div>
			</div>
			<div class="flex flex-wrap items-center gap-2">
				{#if data.user?.role !== 'sales' && order.status === 'completed'}
					<div class="flex gap-2 border-r pr-2 sm:mr-2 sm:pr-4">
						{#if isNative}
							<Button
								variant="outline"
								size="sm"
								type="button"
								class="h-9 px-3 text-xs font-bold text-amber-600 hover:bg-amber-50 hover:text-amber-700"
								onclick={async () => {
									if (await confirmState.confirm('Mark this entire order as refunded?')) {
										nativeUpdateStatus('refunded');
									}
								}}
							>
								Refund
							</Button>
							<Button
								variant="destructive"
								size="sm"
								type="button"
								class="h-9 px-3 text-xs font-bold"
								onclick={async () => {
									if (await confirmState.confirm('Void this order? This cannot be undone.')) {
										nativeUpdateStatus('void');
									}
								}}
							>
								Void
							</Button>
						{:else}
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
						{/if}
					</div>
				{/if}
				{#if pStatus === 'disconnected' || pStatus === 'connecting'}
					<Button
						variant="outline"
						size="sm"
						class="h-9 cursor-pointer border-amber-300 px-3 text-xs font-bold text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400"
						onclick={async () => {
							const result = await printerState.reconnect();
							if (result.success) toast.success('Printer reconnected');
							else toast.error(result.error || 'Could not reconnect');
						}}
						disabled={pStatus === 'connecting'}
					>
						{#if pStatus === 'connecting'}
							<Loader2 class="mr-1.5 h-3.5 w-3.5 animate-spin" />
						{:else}
							<Bluetooth class="mr-1.5 h-3.5 w-3.5" />
						{/if}
						Reconnect
					</Button>
				{/if}
				<Button
					onclick={handlePrintReceipt}
					size="sm"
					class="h-9 cursor-pointer px-3 text-xs font-bold"
				>
					{#if printerState.status === 'connected'}
						<PrinterCheck class="mr-2 h-3.5 w-3.5" />
					{:else}
						<Printer class="mr-2 h-3.5 w-3.5" />
					{/if}
					Receipt
				</Button>
			</div>
		</div>

		<div class="grid gap-6 lg:grid-cols-3">
			<Card.Root class="border-primary/10 pb-0 shadow-sm lg:col-span-2">
				<Card.Header class="p-4 sm:px-6">
					<Card.Title class="text-lg font-bold">Order Items</Card.Title>
				</Card.Header>
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head class="pl-4">Product</Table.Head>
								<Table.Head class="hidden text-center sm:table-cell">Qty</Table.Head>
								<Table.Head class="hidden text-right sm:table-cell">Price</Table.Head>
								<Table.Head class="pr-4 text-right">Total</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each items as item}
								<Table.Row
									class="{item.status === 'refunded'
										? 'bg-muted/20 opacity-40 grayscale'
										: ''} group"
								>
									<Table.Cell class="py-4 pl-4">
										<div class="flex flex-col gap-1">
											<div class="flex items-center gap-2">
												{#if item.status === 'refunded'}
													<Badge
														variant="destructive"
														class="h-4 px-1 text-[8px] font-black tracking-tighter uppercase"
														>Refunded</Badge
													>
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
											<div
												class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase"
											>
												{item.variantLabel}
											</div>
											<!-- Mobile-only info -->
											<div class="flex items-center gap-2 text-[10px] font-bold sm:hidden">
												<span class="rounded bg-muted px-1.5 py-0.5">{item.quantity}x</span>
												<span class="text-muted-foreground">{formatCurrency(item.priceAtSale)}</span
												>
											</div>
										</div>
									</Table.Cell>
									<Table.Cell class="hidden text-center font-bold sm:table-cell"
										>{item.quantity}</Table.Cell
									>
									<Table.Cell class="hidden text-right text-muted-foreground sm:table-cell"
										>{formatCurrency(item.priceAtSale)}</Table.Cell
									>
									<Table.Cell class="py-4 pr-4 text-right">
										<div class="flex flex-col items-end gap-2">
											<span class="text-sm font-black">
												{formatCurrency(
													item.priceAtSale * item.quantity * (1 - (item.discount || 0) / 100)
												)}
											</span>
											{#if item.status !== 'refunded' && order.status === 'completed' && data.user?.role !== 'sales'}
												{#if isNative}
													<Button
														variant="ghost"
														size="sm"
														type="button"
														class="h-7 px-2 text-[10px] font-bold text-destructive transition-opacity hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100"
														onclick={async () => {
															if (
																await confirmState.confirm({
																	title: 'Refund Item',
																	message: `Refund ${item.productName} (${item.variantLabel})? This will restore stock and update order total.`,
																	confirmText: 'Refund',
																	variant: 'destructive'
																})
															) {
																nativeRefundItem(item.id);
															}
														}}
													>
														Refund Item
													</Button>
												{:else}
													<form
														method="POST"
														action="?/refundItem"
														use:enhance
														class="transition-opacity md:opacity-0 md:group-hover:opacity-100"
													>
														<input type="hidden" name="itemId" value={item.id} />
														<Button
															variant="ghost"
															size="sm"
															type="button"
															class="h-7 px-2 text-[10px] font-bold text-destructive hover:bg-destructive/10"
															onclick={async (e) => {
																const formElement = e.currentTarget.closest('form');
																if (
																	await confirmState.confirm({
																		title: 'Refund Item',
																		message: `Refund ${item.productName} (${item.variantLabel})? This will restore stock and update order total.`,
																		confirmText: 'Refund',
																		variant: 'destructive'
																	})
																) {
																	formElement?.requestSubmit();
																}
															}}
														>
															Refund Item
														</Button>
													</form>
												{/if}
											{/if}
										</div>
									</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<Card.Footer class="flex flex-col items-end gap-2 border-t bg-muted/10 p-4 sm:p-6">
					<div
						class="flex w-full max-w-[240px] justify-between text-xs font-medium text-muted-foreground"
					>
						<span>Subtotal</span>
						<span>{formatCurrency(order.totalAmount + (order.discountAmount || 0))}</span>
					</div>
					<div class="flex w-full max-w-[240px] justify-between text-xs font-bold text-destructive">
						<span>Discount</span>
						<span>-{formatCurrency(order.discountAmount || 0)}</span>
					</div>
					<div
						class="mt-2 flex w-full max-w-[240px] justify-between border-t border-primary/20 pt-3"
					>
						<span class="text-sm font-bold tracking-widest text-muted-foreground uppercase"
							>Total</span
						>
						<span class="text-2xl font-black tracking-tighter text-primary"
							>{formatCurrency(order.totalAmount)}</span
						>
					</div>
				</Card.Footer>
			</Card.Root>

			<div class="space-y-6">
				<Card.Root class="border-primary/10 shadow-sm">
					<Card.Header class="p-4 sm:px-6">
						<Card.Title class="text-base font-bold">Transaction Details</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4 p-4 sm:px-6">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="rounded-full bg-primary/10 p-2">
									<ShoppingBag class="h-3.5 w-3.5 text-primary" />
								</div>
								<span class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
									>Status</span
								>
							</div>
							<Badge
								variant={order.status === 'completed' ? 'secondary' : 'destructive'}
								class="h-5 px-2 text-[10px] font-black tracking-wider uppercase"
								>{order.status}</Badge
							>
						</div>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<div class="rounded-full bg-primary/10 p-2">
									<User class="h-3.5 w-3.5 text-primary" />
								</div>
								<span class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
									>Cashier</span
								>
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
								<span class="text-xs font-bold tracking-wider text-muted-foreground uppercase"
									>Payment</span
								>
							</div>
							<span class="text-sm font-black capitalize">{order.paymentMethod}</span>
						</div>
					</Card.Content>
				</Card.Root>

				<Card.Root class="border-primary/10 shadow-sm">
					<Card.Header class="p-4 sm:px-6">
						<Card.Title class="text-base font-bold">Customer Info</Card.Title>
					</Card.Header>
					<Card.Content class="p-4 sm:px-6">
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
			<div class="h-64 animate-pulse rounded-xl bg-muted md:col-span-2"></div>
			<div class="space-y-6">
				<div class="h-40 animate-pulse rounded-xl bg-muted"></div>
				<div class="h-32 animate-pulse rounded-xl bg-muted"></div>
			</div>
		</div>
	</div>
{/if}
