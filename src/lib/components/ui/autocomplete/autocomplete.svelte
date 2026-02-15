<script lang="ts">
	import { cn } from '$lib/utils';
	import { ScrollArea } from '$lib/components/ui/scroll-area';

	interface Props {
		suggestions: string[];
		value?: string;
		name?: string;
		id?: string;
		placeholder?: string;
		required?: boolean;
		class?: string;
	}

	let {
		suggestions,
		value = $bindable(''),
		name,
		id,
		placeholder,
		required,
		class: className
	}: Props = $props();

	let query = $state('');
	let open = $state(false);
	let highlightIndex = $state(-1);
	let inputRef = $state<HTMLInputElement | null>(null);
	let listRef = $state<HTMLUListElement | null>(null);

	$effect(() => {
		query = value ?? '';
	});

	const filtered = $derived.by(() => {
		const q = query.toLowerCase().trim();
		if (!q) return suggestions;
		return suggestions.filter((s) => s.toLowerCase().includes(q));
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		query = target.value;
		value = target.value;
		open = true;
		highlightIndex = -1;
	}

	function handleFocus() {
		open = true;
	}

	function handleBlur(e: FocusEvent) {
		// Delay to allow click on option to register
		const related = e.relatedTarget as HTMLElement | null;
		if (related?.closest('[data-autocomplete-list]')) return;
		setTimeout(() => {
			open = false;
		}, 150);
	}

	function selectItem(item: string) {
		value = item;
		query = item;
		open = false;
		inputRef?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open || filtered.length === 0) {
			if (e.key === 'ArrowDown' && filtered.length > 0) {
				open = true;
				highlightIndex = 0;
				e.preventDefault();
			}
			return;
		}

		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				highlightIndex = (highlightIndex + 1) % filtered.length;
				scrollToHighlighted();
				break;
			case 'ArrowUp':
				e.preventDefault();
				highlightIndex = highlightIndex <= 0 ? filtered.length - 1 : highlightIndex - 1;
				scrollToHighlighted();
				break;
			case 'Enter':
				if (highlightIndex >= 0 && highlightIndex < filtered.length) {
					e.preventDefault();
					selectItem(filtered[highlightIndex]);
				}
				break;
			case 'Escape':
				open = false;
				highlightIndex = -1;
				break;
		}
	}

	function scrollToHighlighted() {
		requestAnimationFrame(() => {
			const item = listRef?.children[highlightIndex] as HTMLElement | undefined;
			item?.scrollIntoView({ block: 'nearest' });
		});
	}
</script>

<div class="relative">
	<input
		bind:this={inputRef}
		type="text"
		{name}
		{id}
		{placeholder}
		{required}
		autocomplete="off"
		{value}
		oninput={handleInput}
		onfocus={handleFocus}
		onblur={handleBlur}
		onkeydown={handleKeydown}
		role="combobox"
		aria-expanded={open && filtered.length > 0}
		aria-autocomplete="list"
		aria-controls={id ? `${id}-listbox` : undefined}
		class={cn(
			'flex h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs ring-offset-background transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
			'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
			'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
			className
		)}
	/>

	{#if open && filtered.length > 0}
		<div
			data-autocomplete-list
			class="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md"
			role="listbox"
			id={id ? `${id}-listbox` : undefined}
		>
			<ScrollArea class="max-h-48">
				<ul bind:this={listRef} class="p-1">
					{#each filtered as item, i}
						<li
							role="option"
							aria-selected={i === highlightIndex}
							class={cn(
								'cursor-pointer rounded-sm px-2 py-1.5 text-sm',
								i === highlightIndex
									? 'bg-accent text-accent-foreground'
									: 'hover:bg-accent hover:text-accent-foreground'
							)}
							onmousedown={(e) => {
								e.preventDefault();
								selectItem(item);
							}}
						>
							{item}
						</li>
					{/each}
				</ul>
			</ScrollArea>
		</div>
	{/if}
</div>
