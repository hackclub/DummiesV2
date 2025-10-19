import { db, shopItems } from '$lib/server/db';

export async function load() {
  const items = await db.select().from(shopItems);
  return {
    items
  };
}