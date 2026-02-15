export function formatBDT(amount: number): string {
	return `৳${amount.toFixed(2)}`;
}

export function formatDate(date: Date | number | string): string {
	const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
	return d.toLocaleDateString('en-GB', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});
}

export function formatDateTime(date: Date | number): string {
	const d = typeof date === 'number' ? new Date(date) : date;
	return d.toLocaleString('en-GB', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
