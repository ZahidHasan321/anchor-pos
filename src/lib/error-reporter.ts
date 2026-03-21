/**
 * Lightweight client-side error reporter.
 * Batches errors and sends them to the server periodically.
 * Only captures uncaught errors and unhandled promise rejections.
 */

const API_BASE = '';
const FLUSH_INTERVAL = 10_000; // 10s
const MAX_QUEUE = 50;

type ErrorEntry = {
	timestamp: string;
	message: string;
	stack?: string;
	source?: string;
	platform: string;
	userAgent: string;
};

let queue: ErrorEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

function getPlatform(): string {
	if (typeof window !== 'undefined' && 'electron' in window) return 'electron';
	return 'web';
}

function enqueue(entry: ErrorEntry) {
	if (queue.length >= MAX_QUEUE) queue.shift();
	queue.push(entry);
}

async function flush() {
	if (queue.length === 0) return;

	const batch = queue.splice(0);
	try {
		await fetch(`${API_BASE}/api/errors`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ errors: batch })
		});
	} catch {
		// Network error — put them back for next attempt
		queue.unshift(...batch.slice(0, MAX_QUEUE - queue.length));
	}
}

export function initErrorReporter() {
	if (typeof window === 'undefined') return;

	const platform = getPlatform();
	const ua = navigator.userAgent;

	window.onerror = (message, source, lineno, colno, error) => {
		enqueue({
			timestamp: new Date().toISOString(),
			message: String(message),
			stack: error?.stack || `${source}:${lineno}:${colno}`,
			source: source ? `${source}:${lineno}:${colno}` : undefined,
			platform,
			userAgent: ua
		});
	};

	window.onunhandledrejection = (event: PromiseRejectionEvent) => {
		const err = event.reason;
		enqueue({
			timestamp: new Date().toISOString(),
			message: err?.message || String(err),
			stack: err?.stack,
			source: 'unhandledrejection',
			platform,
			userAgent: ua
		});
	};

	// Intercept console.error to capture errors logged by libraries
	const originalConsoleError = console.error;
	console.error = (...args: any[]) => {
		originalConsoleError.apply(console, args);

		const message = args
			.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
			.join(' ');

		// Only capture actual errors, not debug noise
		if (
			message.includes('Error') ||
			message.includes('error') ||
			message.includes('fail') ||
			message.includes('500')
		) {
			enqueue({
				timestamp: new Date().toISOString(),
				message: message.slice(0, 2000),
				stack: args.find((a) => a instanceof Error)?.stack,
				source: 'console.error',
				platform,
				userAgent: ua
			});
		}
	};

	flushTimer = setInterval(flush, FLUSH_INTERVAL);

	// Flush on page unload
	window.addEventListener('beforeunload', () => flush());
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'hidden') flush();
	});
}
