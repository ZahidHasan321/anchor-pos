<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Search,
		Plus,
		Phone,
		Mail,
		Trash,
		X,
		Loader2,
		ChevronLeft,
		ChevronRight,
		Users
	} from '@lucide/svelte';
	import { formatBDT, formatDateTime } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { createDebounced } from '$lib/debounce.svelte';
	import { confirmState } from '$lib/confirm.svelte';

	let { data, form } = $props();
	let searchQuery = $state('');
	let createDialogOpen = $state(false);
	let loading = $state(false);

	$effect(() => {
		searchQuery = data.filters.search;
	});

	const debouncedSearch = createDebounced(() => searchQuery);

	$effect(() => {
		const q = debouncedSearch.value;
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('q') ?? '';
		if (q === current) return;
		if (q) params.set('q', q);
		else params.delete('q');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	});

	function goToPage(pageNum: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', pageNum.toString());
		goto(`?${params.toString()}`);
	}

	$effect(() => {
		if (form?.success) {
			toast.success('Action successful');
			createDialogOpen = false;
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});
</script>

<svelte:head>
	<title>Customers — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-3 pb-24 sm:p-6 md:pb-6">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Customers</h1>
			<p class="text-sm text-muted-foreground sm:text-base">
				Manage your customer database and purchase history.
			</p>
		</div>
		<Button onclick={() => (createDialogOpen = true)} class="hidden cursor-pointer md:flex">
			<Plus class="mr-2 h-4 w-4" /> Add Customer
		</Button>
	</div>

	<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
		<div class="relative w-full max-w-sm">
			<Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				placeholder="Search customers by name or phone..."
				class="pr-9 pl-10"
				bind:value={searchQuery}
			/>
			{#if searchQuery}
				<button
					onclick={() => (searchQuery = '')}
					class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
					title="Clear search"
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<Users class="h-4 w-4" />
			<span>{data.pagination.total} customers</span>
		</div>
	</div>

	<Card.Root>
		<Card.Content class="p-0">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>Name</Table.Head>
						<Table.Head>Contact</Table.Head>
						<Table.Head class="text-center">Orders</Table.Head>
						<Table.Head class="text-right">Total Spent</Table.Head>
						<Table.Head>Last Order</Table.Head>
						{#if data.user?.role === 'admin'}
							<Table.Head class="w-12"></Table.Head>
						{/if}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.customers as customer}
						<Table.Row
							class="cursor-pointer transition-colors hover:bg-muted/50"
							onclick={(e) => {
								if ((e.target as HTMLElement).closest('button, form')) return;
								goto(`/customers/${customer.id}`);
							}}
						>
							<Table.Cell>
								<div class="font-bold">{customer.name}</div>
								<div class="font-mono text-xs text-muted-foreground">
									{customer.id.substring(0, 8)}
								</div>
							</Table.Cell>
							<Table.Cell>
								<div class="flex flex-col gap-1">
									{#if customer.phone}
										<div class="flex items-center gap-2 text-xs">
											<Phone class="h-3 w-3 text-muted-foreground" />
											{customer.phone}
										</div>
									{/if}
									{#if customer.email}
										<div class="flex items-center gap-2 text-xs">
											<Mail class="h-3 w-3 text-muted-foreground" />
											{customer.email}
										</div>
									{/if}
									{#if !customer.phone && !customer.email}
										<span class="text-xs text-muted-foreground italic">No contact info</span>
									{/if}
								</div>
							</Table.Cell>
							<Table.Cell class="text-center font-medium">{customer.orderCount}</Table.Cell>
							<Table.Cell class="text-right font-black text-primary"
								>{formatBDT(customer.totalSpent)}</Table.Cell
							>
							<Table.Cell class="text-sm text-muted-foreground">
								{#if customer.lastOrderDate}
									{formatDateTime(new Date(Number(customer.lastOrderDate) * 1000))}
								{:else}
									<span class="italic">Never</span>
								{/if}
							</Table.Cell>
							{#if data.user?.role === 'admin'}
								<Table.Cell>
									<form method="POST" action="?/delete" use:enhance>
										<input type="hidden" name="id" value={customer.id} />
										<Button
											variant="ghost"
											size="icon"
											type="button"
											class="cursor-pointer text-destructive"
											onclick={async (e) => {
												const formElement = e.currentTarget.closest('form');
												if (
													await confirmState.confirm(
														'Are you sure? This will delete the customer record.'
													)
												) {
													formElement?.requestSubmit();
												}
											}}
										>
											<Trash class="h-4 w-4" />
										</Button>
									</form>
								</Table.Cell>
							{/if}
						</Table.Row>
					{/each}
					{#if data.customers.length === 0}
						<Table.Row>
							<Table.Cell colspan={6} class="h-48 text-center text-muted-foreground italic">
								No customers found.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</Card.Content>
		<Card.Footer class="border-t p-4">
			<div class="flex w-full flex-col items-center justify-between gap-4 sm:flex-row">
				<p class="text-sm text-muted-foreground">
					Showing {data.customers.length} of {data.pagination.total} customers
				</p>

				{#if data.pagination.totalPages > 1}
					<div class="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage <= 1}
							onclick={() => goToPage(data.pagination.currentPage - 1)}
							class="h-8 w-8 cursor-pointer"
						>
							<ChevronLeft class="h-4 w-4" />
						</Button>
						{#each Array.from({ length: Math.min(data.pagination.totalPages, 5) }, (_, i) => {
							let start = Math.max(1, data.pagination.currentPage - 2);
							if (start + 4 > data.pagination.totalPages) {
								start = Math.max(1, data.pagination.totalPages - 4);
							}
							const pageNum = start + i;
							return pageNum > 0 && pageNum <= data.pagination.totalPages ? pageNum : null;
						}).filter((p) => p !== null) as pageNum}
							<Button
								variant={pageNum === data.pagination.currentPage ? 'default' : 'outline'}
								size="icon"
								onclick={() => goToPage(pageNum!)}
								class="h-8 w-8 cursor-pointer"
							>
								{pageNum}
							</Button>
						{/each}
						<Button
							variant="outline"
							size="icon"
							disabled={data.pagination.currentPage >= data.pagination.totalPages}
							onclick={() => goToPage(data.pagination.currentPage + 1)}
							class="h-8 w-8 cursor-pointer"
						>
							<ChevronRight class="h-4 w-4" />
						</Button>
					</div>
				{/if}
			</div>
		</Card.Footer>
	</Card.Root>
</div>

<Dialog.Root bind:open={createDialogOpen}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add New Customer</Dialog.Title>
			<Dialog.Description>Create a new profile in your database.</Dialog.Description>
		</Dialog.Header>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => {
				loading = true;
				return async ({ update }) => {
					loading = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			<div class="space-y-2">
				<Label for="name">Full Name</Label>
				<Input id="name" name="name" placeholder="John Doe" required />
			</div>
			<div class="space-y-2">
				<Label for="phone">Phone Number</Label>
				<Input id="phone" name="phone" placeholder="017XXXXXXXX" />
			</div>
			<div class="space-y-2">
				<Label for="email">Email Address</Label>
				<Input id="email" name="email" type="email" placeholder="john@example.com" />
			</div>
			<Button type="submit" class="w-full cursor-pointer" disabled={loading}>
				{#if loading}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				Create Customer
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>

<!-- Mobile FAB -->
<div class="fixed right-4 bottom-20 z-40 md:hidden">
	<Button
		onclick={() => (createDialogOpen = true)}
		size="icon"
		class="h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-2xl shadow-primary/40 transition-all hover:scale-110 active:scale-95"
	>
		<Plus class="h-7 w-7" />
	</Button>
</div>
