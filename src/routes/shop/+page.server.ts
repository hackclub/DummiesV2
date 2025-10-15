import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shopItems } from '$lib/server/db/schema';

export async function load() {
  const items = await db.select().from(shopItems);
  return json(items);
}