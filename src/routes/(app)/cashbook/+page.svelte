<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Select from '$lib/components/ui/select';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Plus,
		Search,
		Calendar,
		ArrowUpCircle,
		ArrowDownCircle,
		Wallet,
		Loader2,
		ChevronLeft,
		ChevronRight,
		List,
		X
	} from '@lucide/svelte';
	import { formatBDT, formatDateTime, formatDate } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { cn } from '$lib/utils';
	import { createDebounced } from '$lib/debounce.svelte';
	import { fly, fade } from 'svelte/transition';

	let { data, form } = $props();
	let loading = $state(false);
	let selectedDate = $state('');

	$effect(() => {
		selectedDate = data.date;
	});

	function handleDateChange() {
		goto(`?date=${selectedDate}`);
	}

	function navigateDay(offset: number) {
		const d = new Date(selectedDate);
		d.setDate(d.getDate() + offset);
		goto(`?date=${d.toISOString().split('T')[0]}`);
	}

	function goToToday() {
		goto(`?date=${new Date().toISOString().split('T')[0]}`);
	}

	const isToday = $derived(selectedDate === new Date().toISOString().split('T')[0]);
	const isAllView = $derived(data.view === 'all');

	let txTypeFilter = $state('all');
	let txSearchInput = $state('');

	$effect(() => {
		txTypeFilter = data.txType;
		txSearchInput = data.txSearch;
	});

	const debouncedTxSearch = createDebounced(() => txSearchInput);

	$effect(() => {
		const q = debouncedTxSearch.value;
		if (!isAllView) return;
		const current = data.txSearch;
		if (q === current) return;
		goto(buildTxUrl({ txPage: 1, txSearch: q }));
	});

	function buildTxUrl(overrides: Record<string, string | number> = {}) {
		const params = new URLSearchParams();
		params.set('view', 'all');
		const txPage = overrides.txPage ?? data.txPage;
		const txType = overrides.txType ?? txTypeFilter;
		const txSearch = overrides.txSearch ?? txSearchInput;
		if (txPage !== 1) params.set('txPage', String(txPage));
		if (txType !== 'all') params.set('txType', String(txType));
		if (txSearch) params.set('txSearch', String(txSearch));
		return `/cashbook?${params.toString()}`;
	}

	function applyTxFilters() {
		goto(buildTxUrl({ txPage: 1 }));
	}

	$effect(() => {
		if (form?.success) {
			toast.success('Expense added successfully');
		}
		if (form?.error) {
			toast.error(form.error);
		}
	});
</script>

<svelte:head>
	<title>Cashbook — Clothing POS</title>
</svelte:head>

