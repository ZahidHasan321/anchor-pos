/**
 * Web Bluetooth ESC/POS thermal printer module for mobile.
 * Connects to BLE thermal printers and sends raw ESC/POS commands.
 */

// Web Bluetooth API type shims (not in default TS lib)
/* eslint-disable @typescript-eslint/no-explicit-any */
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

// Common BLE printer service/characteristic UUIDs
const PRINTER_SERVICE_UUIDS = [
	'0000ff00-0000-1000-8000-00805f9b34fb', // Most Chinese thermal printers (XPrinter, etc.)
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Some generic BLE printers
	'49535343-fe7d-4ae5-8fa9-9fafd205e455'  // Nordic UART service
];

const PRINTER_WRITE_CHAR_UUIDS = [
	'0000ff02-0000-1000-8000-00805f9b34fb', // Common write characteristic
	'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f', // Some generic printers
	'49535343-8841-43f4-a8d4-ecbe34729bb3'  // Nordic UART TX
];

// ESC/POS command constants
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Chunk size for BLE writes (most printers handle 100-200 bytes well)
const BLE_CHUNK_SIZE = 100;
const BLE_CHUNK_DELAY = 50; // ms between chunks

type BluetoothPrinterState = {
	device: BluetoothDevice | null;
	server: BluetoothRemoteGATTServer | null;
	writeCharacteristic: BluetoothRemoteGATTCharacteristic | null;
	deviceName: string;
};

let printerState: BluetoothPrinterState = {
	device: null,
	server: null,
	writeCharacteristic: null,
	deviceName: ''
};

export function isWebBluetoothSupported(): boolean {
	return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function getConnectedPrinterName(): string {
	return printerState.deviceName;
}

export function isConnected(): boolean {
	return printerState.server?.connected === true && printerState.writeCharacteristic !== null;
}

/**
 * Scan for and connect to a BLE thermal printer.
 * Must be called from a user gesture (click/tap).
 */
export async function connectPrinter(): Promise<{ success: boolean; name?: string; error?: string }> {
	if (!isWebBluetoothSupported()) {
		return { success: false, error: 'Web Bluetooth is not supported on this device/browser' };
	}

	try {
		// Disconnect existing connection first
		if (printerState.server?.connected) {
			printerState.server.disconnect();
		}

		const device = await navigator.bluetooth!.requestDevice({
			filters: PRINTER_SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
			optionalServices: PRINTER_SERVICE_UUIDS
		});

		if (!device) {
			return { success: false, error: 'No printer selected' };
		}

		const server = await device.gatt!.connect();

		// Try each known service UUID until we find one
		let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

		for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
			try {
				const service = await server.getPrimaryService(serviceUuid);
				const chars = await service.getCharacteristics();

				// Try known write characteristic UUIDs first
				for (const charUuid of PRINTER_WRITE_CHAR_UUIDS) {
					const found = chars.find((c: any) => c.uuid === charUuid);
					if (found && (found.properties.write || found.properties.writeWithoutResponse)) {
						writeChar = found;
						break;
					}
				}

				// If no known UUID matched, find any writable characteristic
				if (!writeChar) {
					writeChar =
						chars.find(
							(c: any) => c.properties.writeWithoutResponse || c.properties.write
						) ?? null;
				}

				if (writeChar) break;
			} catch {
				// This service UUID doesn't exist on the device, try next
				continue;
			}
		}

		if (!writeChar) {
			server.disconnect();
			return { success: false, error: 'No writable characteristic found on printer' };
		}

		printerState = {
			device,
			server,
			writeCharacteristic: writeChar,
			deviceName: device.name || 'Unknown Printer'
		};

		// Save device name for settings display
		localStorage.setItem('pos-bt-printer-name', printerState.deviceName);

		// Listen for disconnection
		device.addEventListener('gattserverdisconnected', () => {
			printerState.writeCharacteristic = null;
			printerState.server = null;
		});

		return { success: true, name: printerState.deviceName };
	} catch (e: any) {
		if (e.name === 'NotFoundError') {
			return { success: false, error: 'No printer selected (cancelled)' };
		}
		return { success: false, error: e.message || 'Failed to connect' };
	}
}

export function disconnectPrinter() {
	if (printerState.server?.connected) {
		printerState.server.disconnect();
	}
	printerState = { device: null, server: null, writeCharacteristic: null, deviceName: '' };
	localStorage.removeItem('pos-bt-printer-name');
}

/**
 * Send raw bytes to the printer in BLE-safe chunks.
 */
async function sendBytes(data: Uint8Array): Promise<void> {
	const char = printerState.writeCharacteristic;
	if (!char) throw new Error('Printer not connected');

	for (let offset = 0; offset < data.length; offset += BLE_CHUNK_SIZE) {
		const chunk = data.slice(offset, offset + BLE_CHUNK_SIZE);
		if (char.properties.writeWithoutResponse) {
			await char.writeValueWithoutResponse(chunk);
		} else {
			await char.writeValueWithResponse(chunk);
		}
		if (offset + BLE_CHUNK_SIZE < data.length) {
			await new Promise((r) => setTimeout(r, BLE_CHUNK_DELAY));
		}
	}
}

// --- ESC/POS Command Builder ---

class EscPosBuilder {
	private buffer: number[] = [];

	init(): this {
		// ESC @ — Initialize printer
		this.buffer.push(ESC, 0x40);
		return this;
	}

