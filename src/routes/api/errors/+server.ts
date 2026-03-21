import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const LOG_DIR = '/tmp/pos-errors';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max log file
const MAX_ERRORS_PER_REQUEST = 50;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { errors } = body;

		if (!Array.isArray(errors) || errors.length === 0) {
			return json({ ok: true });
		}

		// Cap the number of errors per request to prevent abuse
		const limitedErrors = errors.slice(0, MAX_ERRORS_PER_REQUEST);

		if (!fs.existsSync(LOG_DIR)) {
			fs.mkdirSync(LOG_DIR, { recursive: true });
		}

		const date = new Date().toISOString().split('T')[0];
		const logFile = path.join(LOG_DIR, `errors-${date}.log`);

		// Rotate if too large
		try {
			const stat = fs.statSync(logFile);
			if (stat.size > MAX_FILE_SIZE) {
				fs.renameSync(logFile, logFile + '.old');
			}
		} catch {
			// file doesn't exist yet
		}

		const lines = limitedErrors.map((e: any) => {
			return JSON.stringify({
				ts: e.timestamp || new Date().toISOString(),
				msg: String(e.message || '').slice(0, 2000),
				stack: String(e.stack || '').slice(0, 4000),
				source: String(e.source || '').slice(0, 200),
				platform: String(e.platform || '').slice(0, 50),
				ua: String(e.userAgent || '').slice(0, 300)
			});
		});

		fs.appendFileSync(logFile, lines.join('\n') + '\n');

		return json({ ok: true });
	} catch {
		return json({ ok: false }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url, locals }) => {
	// Only authenticated admin/manager users can read error logs
	if (!locals.user || locals.user.role === 'sales') {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	// Validate date format to prevent path traversal
	if (!DATE_PATTERN.test(date)) {
		return json({ error: 'Invalid date format' }, { status: 400 });
	}

	const logFile = path.join(LOG_DIR, `errors-${date}.log`);

	// Verify resolved path is still within LOG_DIR
	const resolved = path.resolve(logFile);
	if (!resolved.startsWith(path.resolve(LOG_DIR))) {
		return json({ error: 'Invalid date format' }, { status: 400 });
	}

	try {
		const content = fs.readFileSync(logFile, 'utf-8');
		const errors = content
			.trim()
			.split('\n')
			.map((line) => {
				try {
					return JSON.parse(line);
				} catch {
					return { raw: line };
				}
			});
		return json({ errors });
	} catch {
		return json({ errors: [] });
	}
};
