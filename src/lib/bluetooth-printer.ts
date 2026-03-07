/**
 * Bluetooth thermal printer module.
 *
 * Two transports:
 * 1. Capacitor Native (Android/iOS) — Classic Bluetooth SPP via capacitor-thermal-printer plugin
 * 2. Web Bluetooth API — BLE fallback for browsers (Chrome)
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ============================================================
// Platform detection
// ============================================================

export function isCapacitorNative(): boolean {
	return (
		typeof window !== 'undefined' &&
		'Capacitor' in window &&
		(window as any).Capacitor?.isNativePlatform?.() === true
	);
}

export function isBluetoothSupported(): boolean {
	if (isCapacitorNative()) return true;
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

export type DiscoveredDevice = { name: string; address: string };

// ============================================================
// Capacitor Native transport
// ============================================================

let capPlugin: any = null;
let capDiscoveredDevices: DiscoveredDevice[] = [];
let capScanCallbacks: Array<(devices: DiscoveredDevice[]) => void> = [];
let capScanFinishCallbacks: Array<() => void> = [];
let capConnectedDevice: { name: string; address: string } | null = null;
let capConnectedFlag = false;

async function getCapPlugin(): Promise<any> {
	if (!capPlugin) {
		const mod = await import('capacitor-thermal-printer');
		capPlugin = mod.CapacitorThermalPrinter;

		capPlugin.addListener('discoverDevices', (event: any) => {
			const devices = event?.devices ?? (Array.isArray(event) ? event : []);
			capDiscoveredDevices = devices;
			capScanCallbacks.forEach((cb) => cb(devices));
		});

		capPlugin.addListener('discoveryFinish', () => {
			capScanFinishCallbacks.forEach((cb) => cb());
		});

		capPlugin.addListener('connected', (device: any) => {
			capConnectedFlag = true;
			if (device) capConnectedDevice = device;
		});

		capPlugin.addListener('disconnected', () => {
			capConnectedFlag = false;
			capConnectedDevice = null;
		});
	}
	return capPlugin;
}

export async function scanDevices(): Promise<void> {
	const plugin = await getCapPlugin();
	capDiscoveredDevices = [];
	await plugin.startScan();
}

export async function stopScan(): Promise<void> {
	const plugin = await getCapPlugin();
	await plugin.stopScan();
}

export function getDiscoveredDevices(): DiscoveredDevice[] {
	return capDiscoveredDevices;
}

export function onDevicesDiscovered(callback: (devices: DiscoveredDevice[]) => void): () => void {
	capScanCallbacks.push(callback);
	return () => {
		capScanCallbacks = capScanCallbacks.filter((cb) => cb !== callback);
	};
}

export function onScanFinished(callback: () => void): () => void {
	capScanFinishCallbacks.push(callback);
	return () => {
		capScanFinishCallbacks = capScanFinishCallbacks.filter((cb) => cb !== callback);
	};
}

export async function connectToDevice(
	address: string
): Promise<{ success: boolean; name?: string; error?: string }> {
	try {
		const plugin = await getCapPlugin();
		const device = await plugin.connect({ address });
		if (device) {
			capConnectedFlag = true;
			capConnectedDevice = device;
			localStorage.setItem('pos-bt-printer-name', device.name || 'Thermal Printer');
			localStorage.setItem('pos-bt-printer-address', address);
			return { success: true, name: device.name || 'Thermal Printer' };
		}
		return { success: false, error: 'Failed to connect to device' };
	} catch (e: any) {
		return { success: false, error: e.message || 'Connection failed' };
	}
}

async function capDisconnect(): Promise<void> {
	try {
		const plugin = await getCapPlugin();
		await plugin.disconnect();
	} catch {
		// ignore
	}
	capConnectedFlag = false;
	capConnectedDevice = null;
}

async function capIsConnected(): Promise<boolean> {
	try {
		const plugin = await getCapPlugin();
		const result = await plugin.isConnected();
		capConnectedFlag = typeof result === 'boolean' ? result : !!result?.value;
		return capConnectedFlag;
	} catch {
		return false;
	}
}

function leftRightStr(left: string, right: string, width: number): string {
	const gap = width - left.length - right.length;
	if (gap > 0) return left + ' '.repeat(gap) + right;
	return left + ' ' + right;
}

async function printReceiptNative(
	data: BluetoothReceiptData
): Promise<{ success: boolean; error?: string }> {
	try {
		const plugin = await getCapPlugin();

		const connected = await capIsConnected();
		if (!connected) {
			const lastAddr = localStorage.getItem('pos-bt-printer-address');
			if (lastAddr) {
				const r = await connectToDevice(lastAddr);
				if (!r.success) return r;
			} else {
				return { success: false, error: 'No printer connected. Set up in Settings.' };
			}
		}

		const pw = localStorage.getItem('pos-bt-printer-width') === '80' ? 48 : 32;
		const s = data.storeSettings;

		plugin.begin();

		// Header
		plugin.align('center');
		plugin.doubleHeight(true);
		plugin.bold(true);
		plugin.text((s.store_name || 'STORE').toUpperCase() + '\n');
		plugin.doubleHeight(false);
		plugin.bold(false);

		if (s.store_address) plugin.text(s.store_address + '\n');
		if (s.store_phone) plugin.text('Phone: ' + s.store_phone + '\n');
		if (s.store_email) plugin.text(s.store_email + '\n');
		if (s.store_tax_id) plugin.text('VAT: ' + s.store_tax_id + '\n');
		if (s.store_bin) plugin.text('BIN: ' + s.store_bin + '\n');

		plugin.text('-'.repeat(pw) + '\n');
		plugin.align('left');
		plugin.text('Order: ' + data.orderId + (data.isReprint ? ' (REPRINT)' : '') + '\n');
		plugin.text('Date: ' + data.date + '\n');
		plugin.text('Cashier: ' + data.cashier + '\n');
		plugin.text('-'.repeat(pw) + '\n');

		// Column header
		plugin.bold(true);
		plugin.text(leftRightStr('Item', 'Qty   Total', pw) + '\n');
		plugin.bold(false);

		// Items
		for (const item of data.items) {
			const qtyStr = item.qty.toString().padStart(3);
			const totalStr = item.total.toFixed(2).padStart(8);
			const right = qtyStr + totalStr;
			const maxName = pw - right.length - 1;
			const name = item.name.length > maxName ? item.name.substring(0, maxName) : item.name;
			plugin.text(leftRightStr(name, right, pw) + '\n');
			if (item.variant) {
				plugin.text('  ' + item.variant + '\n');
			}
		}

		plugin.text('-'.repeat(pw) + '\n');

		// Totals
		plugin.bold(true);
		plugin.text(leftRightStr('TOTAL', data.total.toFixed(2), pw) + '\n');
		plugin.bold(false);

		if (data.cashReceived) {
			plugin.text(leftRightStr('Cash Received', data.cashReceived.toFixed(2), pw) + '\n');
			plugin.text(leftRightStr('Change', data.changeGiven.toFixed(2), pw) + '\n');
		}

		// Policies
		if (s.return_policy || s.exchange_policy || s.terms_conditions) {
			plugin.text('-'.repeat(pw) + '\n');
			if (s.return_policy) plugin.text('Return: ' + s.return_policy + '\n');
			if (s.exchange_policy) plugin.text('Exchange: ' + s.exchange_policy + '\n');
			if (s.terms_conditions) plugin.text('T&C: ' + s.terms_conditions + '\n');
		}

		// Social
		if (s.store_facebook || s.store_instagram) {
			plugin.text('\n');
			plugin.align('center');
			if (s.store_facebook) plugin.text('FB: ' + s.store_facebook + '\n');
			if (s.store_instagram) plugin.text('IG: ' + s.store_instagram + '\n');
		}

		// Footer
		plugin.text('\n');
		plugin.align('center');
		plugin.text((s.receipt_footer || 'Thank you!') + '\n');
		plugin.text('*** End of Receipt ***\n');
		plugin.text('\n\n\n');
		plugin.cutPaper();

		await plugin.write();
		return { success: true };
	} catch (e: any) {
		return { success: false, error: e.message || 'Failed to send data to printer' };
	}
}

async function testPrintNative(): Promise<{ success: boolean; error?: string }> {
	try {
		const plugin = await getCapPlugin();

		const connected = await capIsConnected();
		if (!connected) return { success: false, error: 'Printer not connected' };

		const pw = localStorage.getItem('pos-bt-printer-width') === '80' ? 48 : 32;

		plugin.begin();
		plugin.align('center');
		plugin.bold(true);
		plugin.text('=== BT PRINTER TEST ===\n');
		plugin.bold(false);
		plugin.text('Connection: OK\n');
		plugin.text('Device: ' + (capConnectedDevice?.name || 'Unknown') + '\n');
		plugin.text('-'.repeat(pw) + '\n');
		plugin.text('ABCDabcd1234!@#$\n');
		plugin.text('Bluetooth test passed.\n');
		plugin.text('-'.repeat(pw) + '\n');
		plugin.text('\n\n\n');
		plugin.cutPaper();

		await plugin.write();
		return { success: true };
	} catch (e: any) {
		return { success: false, error: e.message || 'Failed to send test data' };
	}
}

// ============================================================
// Web Bluetooth (BLE) transport — fallback for browsers
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

const PRINTER_SERVICE_UUIDS = [
	'0000ff00-0000-1000-8000-00805f9b34fb',
	'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
	'49535343-fe7d-4ae5-8fa9-9fafd205e455'
];

const PRINTER_WRITE_CHAR_UUIDS = [
	'0000ff02-0000-1000-8000-00805f9b34fb',
	'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
	'49535343-8841-43f4-a8d4-ecbe34729bb3'
];

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const BLE_CHUNK_SIZE = 100;
const BLE_CHUNK_DELAY = 50;

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

async function webBtConnect(): Promise<{ success: boolean; name?: string; error?: string }> {
	if (!navigator.bluetooth) {
		return { success: false, error: 'Web Bluetooth is not supported on this device/browser' };
	}

	try {
		if (webBt.server?.connected) webBt.server.disconnect();

		const device = await navigator.bluetooth!.requestDevice({
			filters: PRINTER_SERVICE_UUIDS.map((uuid) => ({ services: [uuid] })),
			optionalServices: PRINTER_SERVICE_UUIDS
		});

		if (!device) return { success: false, error: 'No printer selected' };

		const server = await device.gatt!.connect();
		let writeChar: BluetoothRemoteGATTCharacteristic | null = null;

		for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
			try {
				const service = await server.getPrimaryService(serviceUuid);
				const chars = await service.getCharacteristics();

				for (const charUuid of PRINTER_WRITE_CHAR_UUIDS) {
					const found = chars.find((c: any) => c.uuid === charUuid);
					if (found && (found.properties.write || found.properties.writeWithoutResponse)) {
						writeChar = found;
						break;
					}
				}

				if (!writeChar) {
					writeChar =
						chars.find(
							(c: any) => c.properties.writeWithoutResponse || c.properties.write
						) ?? null;
				}

				if (writeChar) break;
			} catch {
				continue;
			}
		}

		if (!writeChar) {
			server.disconnect();
			return { success: false, error: 'No writable characteristic found on printer' };
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
		if (e.name === 'NotFoundError') return { success: false, error: 'No printer selected (cancelled)' };
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

// --- ESC/POS Command Builder (for Web Bluetooth BLE path) ---

class EscPosBuilder {
	private buffer: number[] = [];

	init(): this {
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
				for (const serviceUuid of PRINTER_SERVICE_UUIDS) {
					try {
						const service = await server.getPrimaryService(serviceUuid);
						const chars = await service.getCharacteristics();
						const wc =
							chars.find(
								(c: any) => c.properties.writeWithoutResponse || c.properties.write
							) ?? null;
						if (wc) {
							webBt.writeCharacteristic = wc;
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

	b.bold(true);
	b.leftRight('Item', 'Qty   Total', paperWidth);
	b.bold(false);

	for (const item of data.items) {
		const qtyStr = item.qty.toString().padStart(3);
		const totalStr = item.total.toFixed(2).padStart(8);
		const right = qtyStr + totalStr;
		const maxName = paperWidth - right.length - 1;
		const name = item.name.length > maxName ? item.name.substring(0, maxName) : item.name;
		b.leftRight(name, right, paperWidth);
		if (item.variant) b.println('  ' + item.variant);
	}

	b.drawLine(paperWidth);
	b.bold(true);
	b.leftRight('TOTAL', data.total.toFixed(2), paperWidth);
	b.bold(false);

	if (data.cashReceived) {
		b.leftRight('Cash Received', data.cashReceived.toFixed(2), paperWidth);
		b.leftRight('Change', data.changeGiven.toFixed(2), paperWidth);
	}

	if (s.return_policy || s.exchange_policy || s.terms_conditions) {
		b.drawLine(paperWidth);
		if (s.return_policy) b.println('Return: ' + s.return_policy);
		if (s.exchange_policy) b.println('Exchange: ' + s.exchange_policy);
		if (s.terms_conditions) b.println('T&C: ' + s.terms_conditions);
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
// Unified public API
// ============================================================

export function getConnectedPrinterName(): string {
	if (isCapacitorNative()) {
		return capConnectedDevice?.name || localStorage.getItem('pos-bt-printer-name') || '';
	}
	return webBt.deviceName;
}

export function isConnected(): boolean {
	if (isCapacitorNative()) return capConnectedFlag;
	return webBtIsConnected();
}

/**
 * Connect to a printer.
 * - Capacitor native: reconnects to last known device, or returns error prompting scan.
 * - Web: shows the browser's Bluetooth device picker.
 */
export async function connectPrinter(): Promise<{
	success: boolean;
	name?: string;
	error?: string;
}> {
	if (isCapacitorNative()) {
		const lastAddress = localStorage.getItem('pos-bt-printer-address');
		if (lastAddress) return connectToDevice(lastAddress);
		return { success: false, error: 'Use the scanner to find and select a printer first.' };
	}
	return webBtConnect();
}

export function disconnectPrinter() {
	if (isCapacitorNative()) {
		capDisconnect();
		localStorage.removeItem('pos-bt-printer-name');
		localStorage.removeItem('pos-bt-printer-address');
		return;
	}
	webBtDisconnect();
}

export async function printBluetoothReceipt(
	data: BluetoothReceiptData
): Promise<{ success: boolean; error?: string }> {
	if (isCapacitorNative()) return printReceiptNative(data);
	return webBtPrintReceipt(data);
}

export async function testBluetoothPrint(): Promise<{ success: boolean; error?: string }> {
	if (isCapacitorNative()) return testPrintNative();
	return webBtTestPrint();
}