<div class="space-y-6 p-3 sm:p-6">
	<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
		<div>
			<h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Cashbook</h1>
			<p class="text-sm text-muted-foreground sm:text-base">Track income and expenses.</p>
		</div>
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center">
			{#if !isAllView}
				<div class="flex items-center gap-2">
					<Button
						variant="outline"
						size="icon"
						class="h-9 w-9 cursor-pointer"
						onclick={() => navigateDay(-1)}
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<Label for="date-filter" class="sr-only">Date</Label>
					<div class="relative flex-1 sm:flex-none">
						<Calendar
							class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="date-filter"
							type="date"
							class="h-9 w-full cursor-pointer pl-10 sm:w-44"
							bind:value={selectedDate}
							onchange={handleDateChange}
						/>
					</div>
					<Button
						variant="outline"
						size="icon"
						class="h-9 w-9 cursor-pointer"
						onclick={() => navigateDay(1)}
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
					{#if !isToday}
						<Button variant="secondary" size="sm" class="h-9 cursor-pointer" onclick={goToToday}>
							Today
						</Button>
					{/if}
				</div>
			{/if}
			<!-- View Toggle -->
			<div class="flex items-center self-start rounded-lg border bg-muted p-1 sm:self-auto">
				<Button
					variant={!isAllView ? 'default' : 'ghost'}
					size="sm"
					class="h-7 flex-1 cursor-pointer text-xs sm:flex-none"
					onclick={() => goto(`/cashbook?date=${selectedDate}`)}
				>
					<Calendar class="mr-1 h-3.5 w-3.5" /> Daily
				</Button>
				<Button
					variant={isAllView ? 'default' : 'ghost'}
					size="sm"
					class="h-7 flex-1 cursor-pointer text-xs sm:flex-none"
					onclick={() => goto('/cashbook?view=all')}
				>
					<List class="mr-1 h-3.5 w-3.5" /> All Transactions
				</Button>
			</div>
		</div>
	</div>

	<div class="grid min-h-[400px] grid-cols-1 grid-rows-1 overflow-hidden">
		{#key isAllView}
			<div
				in:fly={{ x: 100, duration: 400 }}
				out:fly={{ x: -100, duration: 400 }}
				class="col-start-1 row-start-1 w-full space-y-6"
			>
				{#if !isAllView}
					<!-- Daily View -->
					<div class="space-y-6">
						<!-- Summary Totals -->
						<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
							<Card.Root class="border-l-4 border-l-emerald-500">
								<Card.Header class="flex flex-row items-center justify-between pb-2">
									<Card.Title class="text-sm font-medium">Cash In</Card.Title>
									<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
										<ArrowUpCircle class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
									</div>
								</Card.Header>
								<Card.Content>
									<div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
										{formatBDT(data.summary.totalIn)}
									</div>
								</Card.Content>
							</Card.Root>

							<Card.Root class="border-l-4 border-l-red-500">
								<Card.Header class="flex flex-row items-center justify-between pb-2">
									<Card.Title class="text-sm font-medium">Cash Out</Card.Title>
									<div class="rounded-full bg-red-100 p-2 dark:bg-red-500/20">
										<ArrowDownCircle class="h-4 w-4 text-red-600 dark:text-red-400" />
									</div>
								</Card.Header>
								<Card.Content>
									<div class="text-2xl font-bold text-red-600 dark:text-red-400">
										{formatBDT(data.summary.totalOut)}
									</div>
								</Card.Content>
							</Card.Root>

							<Card.Root class="border-l-4 border-l-blue-500">
								<Card.Header class="flex flex-row items-center justify-between pb-2">
									<Card.Title class="text-sm font-medium">Net Cash</Card.Title>
									<div class="rounded-full bg-blue-100 p-2 dark:bg-blue-500/20">
										<Wallet class="h-4 w-4 text-blue-600 dark:text-blue-400" />
									</div>
								</Card.Header>
								<Card.Content>
									<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
										{formatBDT(data.summary.net)}
									</div>
								</Card.Content>
							</Card.Root>
						</div>

						<div class="grid gap-6 lg:grid-cols-3">
							<!-- Add Expense Form -->
							<Card.Root class="lg:col-span-1">
								<Card.Header>
									<Card.Title>Add Expense</Card.Title>
									<Card.Description>Record a new cash outflow.</Card.Description>
								</Card.Header>
								<Card.Content>
									<form
										method="POST"
										action="?/addExpense"
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
											<Label for="description">Description</Label>
											<Autocomplete
												id="description"
												name="description"
												placeholder="e.g. Electricity bill, Tea"
												required
												suggestions={data.expenseDescriptions}
											/>
										</div>
										<div class="space-y-2">
											<Label for="amount">Amount (৳)</Label>
											<Input
												id="amount"
												name="amount"
												type="number"
												step="0.01"
												placeholder="0.00"
												required
											/>
										</div>
										<Button type="submit" class="w-full cursor-pointer" disabled={loading}>
											{#if loading}
												<Loader2 class="mr-2 h-4 w-4 animate-spin" />
											{/if}
											Record Expense
										</Button>
									</form>
								</Card.Content>
							</Card.Root>

							<!-- Entries Table -->
							<Card.Root class="min-w-0 lg:col-span-2">
								<Card.Header>
									<Card.Title>Entries</Card.Title>
									<Card.Description>Transactions for {formatDate(data.date)}</Card.Description>
								</Card.Header>
								<Card.Content class="p-0">
									<Table.Root class="min-w-[600px]">
										<Table.Header>
											<Table.Row>
												<Table.Head>Time</Table.Head>
												<Table.Head>Description</Table.Head>
												<Table.Head>By</Table.Head>
												<Table.Head>Type</Table.Head>
												<Table.Head class="text-right">Amount</Table.Head>
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each data.entries as entry}
												<Table.Row>
													<Table.Cell class="text-xs">{formatDateTime(entry.createdAt)}</Table.Cell>
													<Table.Cell class="font-medium">{entry.description}</Table.Cell>
													<Table.Cell class="text-xs text-muted-foreground"
														>{entry.userName}</Table.Cell
													>
													<Table.Cell>
														<Badge
															variant={entry.type === 'in' ? 'secondary' : 'destructive'}
															class="capitalize"
														>
															{entry.type}
														</Badge>
													</Table.Cell>
													<Table.Cell
														class={cn(
															'text-right font-bold',
															entry.type === 'in' ? 'text-emerald-500' : 'text-destructive'
														)}
													>
														{entry.type === 'in' ? '+' : '-'}{formatBDT(entry.amount)}
													</Table.Cell>
												</Table.Row>
											{/each}
											{#if data.entries.length === 0}
												<Table.Row>
													<Table.Cell
														colspan={5}
														class="h-32 text-center text-muted-foreground italic"
													>
														No entries for this date.
													</Table.Cell>
												</Table.Row>
											{/if}
										</Table.Body>
									</Table.Root>
								</Card.Content>
							</Card.Root>
						</div>
					</div>
				{:else}
					<!-- All Transactions View -->
					<Card.Root class="min-w-0">
						<Card.Header>
							<Card.Title>All Transactions</Card.Title>
							<Card.Description>Browse and filter all cashbook entries.</Card.Description>
						</Card.Header>
						<Card.Content class="p-0">
							<!-- Filter Bar -->
							<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="relative w-full sm:max-w-sm">
									<Search
										class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										id="tx-search"
										type="text"
										placeholder="Search descriptions..."
										class="h-9 pr-9 pl-10"
										bind:value={txSearchInput}
									/>
									{#if txSearchInput}
										<button
											onclick={() => (txSearchInput = '')}
											class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
											title="Clear search"
										>
											<X class="h-4 w-4" />
										</button>
									{/if}
								</div>

								<div class="flex items-center gap-2">
									<span class="text-xs whitespace-nowrap text-muted-foreground">Filter by:</span>
									<Select.Root
										type="single"
										bind:value={txTypeFilter}
										onValueChange={() => applyTxFilters()}
									>
										<Select.Trigger class="h-9 w-full sm:w-[160px]">
											{txTypeFilter === 'in'
												? 'Cash In'
												: txTypeFilter === 'out'
													? 'Cash Out'
													: 'All Types'}
										</Select.Trigger>
										<Select.Content>
											<Select.Item value="all" class="cursor-pointer">All Types</Select.Item>
											<Select.Item value="in" class="cursor-pointer">Cash In</Select.Item>
											<Select.Item value="out" class="cursor-pointer">Cash Out</Select.Item>
										</Select.Content>
									</Select.Root>
								</div>
							</div>

							<!-- Transaction Table -->
							<Table.Root class="min-w-[800px]">
								<Table.Header>
									<Table.Row>
										<Table.Head>Date/Time</Table.Head>
										<Table.Head>Description</Table.Head>
										<Table.Head>Type</Table.Head>
										<Table.Head>By</Table.Head>
										<Table.Head class="text-right">Amount</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each data.transactions as tx}
										<Table.Row>
											<Table.Cell class="text-xs whitespace-nowrap"
												>{formatDateTime(tx.createdAt)}</Table.Cell
											>
											<Table.Cell class="font-medium">{tx.description}</Table.Cell>
											<Table.Cell>
												<Badge
													variant={tx.type === 'in' ? 'secondary' : 'destructive'}
													class="capitalize"
												>
													{tx.type === 'in' ? 'Cash In' : 'Cash Out'}
												</Badge>
											</Table.Cell>
											<Table.Cell class="text-xs text-muted-foreground">{tx.userName}</Table.Cell>
											<Table.Cell
												class={cn(
													'text-right font-bold',
													tx.type === 'in' ? 'text-emerald-500' : 'text-destructive'
												)}
											>
												{tx.type === 'in' ? '+' : '-'}{formatBDT(tx.amount)}
											</Table.Cell>
										</Table.Row>
									{/each}
									{#if data.transactions.length === 0}
										<Table.Row>
											<Table.Cell colspan={5} class="h-32 text-center text-muted-foreground italic">
												No transactions found.
											</Table.Cell>
										</Table.Row>
									{/if}
								</Table.Body>
							</Table.Root>

							<!-- Pagination -->
							{#if data.txTotalPages > 1}
								<div
									class="flex flex-col items-center justify-between gap-4 border-t p-4 sm:flex-row"
								>
									<p class="text-xs text-muted-foreground sm:text-sm">
										Showing {data.transactions.length} entries of {data.txTotalEntries || 'total'}
									</p>
									<div class="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
										<Button
											variant="outline"
											size="icon"
											disabled={data.txPage <= 1}
											onclick={() => goto(buildTxUrl({ txPage: data.txPage - 1 }))}
											class="h-8 w-8 cursor-pointer"
										>
											<ChevronLeft class="h-4 w-4" />
										</Button>

										{#each Array.from({ length: Math.min(data.txTotalPages, 5) }, (_, i) => {
											let start = Math.max(1, data.txPage - 2);
											if (start + 4 > data.txTotalPages) {
												start = Math.max(1, data.txPage - 4);
											}
											return start + i;
										}).filter((p) => p > 0 && p <= data.txTotalPages) as pageNum}
											<Button
												variant={pageNum === data.txPage ? 'default' : 'outline'}
												size="icon"
												onclick={() => goto(buildTxUrl({ txPage: pageNum }))}
												class="h-8 w-8 cursor-pointer"
											>
												{pageNum}
											</Button>
										{/each}

										<Button
											variant="outline"
											size="icon"
											disabled={data.txPage >= data.txTotalPages}
											onclick={() => goto(buildTxUrl({ txPage: data.txPage + 1 }))}
											class="h-8 w-8 cursor-pointer"
										>
											<ChevronRight class="h-4 w-4" />
										</Button>
									</div>
								</div>
							{/if}
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		{/key}
	</div>
</div>
