<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ArrowLeft, Phone, Mail, ChevronLeft, ChevronRight, Pencil } from '@lucide/svelte';
	import { formatCurrency, formatDateTime } from '$lib/format';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';
	import { powersync } from '$lib/powersync.svelte';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	const isNative = $derived(browser && !!(window as any).electron);

	let nativeCustomer = $state<any>(null);
	let nativeOrders = $state<any[]>([]);
	let nativeTotalSpent = $state(0);
	let nativeTotalOrders = $state(0);
	let nativePagination = $state({ currentPage: 1, totalPages: 1, totalOrders: 0, perPage: 10 });

	async function loadNativeCustomerDetail() {
		if (!isNative || !powersync.ready) return;
		const customerId = data.customerId;
		const perPage = 10;
		const pg = parseInt(new URLSearchParams(window.location.search).get('page') ?? '1');
		const offset = (pg - 1) * perPage;

		const [customerRows, completedCount, spentResult, allCount, orderRows] = await Promise.all([
			powersync.db.getAll('SELECT * FROM customers WHERE id = ?', [customerId]),
			powersync.db.get("SELECT count(*) as count FROM orders WHERE customer_id = ? AND status = 'completed'", [customerId]),
			powersync.db.get("SELECT COALESCE(SUM(total_amount), 0) as total FROM orders WHERE customer_id = ? AND status = 'completed'", [customerId]),
			powersync.db.get('SELECT count(*) as count FROM orders WHERE customer_id = ?', [customerId]),
			powersync.db.getAll('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [customerId, perPage, offset])
		]);

		nativeCustomer = (customerRows as any[])[0] ?? null;
		nativeTotalOrders = (completedCount as any)?.count ?? 0;
		nativeTotalSpent = (spentResult as any)?.total ?? 0;
		const total = (allCount as any)?.count ?? 0;
		nativePagination = { currentPage: pg, totalPages: Math.max(1, Math.ceil(total / perPage)), totalOrders: total, perPage };
		nativeOrders = (orderRows as any[]).map((o: any) => ({
			...o,
			orderNumber: o.order_number,
			totalAmount: o.total_amount,
			paymentMethod: o.payment_method,
			createdAt: o.created_at,
			customerId: o.customer_id
		}));
	}

	$effect(() => {
		if (isNative && powersync.ready) {
			powersync.dataVersion; // re-run when sync completes with new data
			loadNativeCustomerDetail();
		}
	});

	const customer = $derived(isNative ? nativeCustomer : data.customer);
	const customerOrders = $derived(isNative ? nativeOrders : data.orders);
	const totalSpent = $derived(isNative ? nativeTotalSpent : data.totalSpent);
	const totalOrders = $derived(isNative ? nativeTotalOrders : data.totalOrders);
	const pagination = $derived(isNative ? nativePagination : data.pagination);

	let editDialogOpen = $state(false);

	$effect(() => {
		if (form?.success) {
			toast.success('Customer updated successfully');
			editDialogOpen = false;
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});

	function goToPage(page: number) {
		goto(`?page=${page}`, { noScroll: true, keepFocus: true });
	}
</script>

<svelte:head>
	<title>{customer?.name ?? 'Customer'} — Customers — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-6">
	{#if customer}
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-4">
				<Button variant="outline" size="icon" href="/customers" class="cursor-pointer">
					<ArrowLeft class="h-4 w-4" />
				</Button>
				<div>
					<h1 class="text-3xl font-bold tracking-tight">{customer.name}</h1>
					<p class="text-muted-foreground">Customer Profile & Purchase History</p>
				</div>
			</div>
			<Button variant="outline" onclick={() => (editDialogOpen = true)} class="cursor-pointer">
				<Pencil class="mr-2 h-4 w-4" /> Edit
			</Button>
		</div>

		<div class="grid gap-6 md:grid-cols-3">
			<!-- Customer Summary -->
			<Card.Root>
				<Card.Header>
					<Card.Title>Customer Info</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<Phone class="h-4 w-4 text-primary" />
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Phone</div>
							<div class="font-medium">{customer.phone ?? 'Not provided'}</div>
						</div>
					</div>
					<div class="flex items-center gap-3">
						<div class="rounded-full bg-primary/10 p-2">
							<Mail class="h-4 w-4 text-primary" />
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Email</div>
							<div class="font-medium">{customer.email ?? 'Not provided'}</div>
						</div>
					</div>
					<div class="border-t pt-4">
						<div class="grid grid-cols-2 gap-4">
							<div>
								<div class="text-xs text-muted-foreground">Completed Orders</div>
								<div class="text-xl font-bold">{totalOrders}</div>
							</div>
							<div>
								<div class="text-xs text-muted-foreground">Total Spent</div>
								<div class="text-xl font-bold text-primary">{formatCurrency(totalSpent)}</div>
							</div>
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Order History with pagination -->
			<Card.Root class="md:col-span-2">
				<Card.Header>
					<Card.Title>Order History</Card.Title>
					<Card.Description>
						Showing {customerOrders.length} of {pagination.totalOrders} orders
					</Card.Description>
				</Card.Header>
				<Card.Content class="p-0">
					<Table.Root>
						<Table.Header>
							<Table.Row>
								<Table.Head>Order ID</Table.Head>
								<Table.Head>Date</Table.Head>
								<Table.Head>Payment</Table.Head>
								<Table.Head>Status</Table.Head>
								<Table.Head>Amount</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each customerOrders as order}
								<Table.Row
									class="cursor-pointer transition-colors hover:bg-muted/50"
									onclick={() => goto(`/orders/${order.id}`)}
								>
									<Table.Cell class="font-mono text-xs">
										#{order.id.substring(0, 8).toUpperCase()}
									</Table.Cell>
									<Table.Cell>{formatDateTime(order.createdAt)}</Table.Cell>
									<Table.Cell class="capitalize">{order.paymentMethod}</Table.Cell>
									<Table.Cell>
										<Badge variant={order.status === 'completed' ? 'secondary' : 'destructive'}>
											{order.status}
										</Badge>
									</Table.Cell>
									<Table.Cell class="font-bold">{formatCurrency(order.totalAmount)}</Table.Cell>
								</Table.Row>
							{/each}
							{#if customerOrders.length === 0}
								<Table.Row>
									<Table.Cell colspan={5} class="h-32 text-center text-muted-foreground italic">
										No purchase history found.
									</Table.Cell>
								</Table.Row>
							{/if}
						</Table.Body>
					</Table.Root>
				</Card.Content>
				<!-- Pagination -->
				{#if pagination.totalPages > 1}
					<Card.Footer class="flex items-center justify-between">
						<p class="text-sm text-muted-foreground">
							Page {pagination.currentPage} of {pagination.totalPages}
						</p>
						<div class="flex items-center gap-2">
							<Button
								variant="outline"
								size="icon"
								disabled={pagination.currentPage <= 1}
								onclick={() => goToPage(pagination.currentPage - 1)}
								class="cursor-pointer"
							>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<Button
								variant="outline"
								size="icon"
								disabled={pagination.currentPage >= pagination.totalPages}
								onclick={() => goToPage(pagination.currentPage + 1)}
								class="cursor-pointer"
							>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</Card.Footer>
				{/if}
			</Card.Root>
		</div>
	{:else}
		<div class="flex items-center justify-center p-12">
			<Skeleton class="h-64 w-full" />
		</div>
	{/if}
</div>

<!-- Edit Customer Dialog -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Edit Customer</Dialog.Title>
		</Dialog.Header>
		<form method="POST" action="?/edit" use:enhance class="space-y-4">
			<div class="space-y-2">
				<Label for="edit-name">Full Name</Label>
				<Input id="edit-name" name="name" value={customer?.name ?? ''} required />
			</div>
			<div class="space-y-2">
				<Label for="edit-phone">Phone</Label>
				<Input id="edit-phone" name="phone" value={customer?.phone ?? ''} />
			</div>
			<div class="space-y-2">
				<Label for="edit-email">Email</Label>
				<Input id="edit-email" name="email" type="email" value={customer?.email ?? ''} />
			</div>
			<Button
				type="button"
				class="w-full cursor-pointer"
				onclick={async (e) => {
					const formElement = e.currentTarget.closest('form');
					if (
						await confirmState.confirm({
							title: 'Update Customer',
							message: 'Are you sure you want to save these changes to the customer profile?',
							confirmText: 'Save Changes',
							variant: 'default'
						})
					) {
						formElement?.requestSubmit();
					}
				}}
			>
				Save Changes
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
