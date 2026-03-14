import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const LOG_DIR = '/tmp/pos-errors';
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB max log file

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { errors } = body;

		if (!Array.isArray(errors) || errors.length === 0) {
			return json({ ok: true });
		}

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

		const lines = errors.map((e: any) => {
			return JSON.stringify({
				ts: e.timestamp || new Date().toISOString(),
				msg: e.message,
				stack: e.stack,
				source: e.source,
				platform: e.platform,
				ua: e.userAgent
			});
		});

		fs.appendFileSync(logFile, lines.join('\n') + '\n');

		return json({ ok: true });
	} catch {
		return json({ ok: false }, { status: 500 });
	}
};

export const GET: RequestHandler = async ({ url }) => {
	const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];
	const logFile = path.join(LOG_DIR, `errors-${date}.log`);

	try {
		const content = fs.readFileSync(logFile, 'utf-8');
		const errors = content.trim().split('\n').map((line) => {
			try { return JSON.parse(line); } catch { return { raw: line }; }
		});
		return json({ errors });
	} catch {
		return json({ errors: [] });
	}
};
