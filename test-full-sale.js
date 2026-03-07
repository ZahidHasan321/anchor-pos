const baseUrl = 'https://anchorshop.cloud';
const appSecret = 'auto-pos-secret-handshake-2026';
const userId = '986bd1a6-483e-4d36-b04d-b4047566eeed';

async function testFullSale() {
    const orderId = 'test-sale-' + Date.now();
    const itemId = 'test-item-' + Date.now();

    const mutations = [
        {
            table: 'orders',
            op: 'PUT',
            id: orderId,
            opData: {
                total_amount: 2500.00,
                payment_method: 'split',
                cash_amount: 1000.00,
                card_amount: 1500.00,
                status: 'completed',
                created_at: new Date().toISOString()
            }
        },
        {
            table: 'order_items',
            op: 'PUT',
            id: itemId,
            opData: {
                order_id: orderId,
                product_name: 'Test Product (Remote)',
                quantity: 2,
                price_at_sale: 1250.00,
                variant_label: 'L / Blue',
                status: 'completed'
            }
        }
    ];

    console.log(`[Test] Uploading multi-mutation sale to ${baseUrl}...`);
    
    try {
        const res = await fetch(`${baseUrl}/api/powersync/upload`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-app-secret': appSecret,
                'x-user-id': userId
            },
            body: JSON.stringify({ mutations })
        });

        const status = res.status;
        const body = await res.json();

        console.log(`[Test] Status: ${status}`);
        console.log(`[Test] Response:`, JSON.stringify(body, null, 2));

        if (status === 200 && body.success) {
            console.log('[Test] SUCCESS: Multi-table transaction committed.');
        } else {
            console.error('[Test] FAILED: Server rejected transaction.', body);
        }
    } catch (e) {
        console.error('[Test] ERROR:', e);
    }
}

testFullSale();
