import { getCurrencySymbol } from './format';

export type ReceiptData = {
	storeSettings: {
		store_name?: string;
		store_address?: string;
		store_phone?: string;
		store_email?: string;
		store_website?: string;
		store_tax_id?: string;
		receipt_footer?: string;
		return_policy?: string;
		exchange_policy?: string;
		terms_conditions?: string;
		tax_enabled?: string;
		tax_rate?: string;
		sd_enabled?: string;
		sd_rate?: string;
		store_facebook?: string;
		store_instagram?: string;
		store_currency?: string;
		store_bin?: string;
	};
	orderId: string;
	orderUuid?: string;
	date: string;
	cashier: string;
	items: Array<{ name: string; variant: string; qty: number; total: number }>;
	total: number;
	cashReceived: number;
	changeGiven: number;
	footerNote?: string;
	isReprint?: boolean;
};

export async function printReceipt(data: ReceiptData, preview = false): Promise<{ success: boolean; error?: string } | void> {
	const s = data.storeSettings;
	const symbol = getCurrencySymbol();

	const itemsHtml = data.items
		.map(
			(item) => `<tr>
				<td style="padding-bottom: 4px;">${item.name}<br/><small>${item.variant}</small></td>
				<td style="text-align:center">${item.qty}</td>
				<td style="text-align:right">${item.total.toFixed(2)}</td>
			</tr>`
		)
		.join('');

	const html = `<!DOCTYPE html>
<html><head><title>Receipt ${data.orderId}</title>
<style>
	@page {
		size: 72mm auto;
		margin: 0;
	}
	@media print {
		.no-print { display: none !important; }
	}
	* {
		box-sizing: border-box;
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}
	html, body {
		margin: 0;
		padding: 0;
		width: 72mm;
		max-width: 72mm;
		background: #fff;
	}
	body {
		font-family: 'Courier New', Courier, monospace;
		font-size: 12px;
		line-height: 1.2;
		color: #000;
		padding: 2mm;
	}
	#receipt {
		width: 100%;
		margin: 0;
		overflow: hidden;
	}
	.center { text-align: center; }
	.bold { font-weight: bold; }
	.line { border-top: 1px dashed #000; margin: 8px 0; }
	table { width: 100%; border-collapse: collapse; margin: 8px 0; }
	td { padding: 4px 0; vertical-align: top; }
	.store-name { font-size: 18px; font-weight: bold; margin-bottom: 2px; }
	.total-line { font-size: 15px; font-weight: bold; }
	.policy-box { font-size: 10px; margin-top: 8px; line-height: 1.1; }
	.footer { margin-top: 15px; font-size: 10px; }
	.feed-cut {
		height: 15mm;
		width: 100%;
		display: block;
	}
	.no-print-btn {
		background: #000;
		color: #fff;
		border: none;
		padding: 10px 20px;
		width: 100%;
		font-weight: bold;
		margin-bottom: 10px;
		cursor: pointer;
	}
</style></head><body>
	<div id="receipt">
		<div class="center">
			<div class="store-name">${s.store_name ?? 'Store'}</div>
			${s.store_address ? `<div style="font-size: 11px;">${s.store_address}</div>` : ''}
			${s.store_phone ? `<div style="font-size: 11px;">Phone: ${s.store_phone}</div>` : ''}
			${s.store_email ? `<div style="font-size: 11px;">${s.store_email}</div>` : ''}
			${s.store_tax_id ? `<div style="font-size: 11px; margin-top: 2px;">VAT/TAX ID: ${s.store_tax_id}</div>` : ''}
			${s.store_bin ? `<div style="font-size: 11px; margin-top: 2px;">BIN: ${s.store_bin}</div>` : ''}
		</div>

		<div class="line"></div>

		<div style="font-size: 11px;">
			<div>Order: ${data.orderId}${data.isReprint ? ' (REPRINT)' : ''}</div>
			<div>Date: ${data.date}</div>
			<div>Cashier: ${data.cashier}</div>
		</div>

		<div class="line"></div>

		<table>
			<thead>
				<tr class="bold" style="border-bottom: 1px solid #000;">
					<td style="width: 55%">Item</td>
					<td style="text-align:center; width: 20%">Qty</td>
					<td style="text-align:right; width: 25%">Total</td>
				</tr>
			</thead>
			<tbody>
				${itemsHtml}
			</tbody>
		</table>

		<div class="line"></div>

		<table>
			<tr class="total-line">
				<td>TOTAL</td>
				<td style="text-align:right">${symbol}${data.total.toFixed(2)}</td>
			</tr>
			<tr style="font-size: 11px;">
				<td>Cash Received</td>
				<td style="text-align:right">${symbol}${data.cashReceived.toFixed(2)}</td>
			</tr>
			<tr style="font-size: 11px;">
				<td>Change Given</td>
				<td style="text-align:right">${symbol}${data.changeGiven.toFixed(2)}</td>
			</tr>
		</table>

		<div class="line"></div>

		${s.return_policy ? `<div class="policy-box"><strong>Return Policy:</strong><br/>${s.return_policy}</div>` : ''}
		${s.exchange_policy ? `<div class="policy-box"><strong>Exchange Policy:</strong><br/>${s.exchange_policy}</div>` : ''}
		${s.terms_conditions ? `<div class="policy-box"><strong>Terms & Conditions:</strong><br/>${s.terms_conditions}</div>` : ''}

		<div class="center" style="margin-top: 10px; font-size: 10px;">
			${s.store_facebook ? `<div>FB: ${s.store_facebook}</div>` : ''}
			${s.store_instagram ? `<div>IG: ${s.store_instagram}</div>` : ''}
		</div>

		<div class="center footer">
			<div style="font-weight: bold; margin-bottom: 4px;">
				${s.receipt_footer ?? 'Thank you for shopping with us!'}
			</div>
			${data.footerNote ? `<div style="font-size: 9px; opacity: 0.8;">${data.footerNote}</div>` : ''}
			<div style="margin: 10px 0; display: flex; justify-content: center;">
				<div id="qrcode"></div>
			</div>
			<div style="margin-top: 4px; font-size: 9px;">*** End of Receipt ***</div>
		</div>
		<div class="feed-cut"></div>
	</div>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
	<script>
		window.onload = function() {
			try {
				new QRCode(document.getElementById("qrcode"), {
					text: "${data.orderUuid || data.orderId}",
					width: 80,
					height: 80,
					colorDark : "#000000",
					colorLight : "#ffffff",
					correctLevel : QRCode.CorrectLevel.M
				});
			} catch (e) {
				console.error("QR Code generation failed", e);
			}
		};
	</script>
</body></html>`;

	// --- Native Electron Printing ---
	// @ts-ignore - window.electron is injected by preload script
	if (typeof window !== 'undefined' && window.electron?.printToDevice) {
		const savedPrinter = localStorage.getItem('pos-default-receipt-printer');
		try {
			// @ts-ignore
			const result = await window.electron.printToDevice(html, savedPrinter || '', !preview);
			return result;
		} catch (e) {
			console.error('printToDevice failed, falling back:', e);
			// fall through to web printing
		}
	// @ts-ignore
	} else if (typeof window !== 'undefined' && window.electron?.printNative) {
		// @ts-ignore
		window.electron.printNative(html, preview);
		return { success: true };
	}

	// --- Standard Web Printing (Fallback) ---
	// Use a hidden iframe — avoids popup blockers and works across Chrome, Firefox, Safari
	const iframe = document.createElement('iframe');
	iframe.style.position = 'fixed';
	iframe.style.width = '0';
	iframe.style.height = '0';
	iframe.style.border = 'none';
	iframe.style.left = '-9999px';
	document.body.appendChild(iframe);

	const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
	if (!iframeDoc) {
		document.body.removeChild(iframe);
		return;
	}

	iframeDoc.open();
	iframeDoc.write(html);
	iframeDoc.close();

	const cleanup = () => {
		if (iframe.parentNode) {
			document.body.removeChild(iframe);
		}
	};

	iframe.onload = () => {
		try {
			iframe.contentWindow?.focus();
			iframe.contentWindow?.print();
		} catch {
			// Safari may block cross-origin iframe print, fall back to popup
			cleanup();
			const pw = window.open('', '_blank');
			if (!pw) return;
			pw.document.open();
			pw.document.write(html);
			pw.document.close();
			pw.addEventListener('afterprint', () => pw.close());
			setTimeout(() => pw.close(), 5000);
			return;
		}

		// Chrome/Firefox support afterprint on the iframe's window
		iframe.contentWindow?.addEventListener('afterprint', cleanup);
		// Fallback cleanup for Safari / browsers without afterprint
		setTimeout(cleanup, 5000);
	};
}
