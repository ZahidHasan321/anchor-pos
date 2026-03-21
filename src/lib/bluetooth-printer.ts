/**
 * Bluetooth thermal printer module.
 *
 * Uses the Web Bluetooth API (BLE) for browsers (Chrome).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================
// Platform detection
// ============================================================

export function isBluetoothSupported(): boolean {
	return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

// backward compat alias
export const isWebBluetoothSupported = isBluetoothSupported;

// ============================================================
// Shared types
// ============================================================

export type BluetoothReceiptData = {
	storeSettings: {
		store_name?: string;
		store_address?: string;
		store_phone?: string;
		store_email?: string;
		store_tax_id?: string;
		store_bin?: string;
		store_facebook?: string;
		store_instagram?: string;
		store_currency?: string;
		receipt_footer?: string;
		return_policy?: string;
		exchange_policy?: string;
		terms_conditions?: string;
	};
	orderId: string;
	date: string;
	cashier: string;
	paymentMethod?: string;
	items: Array<{ name: string; variant: string; qty: number; total: number; status?: string }>;
	total: number;
	originalTotal?: number;
	cashReceived: number;
	changeGiven: number;
	isReprint?: boolean;
	status?: string;
};

export type DiscoveredDevice = { name: string; address: string };

function currencySymbol(currency?: string): string {
	if (!currency) return '';
	try {
		return (
			new Intl.NumberFormat('en', { style: 'currency', currency })
				.formatToParts(0)
				.find((p) => p.type === 'currency')?.value ?? ''
		);
	} catch {
		return '';
	}
}

function wordWrap(text: string, width: number): string[] {
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		const candidate = current ? current + ' ' + word : word;
		if (candidate.length <= width) {
			current = candidate;
		} else {
			if (current) lines.push(current);
			current = word.length > width ? word.substring(0, width) : word;
		}
	}
	if (current) lines.push(current);
	return lines;
}

// ============================================================
// Web Bluetooth (BLE) transport
// ============================================================

type BluetoothDevice = any;
type BluetoothRemoteGATTServer = any;
type BluetoothRemoteGATTCharacteristic = any;

declare global {
	interface Navigator {
		bluetooth?: {
			requestDevice(options: any): Promise<any>;
		};
	}
}

// NOTE: Most thermal POS printers (XPPrinter 365B, ZJ-5805, etc.) use Classic Bluetooth SPP,
// NOT BLE. Web Bluetooth API only supports BLE, so it won't work with those printers.
// Use Electron + COM port for Classic BT SPP printers instead.
// The BLE UUIDs below are for the minority of printers that DO support BLE.
const PRINTER_SERVICE_UUIDS = [
	'000018f0-0000-1000-8000-00805f9b34fb', // Standard BLE print service (MTP-2/3, Goojprt)
	'0000ff00-0000-1000-8000-00805f9b34fb', // FoMemo, PeriPage
	'0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 BLE UART module (some cheap mini printers)
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Nordic UART variant
	'49535343-fe7d-4ae5-8fa9-9fafd205e455' // Microchip Transparent UART
];

const PRINTER_WRITE_CHAR_UUIDS = [
	'00002af1-0000-1000-8000-00805f9b34fb', // Standard BLE print write characteristic
	'0000ff02-0000-1000-8000-00805f9b34fb', // FoMemo, PeriPage
	'0000ffe1-0000-1000-8000-00805f9b34fb', // HM-10 BLE UART write
	'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
	'49535343-8841-43f4-a8d4-ecbe34729bb3' // Microchip Transparent UART write
];

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
// BLE has a 20-byte MTU for many devices — use small chunks by default for reliability
const BLE_CHUNK_SIZE = 20;
const BLE_CHUNK_DELAY = 50;
// Even slower mode for unreliable connections
const BLE_SLOW_CHUNK_SIZE = 20;
const BLE_SLOW_CHUNK_DELAY = 150;

type WebBtState = {
	device: BluetoothDevice | null;
	server: BluetoothRemoteGATTServer | null;
	writeCharacteristic: BluetoothRemoteGATTCharacteristic | null;
	deviceName: string;
};

let webBt: WebBtState = {
	device: null,
	server: null,
	writeCharacteristic: null,
	deviceName: ''
};

function webBtIsConnected(): boolean {
	return webBt.server?.connected === true && webBt.writeCharacteristic !== null;
}

/**
 * Search for a writable characteristic across known service UUIDs and fallback to
 * discovering all services (for printers that don't advertise standard UUIDs).
 */
