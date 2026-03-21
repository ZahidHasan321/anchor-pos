/**
 * Reactive printer status store.
 * Provides at-a-glance connection state for use in sidebar, POS page, etc.
 */

import { browser } from '$app/environment';
import {
	isBluetoothSupported,
	isConnected as isBtConnected,
	getConnectedPrinterName,
	connectPrinter
} from '$lib/bluetooth-printer';

export type PrinterStatus = 'connected' | 'disconnected' | 'connecting' | 'not-configured';

class PrinterState {
	status = $state<PrinterStatus>('not-configured');
	name = $state('');
	/** Whether any printer path is configured (thermal, BT, or system printer) */
	configured = $state(false);

	private interval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		if (browser) {
			this.refresh();
			// Poll every 3 seconds — BT connections can drop
			this.interval = setInterval(() => this.refresh(), 3000);
		}
	}

	refresh() {
		if (!browser) return;

		const isElectron =
			typeof window !== 'undefined' &&
			'electron' in window &&
			!!(window as any).electron?.getPrinters;

		// Check if any printer is configured
		const useThermal = localStorage.getItem('pos-use-thermal-printer') === 'true';
		const thermalInterface = localStorage.getItem('pos-thermal-printer-interface') || '';
		const useBt = localStorage.getItem('pos-use-bt-printer') === 'true';
		const savedPrinter = localStorage.getItem('pos-default-receipt-printer') || '';

		if (isElectron) {
			// Electron: thermal printer (USB/COM/BT COM port) or system printer
			if (useThermal && thermalInterface) {
				this.configured = true;
				// For file-based interfaces (COM ports, /dev/rfcomm), we can't check
				// connection status reliably — just show as configured/ready
				this.status = 'connected';
				this.name = thermalInterface.includes('COM')
					? `COM Port (${thermalInterface.split('\\').pop() || thermalInterface})`
					: thermalInterface.includes('/dev/')
						? thermalInterface.split('/').pop() || thermalInterface
						: thermalInterface.split('/').pop() || 'Thermal';
				return;
			}
			if (savedPrinter) {
				this.configured = true;
				this.status = 'connected';
				this.name = savedPrinter;
				return;
			}
			// Electron with no printer configured
			this.configured = false;
			this.status = 'not-configured';
			this.name = '';
			return;
		}

		// Web: Bluetooth
		if (useBt && isBluetoothSupported()) {
			this.configured = true;
			if (isBtConnected()) {
				this.status = 'connected';
				this.name = getConnectedPrinterName() || 'Bluetooth Printer';
			} else {
				this.status = 'disconnected';
				this.name = localStorage.getItem('pos-bt-printer-name') || '';
			}
			return;
		}

		// Nothing configured
		this.configured = false;
		this.status = 'not-configured';
		this.name = '';
	}

	async reconnect(): Promise<{ success: boolean; error?: string }> {
		if (!browser) return { success: false, error: 'Not in browser' };

		this.status = 'connecting';

		try {
			if (isBluetoothSupported()) {
				const result = await connectPrinter();
				this.refresh();
				return result;
			}

			return { success: false, error: 'Bluetooth not supported' };
		} catch (e: any) {
			this.refresh();
			return { success: false, error: e.message || 'Connection failed' };
		}
	}

	destroy() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}
}

export const printerState = new PrinterState();
