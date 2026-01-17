import { JENIN_MAIL_API_KEY } from '$env/static/private';

export interface JeninMailAddress {
	first_name: string;
	last_name: string;
	address_line_1: string;
	address_line_2?: string;
	city: string;
	state: string;
	postal_code: string;
	country: string;
	email?: string;
}

export interface LetterPayload extends JeninMailAddress {
	mail_type: 'lettermail' | 'bubble_packet' | 'parcel';
	weight_grams?: number;
	rubber_stamps: string;
	notes?: string;
	recipient_email?: string;
}

export interface OrderPayload extends JeninMailAddress {
	order_text: string;
}

export async function sendLetter(payload: LetterPayload): Promise<{ letter_id: string }> {
	const response = await fetch('https://jenin-mail.hackclub.com/api/v1/letters', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${JENIN_MAIL_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to send letter: ${error}`);
	}

	return response.json();
}

export async function sendOrder(payload: OrderPayload): Promise<{ order_id: string }> {
	const response = await fetch('https://jenin-mail.hackclub.com/api/v1/order', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${JENIN_MAIL_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Failed to create order: ${error}`);
	}

	return response.json();
}
