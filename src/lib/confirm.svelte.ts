import { type ComponentProps } from 'svelte';
import type { Button } from '$lib/components/ui/button';

export type ConfirmOptions = {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	variant?: ComponentProps<typeof Button>['variant'];
};

class ConfirmState {
	#open = $state(false);
	#options = $state<ConfirmOptions>({ message: '' });
	#resolve = $state<(value: boolean) => void>();

	get open() {
		return this.#open;
	}

	set open(value: boolean) {
		this.#open = value;
	}

	get options() {
		return this.#options;
	}

	confirm(options: ConfirmOptions | string): Promise<boolean> {
		if (typeof options === 'string') {
			this.#options = { message: options };
		} else {
			this.#options = options;
		}

		this.#open = true;

		return new Promise((resolve) => {
			this.#resolve = resolve;
		});
	}

	handleConfirm() {
		this.#open = false;
		this.#resolve?.(true);
	}

	handleCancel() {
		this.#open = false;
		this.#resolve?.(false);
	}
}

export const confirmState = new ConfirmState();
