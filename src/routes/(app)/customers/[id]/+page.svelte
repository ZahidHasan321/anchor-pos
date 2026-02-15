<script lang="ts">
	import { enhance } from '$app/forms';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { ArrowLeft, Phone, Mail, ChevronLeft, ChevronRight, Pencil } from '@lucide/svelte';
	import { formatBDT, formatDateTime } from '$lib/format';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();
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
		goto(`?page=${page}`);
	}
</script>

<svelte:head>
	<title>{data.customer.name} — Customers — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-4">
			<Button variant="outline" size="icon" href="/customers" class="cursor-pointer">
				<ArrowLeft class="h-4 w-4" />
			</Button>
			<div>
				<h1 class="text-3xl font-bold tracking-tight">{data.customer.name}</h1>
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
						<div class="font-medium">{data.customer.phone ?? 'Not provided'}</div>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="rounded-full bg-primary/10 p-2">
						<Mail class="h-4 w-4 text-primary" />
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Email</div>
						<div class="font-medium">{data.customer.email ?? 'Not provided'}</div>
					</div>
				</div>
				<div class="border-t pt-4">
					<div class="grid grid-cols-2 gap-4">
						<div>
							<div class="text-xs text-muted-foreground">Completed Orders</div>
							<div class="text-xl font-bold">{data.totalOrders}</div>
						</div>
						<div>
							<div class="text-xs text-muted-foreground">Total Spent</div>
							<div class="text-xl font-bold text-primary">{formatBDT(data.totalSpent)}</div>
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
					Showing {data.orders.length} of {data.pagination.totalOrders} orders
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
						{#each data.orders as order}
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
								<Table.Cell class="font-bold">{formatBDT(order.totalAmount)}</Table.Cell>
							</Table.Row>
						{/each}
						{#if data.orders.length === 0}
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
			{#if data.pagination.totalPages > 1}
				<Card.Footer class="flex items-center justify-between">
					<p class="text-sm text-muted-foreground">
						Page {data.pagination.currentPage} of {data.pagination.totalPages}
					</p>
					<div class="flex items-center gap-2">
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage <= 1}
							onclick={() => goToPage(data.pagination.currentPage - 1)}
							class="cursor-pointer"
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage >= data.pagination.totalPages}
							onclick={() => goToPage(data.pagination.currentPage + 1)}
							class="cursor-pointer"
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				</Card.Footer>
			{/if}
		</Card.Root>
	</div>
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
				<Input id="edit-name" name="name" value={data.customer.name} required />
			</div>
			<div class="space-y-2">
				<Label for="edit-phone">Phone</Label>
				<Input id="edit-phone" name="phone" value={data.customer.phone ?? ''} />
			</div>
			<div class="space-y-2">
				<Label for="edit-email">Email</Label>
				<Input id="edit-email" name="email" type="email" value={data.customer.email ?? ''} />
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
