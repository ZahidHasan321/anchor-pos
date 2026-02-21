<script lang="ts">
	import { DatePicker } from 'bits-ui';
	import { parseDate } from '@internationalized/date';
	import type { DateValue } from '@internationalized/date';
	import { globalSettings } from '$lib/settings.svelte';
	import { cn } from '$lib/utils';
	import { ChevronLeft, ChevronRight, CalendarIcon } from '@lucide/svelte';

	type Props = {
		value?: string;
		onchange?: (value: string) => void;
		class?: string;
		id?: string;
	};

	let { value = $bindable(''), onchange, class: className, id }: Props = $props();

	// Convert YYYY-MM-DD string to DateValue
	const dateValue = $derived.by(() => {
		if (!value) return undefined;
		try {
			return parseDate(value);
		} catch {
			return undefined;
		}
	});

	function handleValueChange(newValue: DateValue | undefined) {
		if (newValue) {
			const y = String(newValue.year).padStart(4, '0');
			const m = String(newValue.month).padStart(2, '0');
			const d = String(newValue.day).padStart(2, '0');
			const str = `${y}-${m}-${d}`;
			if (str === value) return;
			value = str;
			onchange?.(str);
		}
	}
</script>

<DatePicker.Root
	value={dateValue}
	onValueChange={handleValueChange}
	locale={globalSettings.locale}
	weekStartsOn={1}
	fixedWeeks={true}
	closeOnDateSelect={true}
>
	<DatePicker.Input
		{id}
		class={cn(
			'flex h-9 w-full min-w-0 items-center rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
			'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
			className
		)}
	>
		{#snippet children({ segments })}
			{#each segments as seg}
				<DatePicker.Segment
					part={seg.part}
					class="rounded-sm px-0.5 tabular-nums caret-transparent outline-none focus:bg-primary focus:text-primary-foreground data-[segment=literal]:px-0 data-[type=literal]:text-muted-foreground"
				>
					{seg.value}
				</DatePicker.Segment>
			{/each}
			<DatePicker.Trigger
				class="ml-auto inline-flex cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground"
			>
				<CalendarIcon class="h-4 w-4" />
			</DatePicker.Trigger>
		{/snippet}
	</DatePicker.Input>

	<DatePicker.Content
		class="z-50 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md outline-none"
		sideOffset={8}
	>
		<DatePicker.Calendar class="w-fit">
			{#snippet children({ months, weekdays })}
				<DatePicker.Header class="flex items-center justify-between">
					<DatePicker.PrevButton
						class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border bg-transparent hover:bg-accent hover:text-accent-foreground"
					>
						<ChevronLeft class="h-4 w-4" />
					</DatePicker.PrevButton>
					<DatePicker.Heading class="text-sm font-medium" />
					<DatePicker.NextButton
						class="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border bg-transparent hover:bg-accent hover:text-accent-foreground"
					>
						<ChevronRight class="h-4 w-4" />
					</DatePicker.NextButton>
				</DatePicker.Header>

				{#each months as month}
					<DatePicker.Grid class="mt-3 w-full border-collapse">
						<DatePicker.GridHead>
							<DatePicker.GridRow class="flex w-full">
								{#each weekdays as day}
									<DatePicker.HeadCell
										class="w-8 text-center text-[0.7rem] font-normal text-muted-foreground"
									>
										{day}
									</DatePicker.HeadCell>
								{/each}
							</DatePicker.GridRow>
						</DatePicker.GridHead>
						<DatePicker.GridBody>
							{#each month.weeks as week}
								<DatePicker.GridRow class="flex w-full">
									{#each week as day}
										<DatePicker.Cell date={day} month={month.value} class="p-0">
											<DatePicker.Day
												class="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sm font-normal transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:text-muted-foreground/30 data-[outside-month]:pointer-events-none data-[outside-month]:text-muted-foreground/30 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[today]:font-bold"
											/>
										</DatePicker.Cell>
									{/each}
								</DatePicker.GridRow>
							{/each}
						</DatePicker.GridBody>
					</DatePicker.Grid>
				{/each}
			{/snippet}
		</DatePicker.Calendar>
	</DatePicker.Content>
</DatePicker.Root>
