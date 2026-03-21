import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * PDF-safe currency formatter.
 * jsPDF's built-in fonts can't render Unicode symbols like ৳ (BDT taka),
 * so we use "BDT" prefix + plain number formatting instead.
 */
function formatCurrency(amount: number | null | undefined): string {
	const n = Number(amount ?? 0);
	const formatted = n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
	return `BDT ${formatted}`;
}

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

// Clean document colors — no UI colors
const BLACK: [number, number, number] = [33, 33, 33];
const GRAY: [number, number, number] = [120, 120, 120];
const LIGHT_GRAY: [number, number, number] = [200, 200, 200];
const ZEBRA: [number, number, number] = [245, 245, 245];
const HEAD_BG: [number, number, number] = [240, 240, 240];
const WHITE: [number, number, number] = [255, 255, 255];

function pct(value: number, total: number): string {
	return total > 0 ? `${Math.round((value / total) * 100)}%` : '-';
}

export async function exportReportPDF(data: ReportPDFData) {
	const doc = new jsPDF('p', 'mm', 'a4');
	const pageWidth = doc.internal.pageSize.getWidth();
	const pageHeight = doc.internal.pageSize.getHeight();
	const margin = 18;
	const contentWidth = pageWidth - margin * 2;
	let y = margin;

	const addPageIfNeeded = (needed: number) => {
		if (y + needed > pageHeight - 22) {
			doc.addPage();
			y = margin;
		}
	};

	// ── HEADER ──────────────────────────────────────────
	doc.setFontSize(18);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(...BLACK);
	doc.text(data.storeName || 'Store', margin, y + 6);

	doc.setFontSize(10);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(...GRAY);
	doc.text('Sales & Financial Report', margin, y + 12);

	// Period — right aligned
	doc.setFontSize(10);
	doc.setFont('helvetica', 'bold');
	doc.setTextColor(...BLACK);
	doc.text(data.dateRange, pageWidth - margin, y + 6, { align: 'right' });

	doc.setFontSize(8);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(...GRAY);
	doc.text(`Period: ${data.periodLabel}`, pageWidth - margin, y + 12, { align: 'right' });

	y += 16;

	// Divider
	doc.setDrawColor(...LIGHT_GRAY);
	doc.setLineWidth(0.4);
	doc.line(margin, y, pageWidth - margin, y);
	y += 8;

	// ── KEY FIGURES ─────────────────────────────────────
	const s = data.summaries;

	const keyFigures = (label: string, value: string, x: number) => {
		doc.setFontSize(7);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...GRAY);
		doc.text(label.toUpperCase(), x, y);
		doc.setFontSize(14);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(...BLACK);
		doc.text(value, x, y + 6);
	};

	const colW = contentWidth / 4;
	keyFigures('Revenue', formatCurrency(s.salesSummary.total), margin);
	keyFigures('Net Profit', formatCurrency(s.netProfit), margin + colW);
	keyFigures('Items Sold', String(Number(s.itemsSold)), margin + colW * 2);
	keyFigures('Orders', String(Number(s.salesSummary.count)), margin + colW * 3);

	y += 12;

	// Sub-stats line
	doc.setFontSize(7.5);
	doc.setFont('helvetica', 'normal');
	doc.setTextColor(...GRAY);
	doc.text(
		`Avg Order: ${formatCurrency(s.salesSummary.avgOrder)}  |  Gross Profit: ${formatCurrency(s.grossProfit)}  |  Expenses: ${formatCurrency(s.expenseSummary.total)}  |  Discounts: ${formatCurrency(s.salesSummary.totalDiscount)}`,
		margin,
		y
	);
	y += 6;

	// Divider
	doc.setDrawColor(...LIGHT_GRAY);
	doc.line(margin, y, pageWidth - margin, y);
	y += 6;

	// ── HELPER: Section title ───────────────────────────
	const section = (title: string) => {
		addPageIfNeeded(18);
		y += 2;
		doc.setFontSize(10);
		doc.setFont('helvetica', 'bold');
		doc.setTextColor(...BLACK);
		doc.text(title, margin, y + 3);
		y += 7;
	};

	// ── HELPER: Clean data table ────────────────────────
	const table = (
		head: string[][],
		body: string[][],
		columnStyles?: Record<number, any>
	) => {
		autoTable(doc, {
			startY: y,
			margin: { left: margin, right: margin },
			theme: 'plain',
			headStyles: {
				fillColor: HEAD_BG,
				textColor: BLACK,
				fontSize: 7.5,
				fontStyle: 'bold',
				cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
				lineWidth: 0
			},
			styles: {
				fontSize: 8,
				cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
				textColor: BLACK,
				lineColor: LIGHT_GRAY,
				lineWidth: 0
			},
			alternateRowStyles: { fillColor: ZEBRA },
			columnStyles: columnStyles || {},
			head,
			body
		});
		y = (doc as any).lastAutoTable.finalY + 5;
	};

	// ── HELPER: Key-value summary table ─────────────────
	const kvTable = (rows: [string, string][]) => {
		autoTable(doc, {
			startY: y,
			margin: { left: margin, right: margin },
			theme: 'plain',
			styles: {
				fontSize: 8,
				cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
				textColor: BLACK
			},
			columnStyles: {
				0: { textColor: GRAY, cellWidth: 60 },
				1: { halign: 'right', fontStyle: 'bold' }
			},
			alternateRowStyles: { fillColor: ZEBRA },
			body: rows
		});
		y = (doc as any).lastAutoTable.finalY + 5;
	};

	// ── SALES SUMMARY ───────────────────────────────────
	section('Sales Summary');
	kvTable([
		['Total Revenue', formatCurrency(s.salesSummary.total)],
		['Total Orders', String(Number(s.salesSummary.count))],
		['Items Sold', String(Number(s.itemsSold))],
		['Average Order Value', formatCurrency(s.salesSummary.avgOrder)],
		['Total Discounts Given', formatCurrency(s.salesSummary.totalDiscount)],
		['Gross Profit (Revenue - COGS)', formatCurrency(s.grossProfit)],
		['Total Expenses', formatCurrency(s.expenseSummary.total)],
		['Net Profit', formatCurrency(s.netProfit)],
		['Units Restocked', String(Number(s.totalStocked))]
	]);

	// ── INVENTORY ───────────────────────────────────────
	section('Inventory Valuation');
	kvTable([
		['Retail Value (at selling price)', formatCurrency(s.inventoryRetailValue)],
		['Cost Value (at purchase price)', formatCurrency(s.inventoryCostValue)],
		['Unrealized Margin', formatCurrency(s.inventoryRetailValue - s.inventoryCostValue)]
	]);

	// ── PAYMENTS ────────────────────────────────────────
	const _payments = data.paymentBreakdown ?? [];
	if (_payments.length > 0) {
		const totalPay = _payments.reduce((sum, p) => sum + Number(p.total), 0);
		section('Payment Methods');
		table(
			[['Method', 'Transactions', 'Amount', 'Share']],
			_payments.map((p) => [
				p.method.charAt(0).toUpperCase() + p.method.slice(1),
				String(Number(p.count)),
				formatCurrency(p.total),
				pct(Number(p.total), totalPay)
			]),
			{ 2: { halign: 'right' }, 3: { halign: 'right' } }
		);
	}

	// ── CATEGORIES ──────────────────────────────────────
	const _categories = data.categoryBreakdown ?? [];
	if (_categories.length > 0) {
		const totalCat = _categories.reduce((sum, c) => sum + Number(c.totalRevenue), 0);
		section('Sales by Category');
		table(
			[['Category', 'Qty Sold', 'Revenue', 'Share']],
			_categories.map((c) => [
				c.category,
				String(Number(c.totalQty)),
				formatCurrency(c.totalRevenue),
				pct(Number(c.totalRevenue), totalCat)
			]),
			{ 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
		);
	}

	// ── TOP PRODUCTS ────────────────────────────────────
	const _products = data.topProducts ?? [];
	if (_products.length > 0) {
		section('Top Selling Products');
		table(
			[['#', 'Product', 'Qty', 'Revenue']],
			_products.map((p, i) => [
				String(i + 1),
				p.productName,
				String(Number(p.totalQty)),
				formatCurrency(p.totalRevenue)
			]),
			{ 0: { cellWidth: 10, halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
		);
	}

	// ── STAFF ───────────────────────────────────────────
	const _staff = data.staffPerformance ?? [];
	if (_staff.length > 0) {
		section('Staff Performance');
		table(
			[['Cashier', 'Orders', 'Sales', 'Avg Order']],
			_staff.map((st) => [
				st.cashierName,
				String(Number(st.orderCount)),
				formatCurrency(st.totalSales),
				formatCurrency(st.avgOrder)
			]),
			{ 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
		);
	}

	// ── CUSTOMERS ───────────────────────────────────────
	const _customers = data.topCustomers ?? [];
	if (_customers.length > 0) {
		section('Top Customers');
		table(
			[['Customer', 'Orders', 'Total Spent']],
			_customers.map((c) => [
				c.customerName,
				String(Number(c.orderCount)),
				formatCurrency(c.totalSpent)
			]),
			{ 1: { halign: 'right' }, 2: { halign: 'right' } }
		);
	}

	// ── EXPENSES ────────────────────────────────────────
	const _expenses = data.expenseBreakdown ?? [];
	if (_expenses.length > 0) {
		section('Expenses');
		table(
			[['Description', 'Count', 'Total']],
			_expenses.map((e) => [e.description, String(Number(e.count)), formatCurrency(e.total)]),
			{ 1: { halign: 'right' }, 2: { halign: 'right' } }
		);
	}

	// ── REFUNDS ─────────────────────────────────────────
	const _refunds = data.refundSummary ?? [];
	const totalRefunds = _refunds.reduce((sum, r) => sum + Number(r.total), 0);
	if (totalRefunds > 0) {
		section('Refunds & Voids');
		table(
			[['Status', 'Count', 'Amount']],
			_refunds.map((r) => [
				r.status.charAt(0).toUpperCase() + r.status.slice(1),
				String(Number(r.count)),
				formatCurrency(r.total)
			]),
			{ 1: { halign: 'right' }, 2: { halign: 'right' } }
		);
	}

	// ── PAGE FOOTER ─────────────────────────────────────
	const pageCount = doc.getNumberOfPages();
	for (let i = 1; i <= pageCount; i++) {
		doc.setPage(i);

		doc.setDrawColor(...LIGHT_GRAY);
		doc.setLineWidth(0.3);
		doc.line(margin, pageHeight - 14, pageWidth - margin, pageHeight - 14);

		doc.setFontSize(7);
		doc.setFont('helvetica', 'normal');
		doc.setTextColor(...GRAY);
		doc.text(data.storeName || 'Store', margin, pageHeight - 9);
		doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 9, { align: 'center' });
		doc.text(`Generated ${new Date().toLocaleDateString('en-GB')}`, pageWidth - margin, pageHeight - 9, {
			align: 'right'
		});
	}

	window.open(doc.output('bloburl'), '_blank');
}
