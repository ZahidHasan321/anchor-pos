import { CalendarDate } from '@internationalized/date';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function toCalendarDate(dateStr: string | undefined): CalendarDate {
	if (!dateStr) {
		const now = new Date();
		return new CalendarDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
	}
	const [y, m, d] = dateStr.split('-').map(Number);
	return new CalendarDate(y, m, d);
}

export function formatDateString(date: CalendarDate | undefined): string {
	if (!date) return '';
	return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

export function displayDate(dateStr: string | undefined): string {
	if (!dateStr) return '';
	const [y, m, d] = dateStr.split('-');
	return `${d}-${m}-${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export function generateId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		// Fallback for older environments or restricted contexts
		return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
	}
}

export const roleLabels: Record<string, string> = {
	admin: 'Admin (Owner)',
	manager: 'Inventory Manager',
	sales: 'Sales Person'
};
