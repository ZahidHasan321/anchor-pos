import { browser } from '$app/environment';

type CartItem = {
	variantId: string;
	productId: string;
	productName: string;
	size: string;
	color: string | null;
	barcode: string;
	price: number;
	discount: number;
	quantity: number;
	maxStock: number;
};

type CustomerInfo = {
	id: string;
	name: string;
	phone: string | null;
} | null;

function createCart() {
	let items = $state<CartItem[]>([]);
	let customer = $state<CustomerInfo>(null);
	let paymentMethod = $state<'cash' | 'card'>('cash');
	let cashReceived = $state(0);
	let globalDiscount = $state(0);

	const subtotal = $derived(
		items.reduce((sum, item) => {
			const linePrice = item.price * item.quantity;
			const lineDiscount = linePrice * (item.discount / 100);
			return sum + (linePrice - lineDiscount);
		}, 0) *
			(1 - globalDiscount / 100)
	);

	const totalItems = $derived(items.reduce((sum, item) => sum + item.quantity, 0));
	const changeAmount = $derived(Math.max(0, cashReceived - subtotal));

	return {
		get items() {
			return items;
		},
		get customer() {
			return customer;
		},
		get paymentMethod() {
			return paymentMethod;
		},
		set paymentMethod(v: 'cash' | 'card') {
			paymentMethod = v;
		},
		get cashReceived() {
			return cashReceived;
		},
		set cashReceived(v: number) {
			cashReceived = v;
		},
		get globalDiscount() {
			return globalDiscount;
		},
		set globalDiscount(v: number) {
			globalDiscount = v;
		},
		get subtotal() {
			return subtotal;
		},
		get totalItems() {
			return totalItems;
		},
		get changeAmount() {
			return changeAmount;
		},

		addItem(item: Omit<CartItem, 'quantity'>) {
			const existing = items.find((i) => i.variantId === item.variantId);
			if (existing) {
				if (existing.quantity < existing.maxStock) {
					existing.quantity += 1;
				}
			} else {
				items.push({ ...item, quantity: 1 });
			}
		},

		removeItem(variantId: string) {
			items = items.filter((i) => i.variantId !== variantId);
		},

		updateQuantity(variantId: string, qty: number) {
			const item = items.find((i) => i.variantId === variantId);
			if (!item) return;
			if (qty <= 0) {
				items = items.filter((i) => i.variantId !== variantId);
			} else if (qty <= item.maxStock) {
				item.quantity = qty;
			}
		},

		updateItemDiscount(variantId: string, discount: number) {
			const item = items.find((i) => i.variantId === variantId);
			if (item) item.discount = Math.max(0, Math.min(100, discount));
		},

		setCustomer(c: CustomerInfo) {
			customer = c;
		},

		clear() {
			items = [];
			customer = null;
			paymentMethod = 'cash';
			cashReceived = 0;
			globalDiscount = 0;
		}
	};
}

export const cart = createCart();