	text(str: string): this {
		const encoder = new TextEncoder();
		this.buffer.push(...encoder.encode(str));
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
		// ESC E n
		this.buffer.push(ESC, 0x45, on ? 1 : 0);
		return this;
	}

	alignCenter(): this {
		// ESC a 1
		this.buffer.push(ESC, 0x61, 1);
		return this;
	}

	alignLeft(): this {
		// ESC a 0
		this.buffer.push(ESC, 0x61, 0);
		return this;
	}

	alignRight(): this {
		// ESC a 2
		this.buffer.push(ESC, 0x61, 2);
		return this;
	}

	doubleHeight(on: boolean): this {
		// GS ! n — double height
		this.buffer.push(GS, 0x21, on ? 0x10 : 0x00);
		return this;
	}

	drawLine(width = 32): this {
		this.println('-'.repeat(width));
		return this;
	}

	/**
	 * Print a left-right justified line within the given width.
	 */
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
		for (let i = 0; i < lines; i++) {
			this.buffer.push(LF);
		}
		return this;
	}

	cut(): this {
		// GS V 66 3 — partial cut with feed
		this.buffer.push(GS, 0x56, 66, 3);
		return this;
	}

	build(): Uint8Array {
		return new Uint8Array(this.buffer);
	}
}

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
		receipt_footer?: string;
		return_policy?: string;
		exchange_policy?: string;
		terms_conditions?: string;
	};
	orderId: string;
	date: string;
	cashier: string;
	items: Array<{ name: string; variant: string; qty: number; total: number }>;
	total: number;
	cashReceived: number;
	changeGiven: number;
	isReprint?: boolean;
};

/**
 * Print a receipt via Bluetooth ESC/POS.
 */
export async function printBluetoothReceipt(
	data: BluetoothReceiptData
): Promise<{ success: boolean; error?: string }> {
	if (!isConnected()) {
		// Try to reconnect if we have a device reference
		if (printerState.device?.gatt) {
			try {
				const server = await printerState.device.gatt.connect();
				printerState.server = server;
				// Re-discover the characteristic
				for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
					try {
						const service = await server.getPrimaryService(serviceUuid);
						const chars = await service.getCharacteristics();
						const writeChar =
							chars.find(
								(c: any) => c.properties.writeWithoutResponse || c.properties.write
							) ?? null;
						if (writeChar) {
							printerState.writeCharacteristic = writeChar;
							break;
						}
					} catch {
						continue;
					}
				}
			} catch {
				return { success: false, error: 'Printer disconnected. Please reconnect in Settings.' };
			}
		} else {
			return { success: false, error: 'No printer connected. Set up Bluetooth printer in Settings.' };
		}
	}

	const paperWidth = localStorage.getItem('pos-bt-printer-width') === '58' ? 32 : 48;
	const s = data.storeSettings;
	const b = new EscPosBuilder();

	b.init();

	// Header
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

	b.drawLine(paperWidth);
	b.alignLeft();
	b.println('Order: ' + data.orderId + (data.isReprint ? ' (REPRINT)' : ''));
	b.println('Date: ' + data.date);
	b.println('Cashier: ' + data.cashier);
	b.drawLine(paperWidth);

	// Column header
	b.bold(true);
	b.leftRight('Item', 'Qty   Total', paperWidth);
	b.bold(false);

	// Items
	for (const item of data.items) {
		const qtyStr = item.qty.toString().padStart(3);
		const totalStr = item.total.toFixed(2).padStart(8);
		const right = qtyStr + totalStr;
		// If item name is too long, truncate
		const maxName = paperWidth - right.length - 1;
		const name = item.name.length > maxName ? item.name.substring(0, maxName) : item.name;
		b.leftRight(name, right, paperWidth);
		if (item.variant) {
			b.println('  ' + item.variant);
		}
	}

	b.drawLine(paperWidth);

	// Totals
	b.bold(true);
	b.leftRight('TOTAL', data.total.toFixed(2), paperWidth);
	b.bold(false);

	if (data.cashReceived) {
		b.leftRight('Cash Received', data.cashReceived.toFixed(2), paperWidth);
		b.leftRight('Change', data.changeGiven.toFixed(2), paperWidth);
	}

	// Policies
	if (s.return_policy || s.exchange_policy || s.terms_conditions) {
		b.drawLine(paperWidth);
		if (s.return_policy) b.println('Return: ' + s.return_policy);
		if (s.exchange_policy) b.println('Exchange: ' + s.exchange_policy);
		if (s.terms_conditions) b.println('T&C: ' + s.terms_conditions);
	}

	// Social
	if (s.store_facebook || s.store_instagram) {
		b.newline();
		b.alignCenter();
		if (s.store_facebook) b.println('FB: ' + s.store_facebook);
		if (s.store_instagram) b.println('IG: ' + s.store_instagram);
	}

	// Footer
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

/**
 * Send a test print via Bluetooth.
 */
export async function testBluetoothPrint(): Promise<{ success: boolean; error?: string }> {
	if (!isConnected()) {
		return { success: false, error: 'Printer not connected' };
	}

	const paperWidth = localStorage.getItem('pos-bt-printer-width') === '58' ? 32 : 48;
	const b = new EscPosBuilder();

	b.init();
	b.alignCenter();
	b.bold(true);
	b.println('=== BT PRINTER TEST ===');
	b.bold(false);
	b.println('Connection: OK');
	b.println('Device: ' + (printerState.deviceName || 'Unknown'));
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
