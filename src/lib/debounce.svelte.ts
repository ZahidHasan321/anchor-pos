export function createDebounced<T>(getter: () => T, delay = 300): { readonly value: T } {
	let value = $state(getter());
	let timeout: ReturnType<typeof setTimeout>;

	$effect(() => {
		const next = getter();
		clearTimeout(timeout);
		timeout = setTimeout(() => {
			value = next;
		}, delay);
		return () => clearTimeout(timeout);
	});

	return {
		get value() {
			return value;
		}
	};
}
