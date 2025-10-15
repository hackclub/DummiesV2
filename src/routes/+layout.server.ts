import { db, usersWithTokens } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { redirect } from '@sveltejs/kit';
import { symmetric } from '$lib/server/crypto';
import { SESSIONS_SECRET } from '$env/static/private';

export async function load({ cookies, locals }) {
	const session = cookies.get('_boba_mahad_says_hi_session');

	if (session) {
		const slackId = await symmetric.decrypt(session, SESSIONS_SECRET);
		if (slackId) {
			throw redirect(302, '/shop');
		}
	}

	return {
		user: locals.user
	};
}
