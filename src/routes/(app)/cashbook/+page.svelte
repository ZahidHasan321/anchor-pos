<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DateInput } from '$lib/components/ui/date-input';
	import { Autocomplete } from '$lib/components/ui/autocomplete';
	import { Label } from '$lib/components/ui/label';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
	import { formatCurrency, getCurrencySymbol, formatDateTime, formatDate } from '$lib/format';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { cn } from '$lib/utils';
	import { createDebounced } from '$lib/debounce.svelte';
	import { fly, fade } from 'svelte/transition';
	import { powersync } from '$lib/powersync';
	import { browser } from '$app/environment';

	let { data, form } = $props();

	const isNative = $derived(browser && !!(window as any).electron);

	// Electron: client-side PowerSync data
	let nativeDailyData = $state<any>(null);
	let nativeExpenseDescriptions = $state<string[]>([]);
	let nativeTransactionsData = $state<any>(null);

	async function loadNativeData() {
		if (!browser || !(window as any).electron || !powersync.ready) return;

		const dateStart = data.dateRangeStart;
		const dateEnd = data.dateRangeEnd;

		// Daily data
		Promise.all([
			powersync.db.getAll(`
				SELECT c.id, c.amount, c.type, c.description, c.created_at as createdAt, u.name as userName
				FROM cashbook c LEFT JOIN users u ON c.user_id = u.id
				WHERE c.created_at >= ? AND c.created_at < ?
				ORDER BY c.created_at DESC
			`, [dateStart, dateEnd]),
			powersync.db.getAll(`
				SELECT type, sum(amount) as total FROM cashbook
				WHERE created_at >= ? AND created_at < ? GROUP BY type
			`, [dateStart, dateEnd])
		]).then(([entries, totals]) => {
			const totalIn = (totals as any[]).find(t => t.type === 'in')?.total || 0;
			const totalOut = (totals as any[]).find(t => t.type === 'out')?.total || 0;
			nativeDailyData = { entries, summary: { totalIn, totalOut, net: totalIn - totalOut } };
		});

		// Expense descriptions
		powersync.db.getAll("SELECT DISTINCT description FROM cashbook WHERE type = 'out'")
			.then(rows => nativeExpenseDescriptions = (rows as any[]).map(r => r.description));

		// Transactions (if view is 'all')
		if (data.view === 'all') {
			const txPage = parseInt(new URLSearchParams(window.location.search).get('txPage') || '1');
			const txType = new URLSearchParams(window.location.search).get('txType') || 'all';
			const txSearch = new URLSearchParams(window.location.search).get('txSearch') || '';
			const txLimit = 50;
			const txOffset = (txPage - 1) * txLimit;
			let where = 'WHERE 1=1';
			const params: any[] = [];
			if (txType === 'in' || txType === 'out') { where += ' AND type = ?'; params.push(txType); }
			if (txSearch) { where += ' AND description LIKE ?'; params.push(`%${txSearch}%`); }

			Promise.all([
				powersync.db.get(`SELECT count(*) as count FROM cashbook ${where}`, params),
				powersync.db.getAll(`
					SELECT id, amount, type, description, created_at as createdAt,
						COALESCE((SELECT name FROM users WHERE id = user_id), 'System') as userName
					FROM cashbook ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
				`, [...params, txLimit, txOffset])
			]).then(([countRes, txRes]) => {
				const totalEntries = (countRes as any)?.count ?? 0;
				nativeTransactionsData = {
					transactions: txRes,
					txPage, txTotalPages: Math.max(1, Math.ceil(totalEntries / txLimit)),
					txTotalEntries: totalEntries, txType, txSearch
				};
			});
		}
	}

	$effect(() => {
		if (!isNative || !powersync.ready) return;
		loadNativeData();
	});

	async function handleNativeAddExpense(description: string, amount: number) {
		if (!data.user) return;
		await powersync.db.execute(`
			INSERT INTO cashbook (id, amount, type, description, user_id, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
		`, [crypto.randomUUID(), amount, 'out', description, data.user.id, new Date().toISOString()]);
		// Reload data
		loadNativeData();
	}
	let loading = $state(false);
	let selectedDate = $state('');

	$effect(() => {
		selectedDate = data.date;
	});

	function handleDateChange() {
		goto(`?date=${selectedDate}`);
	}

	function navigateDay(offset: number) {
		if (!selectedDate) return;
		const [y, m, d] = selectedDate.split('-').map(Number);
		const date = new Date(Date.UTC(y, m - 1, d + offset));
		goto(`?date=${date.toISOString().split('T')[0]}`);
	}

	function goToToday() {
		goto('/cashbook');
	}

	const isToday = $derived(selectedDate === data.date && !page.url.searchParams.has('date'));
	const isAllView = $derived(data.view === 'all');

	let txTypeFilter = $state('all');
	let txSearchInput = $state('');

	$effect(() => {
		if (isNative) {
			if (nativeTransactionsData) {
				txTypeFilter = nativeTransactionsData.txType;
				txSearchInput = nativeTransactionsData.txSearch;
			}
		} else {
			data.transactionsData.then((td) => {
				if (td) {
					txTypeFilter = td.txType;
					txSearchInput = td.txSearch;
				}
			});
		}
	});

	const debouncedTxSearch = createDebounced(() => txSearchInput);

	$effect(() => {
		const q = debouncedTxSearch.value;
		if (!isAllView) return;
		const current = page.url.searchParams.get('txSearch') || '';
		if (q === current) return;
		goto(buildTxUrl({ txPage: 1, txSearch: q }), { noScroll: true, keepFocus: true });
	});

	function buildTxUrl(overrides: Record<string, string | number> = {}) {
		const params = new URLSearchParams();
		params.set('view', 'all');
		const txPage = overrides.txPage ?? (page.url.searchParams.get('txPage') || 1);
		const txType = overrides.txType ?? txTypeFilter;
		const txSearch = overrides.txSearch ?? txSearchInput;
		if (txPage !== 1) params.set('txPage', String(txPage));
		if (txType !== 'all') params.set('txType', String(txType));
		if (txSearch) params.set('txSearch', String(txSearch));
		return `/cashbook?${params.toString()}`;
	}

	function applyTxFilters() {
		goto(buildTxUrl({ txPage: 1 }), { noScroll: true, keepFocus: true });
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
					<div class="flex-1 sm:flex-none">
						<DateInput
							id="date-filter"
							class="h-9 w-full sm:w-52"
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
					<div class="space-y-6">
						<!-- Summary Cards -->
						<div class="grid grid-cols-2 gap-3 md:grid-cols-3">
							{#if isNative}
								{#if nativeDailyData === null}
									{#each Array(3) as _}
										<Card.Root class="space-y-2 p-4"
											><Skeleton class="h-4 w-20" /><Skeleton class="h-8 w-full" /></Card.Root
										>
									{/each}
								{:else}
									<Card.Root class="border-l-4 border-l-emerald-500">
										<Card.Header class="flex flex-row items-center justify-between pb-2">
											<Card.Title class="text-sm font-medium">Cash In</Card.Title>
											<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
												<ArrowUpCircle class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
											</div>
										</Card.Header>
										<Card.Content>
											<div
												class="text-2xl font-bold break-all text-emerald-600 dark:text-emerald-400"
											>
												{formatCurrency(nativeDailyData.summary.totalIn)}
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
											<div class="text-2xl font-bold break-all text-red-600 dark:text-red-400">
												{formatCurrency(nativeDailyData.summary.totalOut)}
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
											<div class="text-2xl font-bold break-all text-blue-600 dark:text-blue-400">
												{formatCurrency(nativeDailyData.summary.net)}
											</div>
										</Card.Content>
									</Card.Root>
								{/if}
							{:else}
								{#await data.dailyData}
									{#each Array(3) as _}
										<Card.Root class="space-y-2 p-4"
											><Skeleton class="h-4 w-20" /><Skeleton class="h-8 w-full" /></Card.Root
										>
									{/each}
								{:then daily}
									<Card.Root class="border-l-4 border-l-emerald-500">
										<Card.Header class="flex flex-row items-center justify-between pb-2">
											<Card.Title class="text-sm font-medium">Cash In</Card.Title>
											<div class="rounded-full bg-emerald-100 p-2 dark:bg-emerald-500/20">
												<ArrowUpCircle class="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
											</div>
										</Card.Header>
										<Card.Content>
											<div
												class="text-2xl font-bold break-all text-emerald-600 dark:text-emerald-400"
											>
												{formatCurrency(daily.summary.totalIn)}
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
											<div class="text-2xl font-bold break-all text-red-600 dark:text-red-400">
												{formatCurrency(daily.summary.totalOut)}
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
											<div class="text-2xl font-bold break-all text-blue-600 dark:text-blue-400">
												{formatCurrency(daily.summary.net)}
											</div>
										</Card.Content>
									</Card.Root>
								{/await}
							{/if}
						</div>

						<div class="grid gap-6 lg:grid-cols-3">
							<!-- Add Expense Form -->
							<Card.Root class="lg:col-span-1">
								<Card.Header>
									<Card.Title>Add Expense</Card.Title>
									<Card.Description>Record a new cash outflow.</Card.Description>
								</Card.Header>
								<Card.Content>
									{#if isNative}
										{@const descriptions = nativeExpenseDescriptions}
										<form
											class="space-y-4"
											onsubmit={(e) => {
												e.preventDefault();
												const fd = new FormData(e.currentTarget as HTMLFormElement);
												const desc = fd.get('description') as string;
												const amt = parseFloat(fd.get('amount') as string);
												if (desc && !isNaN(amt)) {
													loading = true;
													handleNativeAddExpense(desc, amt).finally(() => {
														loading = false;
														(e.currentTarget as HTMLFormElement).reset();
														toast.success('Expense added successfully');
													});
												}
											}}
										>
											<div class="space-y-2">
												<Label for="description">Description</Label>
												<Autocomplete
													id="description"
													name="description"
													placeholder="e.g. Tea"
													required
													suggestions={descriptions}
												/>
											</div>
											<div class="space-y-2">
												<Label for="amount">Amount ({getCurrencySymbol()})</Label>
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
												{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
												Record Expense
											</Button>
										</form>
									{:else}
										{#await data.expenseDescriptions}
											<div class="space-y-4">
												<Skeleton class="h-10 w-full" />
												<Skeleton class="h-10 w-full" />
												<Skeleton class="h-10 w-full" />
											</div>
										{:then descriptions}
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
														placeholder="e.g. Tea"
														required
														suggestions={descriptions}
													/>
												</div>
												<div class="space-y-2">
													<Label for="amount">Amount ({getCurrencySymbol()})</Label>
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
													{#if loading}<Loader2 class="mr-2 h-4 w-4 animate-spin" />{/if}
													Record Expense
												</Button>
											</form>
										{/await}
									{/if}
								</Card.Content>
							</Card.Root>

							<!-- Entries Table -->
							<Card.Root class="min-w-0 lg:col-span-2">
								<Card.Header>
									<Card.Title>Entries</Card.Title>
									<Card.Description>Transactions for {formatDate(data.date)}</Card.Description>
								</Card.Header>
								<Card.Content class="p-0">
									{#if isNative}
										{#if nativeDailyData === null}
											<div class="space-y-3 p-4">
												{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
											</div>
										{:else}
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
													{#each nativeDailyData.entries as entry}
														<Table.Row>
															<Table.Cell class="text-xs"
																>{formatDateTime(entry.createdAt)}</Table.Cell
															>
															<Table.Cell class="font-medium">{entry.description}</Table.Cell>
															<Table.Cell class="text-xs text-muted-foreground"
																>{entry.userName}</Table.Cell
															>
															<Table.Cell
																><Badge
																	variant={entry.type === 'in' ? 'secondary' : 'destructive'}
																	class="capitalize">{entry.type}</Badge
																></Table.Cell
															>
															<Table.Cell
																class={cn(
																	'text-right font-bold',
																	entry.type === 'in' ? 'text-emerald-500' : 'text-destructive'
																)}
															>
																{entry.type === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
															</Table.Cell>
														</Table.Row>
													{/each}
													{#if nativeDailyData.entries.length === 0}
														<Table.Row
															><Table.Cell
																colspan={5}
																class="h-32 text-center text-muted-foreground italic"
																>No entries for this date.</Table.Cell
															></Table.Row
														>
													{/if}
												</Table.Body>
											</Table.Root>
										{/if}
									{:else}
										{#await data.dailyData}
											<div class="space-y-3 p-4">
												{#each Array(5) as _}<Skeleton class="h-10 w-full" />{/each}
											</div>
										{:then daily}
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
													{#each daily.entries as entry}
														<Table.Row>
															<Table.Cell class="text-xs"
																>{formatDateTime(entry.createdAt)}</Table.Cell
															>
															<Table.Cell class="font-medium">{entry.description}</Table.Cell>
															<Table.Cell class="text-xs text-muted-foreground"
																>{entry.userName}</Table.Cell
															>
															<Table.Cell
																><Badge
																	variant={entry.type === 'in' ? 'secondary' : 'destructive'}
																	class="capitalize">{entry.type}</Badge
																></Table.Cell
															>
															<Table.Cell
																class={cn(
																	'text-right font-bold',
																	entry.type === 'in' ? 'text-emerald-500' : 'text-destructive'
																)}
															>
																{entry.type === 'in' ? '+' : '-'}{formatCurrency(entry.amount)}
															</Table.Cell>
														</Table.Row>
													{/each}
													{#if daily.entries.length === 0}
														<Table.Row
															><Table.Cell
																colspan={5}
																class="h-32 text-center text-muted-foreground italic"
																>No entries for this date.</Table.Cell
															></Table.Row
														>
													{/if}
												</Table.Body>
											</Table.Root>
										{/await}
									{/if}
								</Card.Content>
							</Card.Root>
						</div>
					</div>
				{:else}
					<!-- All Transactions View -->
					<Card.Root class="min-w-0">
						<Card.Header>
							<Card.Title>All Transactions</Card.Title>
							<Card.Description>Browse and filter all entries.</Card.Description>
						</Card.Header>
						<Card.Content class="p-0">
							<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
								<div class="relative w-full sm:max-w-sm">
									<Search
										class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
									/>
									<Input
										id="tx-search"
										type="text"
										placeholder="Search..."
										class="h-9 pr-9 pl-10"
										bind:value={txSearchInput}
									/>
									{#if txSearchInput}<button
											onclick={() => (txSearchInput = '')}
											class="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
											><X class="h-4 w-4" /></button
										>{/if}
								</div>
								<div class="flex items-center gap-2">
									<Select.Root
										type="single"
										bind:value={txTypeFilter}
										onValueChange={() => applyTxFilters()}
									>
										<Select.Trigger class="h-9 w-full sm:w-[160px]"
											>{txTypeFilter === 'in'
												? 'Cash In'
												: txTypeFilter === 'out'
													? 'Cash Out'
													: 'All Types'}</Select.Trigger
										>
										<Select.Content>
											<Select.Item value="all" class="cursor-pointer">All Types</Select.Item>
											<Select.Item value="in" class="cursor-pointer">Cash In</Select.Item>
											<Select.Item value="out" class="cursor-pointer">Cash Out</Select.Item>
										</Select.Content>
									</Select.Root>
								</div>
							</div>

							{#if isNative}
								{#if nativeTransactionsData === null}
									<div class="space-y-3 p-4">
										{#each Array(8) as _}<Skeleton class="h-12 w-full" />{/each}
									</div>
								{:else}
									{@const td = nativeTransactionsData}
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
											{#each td.transactions as tx}
												<Table.Row>
													<Table.Cell class="text-xs whitespace-nowrap"
														>{formatDateTime(tx.createdAt)}</Table.Cell
													>
													<Table.Cell class="font-medium">{tx.description}</Table.Cell>
													<Table.Cell
														><Badge
															variant={tx.type === 'in' ? 'secondary' : 'destructive'}
															class="capitalize">{tx.type === 'in' ? 'Cash In' : 'Cash Out'}</Badge
														></Table.Cell
													>
													<Table.Cell class="text-xs text-muted-foreground"
														>{tx.userName}</Table.Cell
													>
													<Table.Cell
														class={cn(
															'text-right font-bold',
															tx.type === 'in' ? 'text-emerald-500' : 'text-destructive'
														)}
													>
														{tx.type === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
													</Table.Cell>
												</Table.Row>
											{/each}
											{#if td.transactions.length === 0}
												<Table.Row
													><Table.Cell
														colspan={5}
														class="h-32 text-center text-muted-foreground italic"
														>No transactions found.</Table.Cell
													></Table.Row
												>
											{/if}
										</Table.Body>
									</Table.Root>

									{#if td.txTotalPages > 1}
										<div
											class="flex flex-col items-center justify-between gap-4 border-t p-4 sm:flex-row"
										>
											<p class="text-xs text-muted-foreground">
												Showing {td.transactions.length} of {td.txTotalEntries}
											</p>
											<div class="flex gap-1">
												<Button
													variant="outline"
													size="icon"
													disabled={td.txPage <= 1}
													onclick={() => { nativeTransactionsData = null; loadNativeData(); }}
													class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
												>
												<Button
													variant="outline"
													size="icon"
													disabled={td.txPage >= td.txTotalPages}
													onclick={() => { nativeTransactionsData = null; loadNativeData(); }}
													class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
												>
											</div>
										</div>
									{/if}
								{/if}
							{:else}
								{#await data.transactionsData}
									<div class="space-y-3 p-4">
										{#each Array(8) as _}<Skeleton class="h-12 w-full" />{/each}
									</div>
								{:then td}
									{#if td}
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
												{#each td.transactions as tx}
													<Table.Row>
														<Table.Cell class="text-xs whitespace-nowrap"
															>{formatDateTime(tx.createdAt)}</Table.Cell
														>
														<Table.Cell class="font-medium">{tx.description}</Table.Cell>
														<Table.Cell
															><Badge
																variant={tx.type === 'in' ? 'secondary' : 'destructive'}
																class="capitalize">{tx.type === 'in' ? 'Cash In' : 'Cash Out'}</Badge
															></Table.Cell
														>
														<Table.Cell class="text-xs text-muted-foreground"
															>{tx.userName}</Table.Cell
														>
														<Table.Cell
															class={cn(
																'text-right font-bold',
																tx.type === 'in' ? 'text-emerald-500' : 'text-destructive'
															)}
														>
															{tx.type === 'in' ? '+' : '-'}{formatCurrency(tx.amount)}
														</Table.Cell>
													</Table.Row>
												{/each}
												{#if td.transactions.length === 0}
													<Table.Row
														><Table.Cell
															colspan={5}
															class="h-32 text-center text-muted-foreground italic"
															>No transactions found.</Table.Cell
														></Table.Row
													>
												{/if}
											</Table.Body>
										</Table.Root>

										{#if td.txTotalPages > 1}
											<div
												class="flex flex-col items-center justify-between gap-4 border-t p-4 sm:flex-row"
											>
												<p class="text-xs text-muted-foreground">
													Showing {td.transactions.length} of {td.txTotalEntries}
												</p>
												<div class="flex gap-1">
													<Button
														variant="outline"
														size="icon"
														disabled={td.txPage <= 1}
														onclick={() =>
															goto(buildTxUrl({ txPage: td.txPage - 1 }), {
																noScroll: true,
																keepFocus: true
															})}
														class="h-8 w-8"><ChevronLeft class="h-4 w-4" /></Button
													>
													<Button
														variant="outline"
														size="icon"
														disabled={td.txPage >= td.txTotalPages}
														onclick={() =>
															goto(buildTxUrl({ txPage: td.txPage + 1 }), {
																noScroll: true,
																keepFocus: true
															})}
														class="h-8 w-8"><ChevronRight class="h-4 w-4" /></Button
													>
												</div>
											</div>
										{/if}
									{/if}
								{/await}
							{/if}
						</Card.Content>
					</Card.Root>
				{/if}
			</div>
		{/key}
	</div>
</div>
