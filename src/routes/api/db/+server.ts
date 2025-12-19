import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';

const API_KEY = env.DATABASE_API_KEY;

export async function POST({ request }) {
	
	const url = new URL(request.url);
	if (url.searchParams.get('key') !== API_KEY) {
		return json({ error: 'Invalid key' }, { status: 401 });
	}

	
	const formData = await request.formData();
	const query = formData.get('query');

	if (!query) {
		return json({ error: 'No query provided' }, { status: 400 });
	}

	try {
		const result = await db.execute(sql.raw(query));
		return json({ 
			success: true, 
			data: result.rows || result 
		});
	} catch (error) {
		return json({ 
			error: error.message 
		}, { status: 500 });
	}
}
