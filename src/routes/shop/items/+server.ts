import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shopItems } from '$lib/server/db/schema';

export async function GET() {
  const items = await db.select().from(shopItems);
  return json(items);
}

export async function POST({ request }) {
  const { shopItemId, userId } = await request.json();

  // Example logic to handle order creation
  const order = await db.insertInto('shopOrders').values({
    shopItemId,
    userId,
    status: 'pending',
    createdAt: new Date()
  });

  return json({ success: true, order });
}