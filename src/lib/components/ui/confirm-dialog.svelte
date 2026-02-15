<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { confirmState } from '$lib/confirm.svelte';
	import { AlertTriangle, HelpCircle } from '@lucide/svelte';

	let options = $derived(confirmState.options);
	let isDestructive = $derived(options.variant === 'destructive' || !options.variant);
</script>

<Dialog.Root
	bind:open={confirmState.open}
	onOpenChange={(open) => {
		if (!open) confirmState.handleCancel();
	}}
>
	<Dialog.Content
		class="z-[100] max-w-[400px] overflow-hidden border-none p-0 shadow-2xl"
		overlayClass="z-[100]"
		showCloseButton={false}
	>
		<div class="flex flex-col items-center p-8 text-center">
			<div
				class="mb-4 flex h-16 w-16 items-center justify-center rounded-full {isDestructive
					? 'bg-destructive/10 text-destructive'
					: 'bg-primary/10 text-primary'}"
			>
				{#if isDestructive}
					<AlertTriangle class="h-8 w-8" />
				{:else}
					<HelpCircle class="h-8 w-8" />
				{/if}
			</div>

			<h2 class="mb-2 text-xl font-bold tracking-tight">
				{options.title ?? (isDestructive ? 'Are you sure?' : 'Confirm Action')}
			</h2>

			<p class="text-sm leading-relaxed text-muted-foreground">
				{options.message}
			</p>
		</div>

		<div class="flex border-t bg-muted/30">
			<button
				type="button"
				class="flex-1 border-r px-4 py-4 text-sm font-medium transition-colors hover:bg-muted active:bg-muted/80"
				onclick={() => confirmState.handleCancel()}
			>
				{options.cancelText ?? 'Cancel'}
			</button>
			<button
				type="button"
				class="flex-1 px-4 py-4 text-sm font-bold transition-colors {isDestructive
					? 'text-destructive hover:bg-destructive/5 active:bg-destructive/10'
					: 'text-primary hover:bg-primary/5 active:bg-primary/10'}"
				onclick={() => confirmState.handleConfirm()}
			>
				{options.confirmText ?? (isDestructive ? 'Delete' : 'Confirm')}
			</button>
		</div>
	</Dialog.Content>
</Dialog.Root>