async function findWriteCharacteristic(
	server: BluetoothRemoteGATTServer
): Promise<BluetoothRemoteGATTCharacteristic | null> {
	let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

	// 1. Try known service UUIDs first
	for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
		try {
			const service = await server.getPrimaryService(serviceUuid);
			const chars = await service.getCharacteristics();

			// Try known write characteristic UUIDs
			for (const charUuid of PRINTER_WRITE_CHAR_UUIDS) {
				const found = chars.find((c: any) => c.uuid === charUuid);
				if (found && (found.properties.write || found.properties.writeWithoutResponse)) {
					return found;
				}
			}

			// Fallback: any writable characteristic in this service
			writeChar =
				chars.find((c: any) => c.properties.writeWithoutResponse || c.properties.write) ?? null;
			if (writeChar) return writeChar;
		} catch {
			continue;
		}
	}

	// 2. If known UUIDs didn't work, discover ALL services on the device
	// This handles unknown/cheap Chinese printers with non-standard UUIDs
	try {
		const services = await server.getPrimaryServices();
		for (const service of services) {
			try {
				const chars = await service.getCharacteristics();
				// Try known write characteristic UUIDs
				for (const charUuid of PRINTER_WRITE_CHAR_UUIDS) {
					const found = chars.find((c: any) => c.uuid === charUuid);
					if (found && (found.properties.write || found.properties.writeWithoutResponse)) {
						return found;
					}
				}
				// Any writable characteristic
				writeChar =
					chars.find((c: any) => c.properties.writeWithoutResponse || c.properties.write) ?? null;
				if (writeChar) return writeChar;
			} catch {
				continue;
			}
		}
	} catch {
		// getPrimaryServices() may not be supported in all contexts
	}

	return null;
}

async function webBtConnect(): Promise<{ success: boolean; name?: string; error?: string }> {
	if (!navigator.bluetooth) {
		return { success: false, error: 'Web Bluetooth is not supported on this device/browser' };
	}

	try {
		if (webBt.server?.connected) webBt.server.disconnect();

		// Try with known service filters first, fall back to acceptAllDevices
		// Many cheap BT printers (XPPrinter 365B etc.) don't advertise standard services
		let device: any;
		try {
			device = await navigator.bluetooth!.requestDevice({
				filters: [
					...PRINTER_SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
					// Also match by common printer name prefixes
					{ namePrefix: 'XP' },
					{ namePrefix: 'xp' },
					{ namePrefix: 'Printer' },
					{ namePrefix: 'BlueTooth' },
					{ namePrefix: 'BT-' },
					{ namePrefix: 'MPT' },
					{ namePrefix: 'RPP' },
					{ namePrefix: 'PT-' },
					{ namePrefix: 'ZJ-' },
					{ namePrefix: 'MTP' },
					{ namePrefix: 'GP-' },
					{ namePrefix: 'POS' }
				],
				optionalServices: PRINTER_SERVICE_UUIDS
			});
		} catch (filterErr: any) {
			// If user cancelled, don't retry
			if (filterErr.name === 'NotFoundError') {
				return { success: false, error: 'No printer selected (cancelled)' };
			}
			// Retry with acceptAllDevices — shows all BLE devices
			device = await navigator.bluetooth!.requestDevice({
				acceptAllDevices: true,
				optionalServices: PRINTER_SERVICE_UUIDS
			});
		}

		if (!device) return { success: false, error: 'No printer selected' };

		const server = await device.gatt!.connect();
		const writeChar = await findWriteCharacteristic(server);

		if (!writeChar) {
			server.disconnect();
			return {
				success: false,
				error:
					'No writable characteristic found on printer. This device may not be a supported thermal printer.'
			};
		}

		webBt = {
			device,
			server,
			writeCharacteristic: writeChar,
			deviceName: device.name || 'Unknown Printer'
		};

		localStorage.setItem('pos-bt-printer-name', webBt.deviceName);

		device.addEventListener('gattserverdisconnected', () => {
			webBt.writeCharacteristic = null;
			webBt.server = null;
		});

		return { success: true, name: webBt.deviceName };
	} catch (e: any) {
		if (e.name === 'NotFoundError')
			return { success: false, error: 'No printer selected (cancelled)' };
		return { success: false, error: e.message || 'Failed to connect' };
	}
}

function webBtDisconnect() {
	if (webBt.server?.connected) webBt.server.disconnect();
	webBt = { device: null, server: null, writeCharacteristic: null, deviceName: '' };
	localStorage.removeItem('pos-bt-printer-name');
}

