import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { shopItems } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is admin
		if (!locals.user?.isAdmin) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const {
			itemId,
			fulfillmentType,
			mailType,
			weightGrams,
			rubberStamps,
			mailNotes
		} = await request.json();

		if (!itemId) {
			return json({ error: 'Item ID is required' }, { status: 400 });
		}

		// Build update data
		const updateData: Record<string, any> = {
			fulfillmentType: fulfillmentType || null
		};

		// Only include mail-specific fields if fulfillmentType is JENIN_MAIL
		if (fulfillmentType === 'JENIN_MAIL') {
			updateData.mailType = mailType || null;
			updateData.weightGrams = weightGrams ? parseInt(weightGrams.toString()) : null;
			updateData.rubberStamps = rubberStamps || null;
			updateData.mailNotes = mailNotes || null;
		} else {
			// Clear mail-specific fields if not JENIN_MAIL
			updateData.mailType = null;
			updateData.weightGrams = null;
			updateData.rubberStamps = null;
			updateData.mailNotes = null;
		}

		const updatedItem = await db
			.update(shopItems)
			.set(updateData)
			.where(eq(shopItems.id, itemId))
			.returning();

		if (!updatedItem.length) {
			return json({ error: 'Item not found' }, { status: 404 });
		}

		return json({
			success: true,
			item: updatedItem[0],
			message: 'Shop item fulfillment settings updated successfully'
		});
	} catch (error) {
		console.error('Shop item update error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
