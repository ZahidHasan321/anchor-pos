import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency } from './format';

export type ReportPDFData = {
	storeName: string;
	periodLabel: string;
	dateRange: string;
	summaries: {
		salesSummary: { count: number; total: number; avgOrder: number; totalDiscount: number };
		expenseSummary: { total: number };
		itemsSold: number;
		grossProfit: number;
		netProfit: number;
		inventoryRetailValue: number;
		inventoryCostValue: number;
		totalStocked: number;
	};
	paymentBreakdown: Array<{ method: string; count: number; total: number }>;
	categoryBreakdown: Array<{ category: string; totalQty: number; totalRevenue: number }>;
	topProducts: Array<{ productName: string; totalQty: number; totalRevenue: number }>;
	expenseBreakdown: Array<{ description: string; total: number; count: number }>;
	refundSummary: Array<{ status: string; count: number; total: number }>;
	staffPerformance?: Array<{
		cashierName: string;
		orderCount: number;
		totalSales: number;
		avgOrder: number;
	}>;
	topCustomers?: Array<{
		customerName: string;
		orderCount: number;
		totalSpent: number;
	}>;
};

// Brand colors
const PRIMARY: [number, number, number] = [30, 64, 175]; // blue-800
const DARK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const SUCCESS: [number, number, number] = [22, 163, 74]; // green-600
const DANGER: [number, number, number] = [220, 38, 38]; // red-600
const WHITE: [number, number, number] = [255, 255, 255];
const LIGHT_BG: [number, number, number] = [248, 250, 252]; // slate-50
const BORDER: [number, number, number] = [226, 232, 240]; // slate-200

function pct(value: number, total: number): string {
	return total > 0 ? `${Math.round((value / total) * 100)}%` : '0%';
}

async function loadLogoAsDataUrl(): Promise<string | null> {
	try {
		const res = await fetch('/favicon.png');
		if (!res.ok) return null;
		const blob = await res.blob();
		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onloadend = () => resolve(reader.result as string);
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(blob);
		});
	} catch {
		return null;
	}
}

