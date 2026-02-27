import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/index.js';
import {
  orders, orderItems, customers, cashbook, stockLogs
} from '$lib/server/db/schema.js';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';

type Op = 'PUT' | 'PATCH' | 'DELETE';
interface CrudEntry {
  op: Op;
  table: string;
  id: string;
  opData?: Record<string, unknown>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) throw error(401, 'Unauthorized');

  const { batch }: { batch: CrudEntry[] } = await request.json();

  for (const entry of batch) {
    await applyEntry(entry, user.id);
  }

  return json({ ok: true });
};

async function applyEntry(entry: CrudEntry, userId: string) {
  const { op, table, id, opData } = entry;

  switch (table) {
    case 'orders': {
      if (op === 'PUT') {
        await db.insert(orders)
          .values({ ...opData, id, userId } as any)
          .onConflictDoUpdate({ target: orders.id, set: opData as any });
      } else if (op === 'DELETE') {
        await db.delete(orders).where(eq(orders.id, id));
      }
      break;
    }
    case 'order_items': {
      if (op === 'PUT') {
        await db.insert(orderItems)
          .values({ ...opData, id } as any)
          .onConflictDoUpdate({ target: orderItems.id, set: opData as any });
      } else if (op === 'DELETE') {
        await db.delete(orderItems).where(eq(orderItems.id, id));
      }
      break;
    }
    case 'customers': {
      if (op === 'PUT') {
        await db.insert(customers)
          .values({ ...opData, id } as any)
          .onConflictDoUpdate({ target: customers.id, set: opData as any });
      } else if (op === 'DELETE') {
        await db.delete(customers).where(eq(customers.id, id));
      }
      break;
    }
    case 'cashbook': {
      if (op === 'PUT') {
        await db.insert(cashbook)
          .values({ ...opData, id, userId } as any)
          .onConflictDoUpdate({ target: cashbook.id, set: opData as any });
      }
      break;
    }
    case 'stock_logs': {
      if (op === 'PUT') {
        await db.insert(stockLogs)
          .values({ ...opData, id, userId } as any)
          .onConflictDoUpdate({ target: stockLogs.id, set: opData as any });
      }
      break;
    }
    default:
      console.warn(`[sync/upload] No handler for table: ${table}`);
  }
}
