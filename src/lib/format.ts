import { globalSettings } from './settings.svelte';

// Cache NumberFormat instance — recreate only when locale/currency changes
let cachedLocale = '';
let cachedCurrency = '';
let cachedFormatter: Intl.NumberFormat | null = null;

function getCurrencyFormatter(): Intl.NumberFormat {
	const locale = globalSettings.locale;
	const currency = globalSettings.currency;
	if (!cachedFormatter || locale !== cachedLocale || currency !== cachedCurrency) {
		cachedLocale = locale;
		cachedCurrency = currency;
		cachedFormatter = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			minimumFractionDigits: 0
		});
	}
	return cachedFormatter;
}

export function formatCurrency(amount: number): string {
	return getCurrencyFormatter().format(amount);
}

// Get just the currency symbol (e.g. "৳", "$", "€") — cached
let cachedSymbol = '';
let cachedSymbolCurrency = '';
let cachedSymbolLocale = '';

export function getCurrencySymbol(): string {
	const locale = globalSettings.locale;
	const currency = globalSettings.currency;
	if (cachedSymbol && locale === cachedSymbolLocale && currency === cachedSymbolCurrency) {
		return cachedSymbol;
	}
	cachedSymbolLocale = locale;
	cachedSymbolCurrency = currency;
	// Format 0 and strip digits to extract the symbol
	const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
	cachedSymbol = parts.find((p) => p.type === 'currency')?.value || currency;
	return cachedSymbol;
}

export function formatDate(date: Date | number | string): string {
	const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
	return d.toLocaleDateString(globalSettings.locale, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		timeZone: globalSettings.timezone
	});
}

export function formatDateTime(date: Date | number): string {
	const d = typeof date === 'number' ? new Date(date) : date;
	return d.toLocaleString(globalSettings.locale, {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		timeZone: globalSettings.timezone
	});
}
