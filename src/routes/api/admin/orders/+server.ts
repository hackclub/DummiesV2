import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { shopItems, shopOrders } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { WebClient } from '@slack/web-api';
import { SLACK_BOT_TOKEN, LOOPS_API_KEY } from '$env/static/private';

const slack = new WebClient(SLACK_BOT_TOKEN);

async function getEmailFromSlackId(userId: string): Promise<string | null> {
	try {
		const result = await slack.users.info({
			user: userId,
		});

		if (result.ok && result.user) {
			const email = result.user.profile?.email;

			if (email) {
				return email;
			} else {
				console.log(`No email found for user ID: ${userId}`);
				return null;
			}
		} else {
			console.error('Failed to fetch user info:', result.error);
			return null;
		}
	} catch (error) {
		console.error('Error fetching user email:', error);
		return null;
	}
}

export const PATCH: RequestHandler = async ({ request, locals }) => {
	try {
		// Check if user is admin
		if (!locals.user?.isAdmin) {
			return json({ error: 'Access denied' }, { status: 403 });
		}

		const { orderId, status, memo } = await request.json();

		if (!orderId || !status) {
			return json({ error: 'Order ID and status are required' }, { status: 400 });
		}

		// Validate status
		if (!['fulfilled', 'rejected'].includes(status)) {
			return json({ error: 'Invalid status' }, { status: 400 });
		}

		// Update the order
		const updateData: { status: string; memo?: string } = { status };
		if (memo !== undefined) {
			updateData.memo = memo;
		}

		const updatedOrder = await db
			.update(shopOrders)
			.set(updateData)
			.where(eq(shopOrders.id, orderId))
			.returning();

		if (!updatedOrder.length) {
			return json({ error: 'Order not found' }, { status: 404 });
		}

		const email = await getEmailFromSlackId(updatedOrder[0].userId);
		if (email) {
			const [shopItem] = await db
				.select()
				.from(shopItems)
				.where(eq(shopItems.id, updatedOrder[0].shopItemId));
			const res = await fetch("https://app.loops.so/api/v1/transactional", {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${LOOPS_API_KEY}`,
				},
				body: JSON.stringify({
					transactionalId: status === "fulfilled" ? "cmge904kq3fil070i2582g0yx" : "cmge93a9544ogzf0ijfkx26y3",
					email,
					dataVariables: {
						itemName: shopItem.name,
						orderId: updatedOrder[0].id.slice(0, 8),
						memo: memo || 'Unknown reason.',
					}
				})
			})
			if (!res.ok) {
				console.error('Failed to send email notification:', await res.text());
			}
		}

		return json({
			success: true,
			order: updatedOrder[0],
			message: `Order ${status} successfully`
		});
	} catch (error) {
		console.error('Order update error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