async function sendBytes(data: Uint8Array): Promise<void> {
	const char = webBt.writeCharacteristic;
	if (!char) throw new Error('Printer not connected');

	const slowMode = localStorage.getItem('pos-bt-printer-slow') === 'true';
	const chunkSize = slowMode ? BLE_SLOW_CHUNK_SIZE : BLE_CHUNK_SIZE;
	const chunkDelay = slowMode ? BLE_SLOW_CHUNK_DELAY : BLE_CHUNK_DELAY;

	for (let offset = 0; offset < data.length; offset += chunkSize) {
		const chunk = data.slice(offset, offset + chunkSize);
		let retries = 3;
		while (retries > 0) {
			try {
				if (char.properties.writeWithoutResponse) {
					await char.writeValueWithoutResponse(chunk);
				} else {
					await char.writeValueWithResponse(chunk);
				}
				break;
			} catch (e) {
				retries--;
				if (retries === 0) throw e;
				await new Promise((r) => setTimeout(r, chunkDelay * 2));
			}
		}
		if (offset + chunkSize < data.length) {
			await new Promise((r) => setTimeout(r, chunkDelay));
		}
	}
}

// --- ESC/POS Command Builder (for Web Bluetooth BLE path) ---

class EscPosBuilder {
	private buffer: number[] = [];

	init(): this {
		this.buffer.push(ESC, 0x40); // ESC @ — initialize printer
		this.buffer.push(ESC, 0x74, 0); // ESC t 0 — select character code table (PC437 USA)
		return this;
	}

	text(str: string): this {
		// Use raw single-byte encoding (Latin-1/CP437 compatible) instead of UTF-8.
		// Cheap thermal printers (XPPrinter 365B etc.) don't handle multi-byte UTF-8.
		for (let i = 0; i < str.length; i++) {
			const code = str.charCodeAt(i);
			this.buffer.push(code > 0xff ? 0x3f : code); // Replace non-Latin chars with '?'
		}
		return this;
	}

	newline(): this {
		this.buffer.push(LF);
		return this;
	}

	println(str: string): this {
		return this.text(str).newline();
	}

	bold(on: boolean): this {
		this.buffer.push(ESC, 0x45, on ? 1 : 0);
		return this;
	}

	alignCenter(): this {
		this.buffer.push(ESC, 0x61, 1);
		return this;
	}

	alignLeft(): this {
		this.buffer.push(ESC, 0x61, 0);
		return this;
	}

	alignRight(): this {
		this.buffer.push(ESC, 0x61, 2);
		return this;
	}

	doubleHeight(on: boolean): this {
		this.buffer.push(GS, 0x21, on ? 0x10 : 0x00);
		return this;
	}

	drawLine(width = 32): this {
		this.println('-'.repeat(width));
		return this;
	}

	leftRight(left: string, right: string, width = 32): this {
		const gap = width - left.length - right.length;
		if (gap > 0) {
			this.println(left + ' '.repeat(gap) + right);
		} else {
			this.println(left + ' ' + right);
		}
		return this;
	}

	feed(lines = 3): this {
		for (let i = 0; i < lines; i++) this.buffer.push(LF);
		return this;
	}

	cut(): this {
		this.buffer.push(GS, 0x56, 66, 3);
		return this;
	}

	build(): Uint8Array {
		return new Uint8Array(this.buffer);
	}
}

