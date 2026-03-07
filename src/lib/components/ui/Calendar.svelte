<script lang="ts">
	import { Calendar, type CalendarRootProps } from 'bits-ui';
	import { ChevronLeft, ChevronRight } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		...restProps
	}: any = $props();
</script>

<Calendar.Root bind:value bind:placeholder bind:ref class={cn('p-4', className)} {...restProps}>
	{#snippet children({ months, weekdays })}
		<Calendar.Header class="flex items-center justify-between pb-4">
			<Calendar.PrevButton
				class="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-50 bg-white text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
			>
				<ChevronLeft size={18} />
			</Calendar.PrevButton>
			<Calendar.Heading class="text-sm font-black tracking-tight text-slate-900 uppercase" />
			<Calendar.NextButton
				class="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border-2 border-slate-50 bg-white text-slate-600 transition-all hover:bg-slate-50 active:scale-95"
			>
				<ChevronRight size={18} />
			</Calendar.NextButton>
		</Calendar.Header>

		<div class="flex flex-col gap-4 sm:flex-row sm:gap-x-8">
			{#each months as month}
				<Calendar.Grid class="w-full border-collapse select-none">
					<Calendar.GridHead>
						<Calendar.GridRow class="mb-1 flex w-full justify-between">
							{#each weekdays as day}
								<Calendar.HeadCell class="w-9 text-[10px] font-black text-slate-400 uppercase">
									{day.slice(0, 2)}
								</Calendar.HeadCell>
							{/each}
						</Calendar.GridRow>
					</Calendar.GridHead>
					<Calendar.GridBody>
						{#each month.weeks as weekDates}
							<Calendar.GridRow class="flex w-full">
								{#each weekDates as date}
									<Calendar.Cell
										{date}
										month={month.value}
										class="relative p-0 text-center text-sm focus-within:relative focus-within:z-20"
									>
										<Calendar.Day
											class={cn(
												'inline-flex size-9 cursor-pointer items-center justify-center rounded-xl text-sm font-bold transition-all hover:bg-primary/10 hover:text-primary',
												'data-[selected]:bg-primary data-[selected]:font-black data-[selected]:text-white data-[selected]:shadow-lg',
												'data-[outside-month]:pointer-events-none data-[outside-month]:opacity-20'
											)}
										>
											{date.day}
										</Calendar.Day>
									</Calendar.Cell>
								{/each}
							</Calendar.GridRow>
						{/each}
					</Calendar.GridBody>
				</Calendar.Grid>
			{/each}
		</div>
	{/snippet}
</Calendar.Root>