export async function exportReportPDF(data: ReportPDFData) {
	const logoDataUrl = await loadLogoAsDataUrl();
	const doc = new jsPDF('p', 'mm', 'a4');
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 16;
	const contentWidth = pageWidth - margin * 2;
	let y = 0;

	const addPageIfNeeded = (needed: number) => {
		if (y + needed > pageHeight - 20) {
			doc.addPage();
			y = margin + 4;
		}
	};

	// Helper: draw a rounded rect
	const roundedRect = (
		x: number,
		ry: number,
		w: number,
		h: number,
		r: number,
		fill: [number, number, number],
		stroke?: [number, number, number]
	) => {
		doc.setFillColor(...fill);
		if (stroke) {
			doc.setDrawColor(...stroke);
			doc.setLineWidth(0.3);
		}
		doc.roundedRect(x, ry, w, h, r, r, stroke ? 'FD' : 'F');
	};

	// Helper: section header with accent bar
	const sectionHeader = (title: string) => {
		addPageIfNeeded(16);
		y += 3;
		doc.setFillColor(...PRIMARY);
		doc.rect(margin, y, 3, 6, 'F');
		doc.setFontSize(11);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(...DARK);
		doc.text(title, margin + 6, y + 4.5);
		y += 10;
	};

	// ================================================
	// HEADER BANNER
	// ================================================
	doc.setFillColor(...PRIMARY);
	doc.rect(0, 0, pageWidth, 38, 'F');

	// Logo
	const logoSize = 16;
	const logoY = (38 - logoSize) / 2;
	let textStart = margin;
	if (logoDataUrl) {
		doc.addImage(logoDataUrl, 'PNG', margin, logoY, logoSize, logoSize);
		textStart = margin + logoSize + 4;
	}

	// Store name
	doc.setFontSize(20);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(...WHITE);
	doc.text(data.storeName || 'Store', textStart, 16);

	// Report subtitle
	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(200, 220, 255);
	doc.text('Sales & Financial Report', textStart, 23);

	// Period badge on the right
	doc.setFontSize(9);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(...WHITE);
	const periodText = `${data.periodLabel} — ${data.dateRange}`;
	doc.text(periodText, pageWidth - margin, 16, { align: 'right' });

	// Generated date
	doc.setFontSize(7);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(180, 200, 240);
	doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 23, {
		align: 'right'
	});

	y = 46;

	// ================================================
	// KPI HIGHLIGHT BOXES
	// ================================================
	const s = data.summaries;
	const kpis = [
		{
			label: 'Revenue',
			value: formatCurrency(s.salesSummary.total),
			sub: `${s.salesSummary.count} orders`
		},
		{
			label: 'Net Profit',
			value: formatCurrency(s.netProfit),
			sub: 'After expenses',
			color: s.netProfit >= 0 ? SUCCESS : DANGER
		},
		{
			label: 'Items Sold',
			value: String(s.itemsSold),
			sub: `Avg ${formatCurrency(s.salesSummary.avgOrder)}/order`
		},
		{
			label: 'Inventory',
			value: formatCurrency(s.inventoryRetailValue),
			sub: `Cost: ${formatCurrency(s.inventoryCostValue)}`
		}
	];

	const boxW = (contentWidth - 6) / 4;
	kpis.forEach((kpi, i) => {
		const bx = margin + i * (boxW + 2);
		roundedRect(bx, y, boxW, 24, 2, LIGHT_BG, BORDER);

		doc.setFontSize(7);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(...MUTED);
		doc.text(kpi.label.toUpperCase(), bx + 4, y + 6);

		doc.setFontSize(13);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(...(kpi.color || DARK));
		doc.text(kpi.value, bx + 4, y + 14);

		doc.setFontSize(6.5);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...MUTED);
		doc.text(kpi.sub, bx + 4, y + 19);
	});

	y += 30;

	// ================================================
	// SALES SUMMARY TABLE
	// ================================================
	sectionHeader('Sales Summary');

	autoTable(doc, {
		startY: y,
		margin: { left: margin, right: margin },
		theme: 'plain',
		styles: {
			fontSize: 9,
			cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
			textColor: DARK
		},
		columnStyles: {
			0: { fontStyle: 'normal', cellWidth: 55, textColor: MUTED },
			1: { halign: 'right', fontStyle: 'bold' }
		},
		alternateRowStyles: { fillColor: [248, 250, 252] },
		body: [
			['Total Revenue', formatCurrency(s.salesSummary.total)],
			['Total Orders', String(s.salesSummary.count)],
			['Items Sold', String(s.itemsSold)],
			['Avg Order Value', formatCurrency(s.salesSummary.avgOrder)],
			['Total Discounts', formatCurrency(s.salesSummary.totalDiscount)],
			['Gross Profit (Revenue - COGS)', formatCurrency(s.grossProfit)],
			['Total Expenses', formatCurrency(s.expenseSummary.total)],
			['Net Profit', formatCurrency(s.netProfit)],
			['Units Restocked', String(s.totalStocked)]
		]
	});
	y = (doc as any).lastAutoTable.finalY + 4;

	// ================================================
	// INVENTORY ASSETS
	// ================================================
	sectionHeader('Inventory Assets (Current)');

	autoTable(doc, {
		startY: y,
		margin: { left: margin, right: margin },
		theme: 'plain',
		styles: {
			fontSize: 9,
			cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
			textColor: DARK
		},
		columnStyles: {
			0: { fontStyle: 'normal', cellWidth: 55, textColor: MUTED },
			1: { halign: 'right', fontStyle: 'bold' }
		},
		alternateRowStyles: { fillColor: LIGHT_BG },
		body: [
			['Retail Value', formatCurrency(s.inventoryRetailValue)],
			['Cost Value', formatCurrency(s.inventoryCostValue)],
			['Potential Profit', formatCurrency(s.inventoryRetailValue - s.inventoryCostValue)]
		]
	});
	y = (doc as any).lastAutoTable.finalY + 4;

	// Helper for data tables
	const dataTable = (head: string[][], body: string[][]) => {
		autoTable(doc, {
			startY: y,
			margin: { left: margin, right: margin },
			theme: 'grid',
			headStyles: {
				fillColor: PRIMARY,
				textColor: WHITE,
				fontSize: 8,
				fontStyle: 'bold',
				cellPadding: { top: 3, bottom: 3, left: 4, right: 4 }
			},
			styles: {
				fontSize: 8.5,
				cellPadding: { top: 2.5, bottom: 2.5, left: 4, right: 4 },
				textColor: DARK,
				lineColor: BORDER,
				lineWidth: 0.2
			},
			alternateRowStyles: { fillColor: LIGHT_BG },
			head,
			body
		});
		y = (doc as any).lastAutoTable.finalY + 4;
	};

	// Null-safe arrays
	const _payments = data.paymentBreakdown ?? [];
	const _categories = data.categoryBreakdown ?? [];
	const _products = data.topProducts ?? [];
	const _staff = data.staffPerformance ?? [];
	const _customers = data.topCustomers ?? [];
	const _expenses = data.expenseBreakdown ?? [];
	const _refunds = data.refundSummary ?? [];

	// ================================================
	// PAYMENT METHODS
	// ================================================
	if (_payments.length > 0) {
		sectionHeader('Payment Methods');
		const totalPayments = _payments.reduce((sum, p) => sum + p.total, 0);
		dataTable(
			[['Method', 'Transactions', 'Amount', 'Share']],
			_payments.map((p) => [
				p.method.charAt(0).toUpperCase() + p.method.slice(1),
				String(p.count),
				formatCurrency(p.total),
				pct(p.total, totalPayments)
			])
		);
	}

	// ================================================
	// SALES BY CATEGORY
	// ================================================
	if (_categories.length > 0) {
		sectionHeader('Sales by Category');
		const totalCatRev = _categories.reduce((sum, c) => sum + c.totalRevenue, 0);
		dataTable(
			[['Category', 'Qty Sold', 'Revenue', 'Share']],
			_categories.map((c) => [
				c.category,
				String(c.totalQty),
				formatCurrency(c.totalRevenue),
				pct(c.totalRevenue, totalCatRev)
			])
		);
	}

	// ================================================
	// TOP PRODUCTS
	// ================================================
	if (_products.length > 0) {
		sectionHeader('Top Selling Products');
		dataTable(
			[['#', 'Product', 'Qty Sold', 'Revenue']],
			_products.map((p, i) => [
				String(i + 1),
				p.productName,
				String(p.totalQty),
				formatCurrency(p.totalRevenue)
			])
		);
	}

	// ================================================
	// STAFF PERFORMANCE
	// ================================================
	if (_staff.length > 0) {
		sectionHeader('Staff Performance');
		dataTable(
			[['Cashier', 'Orders', 'Total Sales', 'Avg Order']],
			_staff.map((st) => [
				st.cashierName,
				String(st.orderCount),
				formatCurrency(st.totalSales),
				formatCurrency(st.avgOrder)
			])
		);
	}

	// ================================================
	// TOP CUSTOMERS
	// ================================================
	if (_customers.length > 0) {
		sectionHeader('Top Customers');
		dataTable(
			[['Customer', 'Orders', 'Total Spent']],
			_customers.map((c) => [c.customerName, String(c.orderCount), formatCurrency(c.totalSpent)])
		);
	}

	// ================================================
	// EXPENSES
	// ================================================
	if (_expenses.length > 0) {
		sectionHeader('Expenses');
		dataTable(
			[['Description', 'Count', 'Total']],
			_expenses.map((e) => [e.description, String(e.count), formatCurrency(e.total)])
		);
	}

	// ================================================
	// REFUNDS
	// ================================================
	const totalRefunds = _refunds.reduce((s: number, r: { total: number }) => s + r.total, 0);
	if (totalRefunds > 0) {
		sectionHeader('Refunds & Voids');
		dataTable(
			[['Status', 'Count', 'Amount']],
			_refunds.map((r) => [
				r.status.charAt(0).toUpperCase() + r.status.slice(1),
				String(r.count),
				formatCurrency(r.total)
			])
		);
	}

	// ================================================
	// PAGE FOOTER on every page
	// ================================================
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);

		// Footer line
		doc.setDrawColor(...BORDER);
		doc.setLineWidth(0.3);
		doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

		// Left: store name
		doc.setFontSize(7);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...MUTED);
		doc.text(data.storeName || 'Store', margin, pageHeight - 9);

		// Center: page number
		doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 9, { align: 'center' });

		// Right: generated date
		doc.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 9, {
			align: 'right'
		});
	}

	// Open in new tab
	const blobUrl = doc.output('bloburl');
	window.open(blobUrl, '_blank');
}
