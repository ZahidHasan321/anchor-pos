<script lang="ts">
	import { Popover, type CalendarRootProps } from 'bits-ui';
	import { Calendar as CalendarIcon, X } from '@lucide/svelte';
	import { today, getLocalTimeZone } from '@internationalized/date';
	import Calendar from './Calendar.svelte';
	import { cn, toCalendarDate, formatDateString, displayDate } from '$lib/utils';

	interface Props {
		value?: string; // YYYY-MM-DD
		label?: string;
		placeholder?: string;
		id?: string;
		name?: string;
		required?: boolean;
		class?: string;
		onchange?: (value: string) => void;
	}

	let {
		value = $bindable(''),
		label,
		placeholder = 'Select date',
		id = Math.random().toString(36).substring(7),
		name,
		required = false,
		class: className = '',
		onchange
	}: Props = $props();

	let open = $state(false);

	// Converts string to @internationalized/date object for the calendar
	let dateValue = $state<any>(undefined);
	let placeholderDate = $state(today(getLocalTimeZone()));

	// Sync value string to dateValue object
	$effect(() => {
		const parsed = value ? toCalendarDate(value) : undefined;
		if (formatDateString(parsed) !== formatDateString(dateValue)) {
			dateValue = parsed;
		}
	});

	function handleSelect(v: any) {
		const newValue = formatDateString(v);
		if (newValue !== value) {
			value = newValue;
			onchange?.(newValue);
		}
		open = false;
	}

	function clearDate(e: MouseEvent) {
		e.stopPropagation();
		value = '';
		dateValue = undefined;
		onchange?.('');
	}
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if label}
		<label
			for={id}
			class="ml-1 text-[10px] font-black tracking-widest text-muted-foreground uppercase"
		>
			{label}
			{#if required}<span class="text-rose-500">*</span>{/if}
		</label>
	{/if}

	<Popover.Root bind:open>
		<Popover.Trigger
			{id}
			class={cn(
				'flex h-11 w-full cursor-pointer items-center gap-1.5 rounded-xl border-2 border-input bg-card px-2.5 py-2 text-sm transition-all hover:border-primary/30 focus:border-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
				!value && 'font-bold text-muted-foreground'
			)}
		>
			<CalendarIcon class="size-4 shrink-0 opacity-50" />
			<span class="min-w-0 flex-1 truncate text-left font-black">
				{value ? displayDate(value) : placeholder}
			</span>
			{#if value}
				<button type="button" onclick={clearDate} class="shrink-0 p-0.5 hover:text-rose-500">
					<X size={14} />
				</button>
			{/if}
		</Popover.Trigger>

		<Popover.Content
			class="z-50 w-auto max-w-[calc(100vw-1rem)] animate-in rounded-[2rem] border-2 border-border bg-popover p-0 text-popover-foreground shadow-2xl duration-150 fade-in zoom-in"
			align="start"
			sideOffset={8}
			avoidCollisions={true}
			collisionPadding={8}
		>
			<Calendar
				type="single"
				bind:value={dateValue}
				onValueChange={handleSelect}
				bind:placeholder={placeholderDate}
			/>
		</Popover.Content>
	</Popover.Root>

	{#if name}
		<input type="hidden" {name} {value} />
	{/if}
</div>
