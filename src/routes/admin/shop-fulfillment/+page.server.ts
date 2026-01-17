import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { shopItems } from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.isAdmin) {
		throw redirect(302, '/');
	}

	const items = await db.select().from(shopItems).orderBy(shopItems.name);

	return {
		items
	};
};