async function webBtPrintReceipt(
	data: BluetoothReceiptData
): Promise<{ success: boolean; error?: string }> {
	if (!webBtIsConnected()) {
		if (webBt.device?.gatt) {
			try {
				const server = await webBt.device.gatt.connect();
				webBt.server = server;
				const writeChar = await findWriteCharacteristic(server);
				if (writeChar) {
					webBt.writeCharacteristic = writeChar;
				}
			} catch {
				return { success: false, error: 'Printer disconnected. Please reconnect in Settings.' };
			}
		} else {
			return {
				success: false,
				error: 'No printer connected. Set up Bluetooth printer in Settings.'
			};
		}
	}

	const paperWidth = localStorage.getItem('pos-bt-printer-width') === '58' ? 32 : 48;
	const s = data.storeSettings;
	const sym = currencySymbol(s.store_currency);
	const b = new EscPosBuilder();

	b.init();
	b.alignCenter();
	b.doubleHeight(true);
	b.bold(true);
	b.println((s.store_name || 'STORE').toUpperCase());
	b.doubleHeight(false);
	b.bold(false);

	if (s.store_address) b.println(s.store_address);
	if (s.store_phone) b.println('Phone: ' + s.store_phone);
	if (s.store_email) b.println(s.store_email);
	if (s.store_tax_id) b.println('VAT: ' + s.store_tax_id);
	if (s.store_bin) b.println('BIN: ' + s.store_bin);

	// Refund banners
	const hasRefundsBle =
		data.items.some((i) => i.status === 'refunded') || data.status === 'refunded';
	if (data.status === 'refunded') {
		b.drawLine(paperWidth);
		b.alignCenter();
		b.bold(true);
		b.println('*** FULL REFUND ***');
		b.bold(false);
	} else if (hasRefundsBle) {
		b.drawLine(paperWidth);
		b.alignCenter();
		b.bold(true);
		b.println('*** PARTIAL REFUND ***');
		b.bold(false);
	}

	b.drawLine(paperWidth);
	b.alignLeft();
	b.println('Order: ' + data.orderId + (data.isReprint ? ' (REPRINT)' : ''));
	b.println('Date: ' + data.date);
	b.println('Cashier: ' + data.cashier);
	if (data.paymentMethod)
		b.println(
			'Payment: ' + data.paymentMethod.charAt(0).toUpperCase() + data.paymentMethod.slice(1)
		);
	b.drawLine(paperWidth);

	b.bold(true);
	b.leftRight('Item', 'Qty   Total', paperWidth);
	b.bold(false);

	for (const item of data.items) {
		const prefix = item.status === 'refunded' ? '[R] ' : '';
		const sign = item.status === 'refunded' ? '-' : '';
		const qtyStr = item.qty.toString().padStart(3);
		const totalStr = (sign + item.total.toFixed(2)).padStart(8);
		const right = qtyStr + totalStr;
		const maxName = paperWidth - right.length - 1;
		const itemName = prefix + item.name;
		const name = itemName.length > maxName ? itemName.substring(0, maxName) : itemName;
		b.leftRight(name, right, paperWidth);
		if (item.variant) b.println('  ' + item.variant);
	}

	b.drawLine(paperWidth);
	const refundAmountBle = data.originalTotal ? data.originalTotal - data.total : 0;
	if (data.originalTotal && data.originalTotal !== data.total) {
		b.leftRight('ORIGINAL TOTAL', sym + data.originalTotal.toFixed(2), paperWidth);
		b.leftRight('TOTAL REFUND', '-' + sym + refundAmountBle.toFixed(2), paperWidth);
	}
	b.bold(true);
	b.leftRight('NET TOTAL', sym + data.total.toFixed(2), paperWidth);
	b.bold(false);

	if (data.cashReceived) {
		b.leftRight('Cash Received', sym + data.cashReceived.toFixed(2), paperWidth);
		b.leftRight('Change', sym + data.changeGiven.toFixed(2), paperWidth);
	}

	if (s.return_policy || s.exchange_policy || s.terms_conditions) {
		b.drawLine(paperWidth);
		if (s.return_policy)
			wordWrap('Return: ' + s.return_policy, paperWidth).forEach((l) => b.println(l));
		if (s.exchange_policy)
			wordWrap('Exchange: ' + s.exchange_policy, paperWidth).forEach((l) => b.println(l));
		if (s.terms_conditions)
			wordWrap('T&C: ' + s.terms_conditions, paperWidth).forEach((l) => b.println(l));
	}

	if (s.store_facebook || s.store_instagram) {
		b.newline();
		b.alignCenter();
		if (s.store_facebook) b.println('FB: ' + s.store_facebook);
		if (s.store_instagram) b.println('IG: ' + s.store_instagram);
	}

	b.newline();
	b.alignCenter();
	b.println(s.receipt_footer || 'Thank you!');
	b.println('*** End of Receipt ***');
	b.feed(4);
	b.cut();

	try {
		await sendBytes(b.build());
		return { success: true };
	} catch (e: any) {
		return { success: false, error: e.message || 'Failed to send data to printer' };
	}
}

async function webBtTestPrint(): Promise<{ success: boolean; error?: string }> {
	if (!webBtIsConnected()) return { success: false, error: 'Printer not connected' };

	const paperWidth = localStorage.getItem('pos-bt-printer-width') === '58' ? 32 : 48;
	const b = new EscPosBuilder();

	b.init();
	b.alignCenter();
	b.bold(true);
	b.println('=== BT PRINTER TEST ===');
	b.bold(false);
	b.println('Connection: OK');
	b.println('Device: ' + (webBt.deviceName || 'Unknown'));
	b.drawLine(paperWidth);
	b.println('ABCDabcd1234!@#$');
	b.println('Bluetooth test passed.');
	b.drawLine(paperWidth);
	b.feed(3);
	b.cut();

	try {
		await sendBytes(b.build());
		return { success: true };
	} catch (e: any) {
		return { success: false, error: e.message || 'Failed to send test data' };
	}
}

// ============================================================
// Public API
// ============================================================

export function getConnectedPrinterName(): string {
	return webBt.deviceName;
}

export function isConnected(): boolean {
	return webBtIsConnected();
}

export async function connectPrinter(): Promise<{
	success: boolean;
	name?: string;
	error?: string;
}> {
	return webBtConnect();
}

export async function disconnectPrinter() {
	webBtDisconnect();
}

export async function printBluetoothReceipt(
	data: BluetoothReceiptData
): Promise<{ success: boolean; error?: string }> {
	return webBtPrintReceipt(data);
}

export async function testBluetoothPrint(): Promise<{ success: boolean; error?: string }> {
	return webBtTestPrint();
}
