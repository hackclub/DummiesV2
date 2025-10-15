import { db } from '../src/lib/server/db';
import { rawUsers, shopItems, shopOrders } from '../src/lib/server/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { WebClient } from '@slack/web-api';
import { writeFileSync } from 'fs';
import path from 'path';
import * as readline from 'readline';

// Configuration
const HCBAPI_KEY = process.env.HCBAPI_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const HCB_API_URL = 'https://hcbapi.skyfall.dev/api/v4/organizations/boba-drops';
const AIRTABLE_BASE_ID = 'app1sLnxuQNDBZNju';
const AIRTABLE_TABLE_NAME = 'tblsbrzyPghuKgMyz';

const slack = new WebClient(SLACK_BOT_TOKEN);

interface HCBApiResponse {
	balance_cents: number;
}

interface PendingOrder {
	orderId: string;
	userId: string;
	itemId: string;
	itemName: string;
	usdCost: number;
	priceAtOrder: number;
	createdAt: Date;
	hcbMids: string[] | null;
}

interface GroupedOrder {
	userId: string;
	email: string;
	itemId: string;
	itemName: string;
	quantity: number;
	totalUsdCost: number;
	orderIds: string[];
	totalTokensSpent: number;
	hcbMids: string[] | null;
}

interface GrantAllocation {
	email: string;
	grantAmount: number;
	itemName: string;
	quantity: number;
	orderIds: string[];
	hcbMids: string[] | null;
}

interface HCBGrantRequest {
	amount_cents: number;
	email: string;
	merchant_lock: string | null;
	category_lock: string | null;
	keyword_lock: string | null;
	purpose: string | null;
}

interface AirtableRecord {
	id: string;
	fields: {
		'Slack ID'?: string;
		'Status'?: string;
		[key: string]: any;
	};
}

async function promptUser(question: string): Promise<boolean> {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			rl.close();
			const normalizedAnswer = answer.toLowerCase().trim();
			resolve(normalizedAnswer === 'y' || normalizedAnswer === 'yes');
		});
	});
}

async function fetchApprovedSlackIds(): Promise<Set<string>> {
	if (!AIRTABLE_API_KEY) {
		throw new Error('AIRTABLE_API_KEY environment variable is required for YSWS DB filtering');
	}

	console.log('Fetching approved Slack IDs from YSWS DB...');

	const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
	const headers = {
		Authorization: `Bearer ${AIRTABLE_API_KEY}`,
		'Content-Type': 'application/json'
	};

	let allRecords: AirtableRecord[] = [];
	let offset: string | null = null;

	do {
		const params = new URLSearchParams({
			filterByFormula: '{Status} = "Uploaded"',
			...(offset && { offset })
		});

		const response = await fetch(`${url}?${params}`, { headers });
		if (!response.ok) {
			throw new Error(`Failed to fetch Airtable records: ${response.status} ${response.statusText}`);
		}

		const data = await response.json();

		if (data.records) {
			allRecords = allRecords.concat(data.records);
		}

		offset = data.offset;
	} while (offset);

	// Extract unique Slack IDs
	const approvedSlackIds = new Set<string>();
	for (const record of allRecords) {
		const slackId = record.fields['Slack ID'];
		if (slackId) {
			approvedSlackIds.add(slackId);
		}
	}

	console.log(`Found ${approvedSlackIds.size} unique approved Slack IDs from YSWS DB`);
	return approvedSlackIds;
}

async function fetchHCBBalance(): Promise<number> {
	console.log('Fetching HCB organization balance...');

	if (!HCBAPI_KEY) {
		throw new Error('HCBAPI_KEY environment variable is required');
	}

	try {
		const response = await fetch(HCB_API_URL, {
			headers: {
				'Authorization': `Bearer ${HCBAPI_KEY}`,
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch HCB balance: ${response.status} ${response.statusText}`);
		}

		const data: HCBApiResponse = await response.json();
		const balanceDollars = data.balance_cents / 100;

		console.log(`HCB Balance: $${balanceDollars.toFixed(2)}`);
		return balanceDollars;
	} catch (error) {
		console.error('Error fetching HCB balance:', error);
		throw error;
	}
}

async function getEmailFromSlackId(userId: string): Promise<string | null> {
	try {
		const result = await slack.users.info({
			user: userId,
		});

		if (result.ok && result.user) {
			const email = result.user.profile?.email;
			return email || null;
		} else {
			console.error(`Failed to fetch user info for ${userId}:`, result.error);
			return null;
		}
	} catch (error) {
		console.error(`Error fetching user email for ${userId}:`, error);
		return null;
	}
}

async function fetchPendingHCBOrders(): Promise<PendingOrder[]> {
	console.log('Fetching pending HCB orders from database...');

	const orders = await db
		.select({
			orderId: shopOrders.id,
			userId: shopOrders.userId,
			itemId: shopOrders.shopItemId,
			itemName: shopItems.name,
			usdCost: shopItems.usd_cost,
			priceAtOrder: shopOrders.priceAtOrder,
			createdAt: shopOrders.createdAt,
			itemType: shopItems.type,
			hcbMids: shopItems.hcbMids
		})
		.from(shopOrders)
		.innerJoin(shopItems, eq(shopOrders.shopItemId, shopItems.id))
		.where(
			and(
				eq(shopOrders.status, 'pending'),
				eq(shopItems.type, 'hcb')
			)
		)
		.orderBy(shopOrders.createdAt);

	const pendingOrders: PendingOrder[] = orders
		.filter(order => order.usdCost && order.usdCost > 0)
		.map(order => ({
			orderId: order.orderId,
			userId: order.userId,
			itemId: order.itemId,
			itemName: order.itemName,
			usdCost: order.usdCost!,
			priceAtOrder: order.priceAtOrder,
			createdAt: order.createdAt,
			hcbMids: order.hcbMids
		}));

	console.log(`Found ${pendingOrders.length} pending HCB orders with USD costs`);
	return pendingOrders;
}

async function groupOrdersByUserAndItem(orders: PendingOrder[], approvedSlackIds?: Set<string>): Promise<GroupedOrder[]> {
	console.log('Grouping orders by user and item...');

	// Filter orders by approved Slack IDs if provided
	let filteredOrders = orders;
	if (approvedSlackIds) {
		const originalCount = orders.length;
		filteredOrders = orders.filter(order => approvedSlackIds.has(order.userId));
		console.log(`Filtered orders by YSWS DB approval: ${originalCount} → ${filteredOrders.length} orders`);
	}

	// Group orders by userId + itemId
	const grouped = new Map<string, GroupedOrder>();

	// Get all unique user IDs to fetch emails
	const userIds = [...new Set(filteredOrders.map(order => order.userId))];
	console.log(`Fetching emails for ${userIds.length} unique users...`);

	// Fetch emails for all users in parallel
	const emailPromises = userIds.map(async (userId) => {
		const email = await getEmailFromSlackId(userId);
		return { userId, email };
	});

	const userEmails = await Promise.all(emailPromises);
	const emailMap = new Map<string, string>();

	for (const { userId, email } of userEmails) {
		if (email) {
			emailMap.set(userId, email);
		} else {
			console.warn(`No email found for user ${userId}`);
		}
	}

	// Group the orders
	for (const order of filteredOrders) {
		const key = `${order.userId}-${order.itemId}`;
		const email = emailMap.get(order.userId);

		if (!email) {
			console.warn(`Skipping order ${order.orderId} - no email for user ${order.userId}`);
			continue;
		}

		if (!grouped.has(key)) {
			grouped.set(key, {
				userId: order.userId,
				email,
				itemId: order.itemId,
				itemName: order.itemName,
				quantity: 0,
				totalUsdCost: 0,
				orderIds: [],
				totalTokensSpent: 0,
				hcbMids: order.hcbMids
			});
		}

		const group = grouped.get(key)!;
		group.quantity += 1;
		group.totalUsdCost += order.usdCost;
		group.orderIds.push(order.orderId);
		group.totalTokensSpent += order.priceAtOrder;
	}

	const result = Array.from(grouped.values());
	console.log(`Grouped into ${result.length} unique user-item combinations`);

	return result;
}

function optimizeGrantAllocation(groupedOrders: GroupedOrder[], budget: number): GrantAllocation[] {
	console.log(`\nOptimizing grant allocation with budget: $${budget.toFixed(2)}`);

	// Sort by priority: earliest order first (FIFO), then by smallest grant amount
	const sortedOrders = [...groupedOrders].sort((a, b) => {
		// First, sort by total USD cost (smaller grants first to maximize coverage)
		const costDiff = a.totalUsdCost - b.totalUsdCost;
		if (costDiff !== 0) return costDiff;

		// Then by user (for consistency)
		return a.userId.localeCompare(b.userId);
	});

	const allocations: GrantAllocation[] = [];
	let remainingBudget = budget;

	console.log('\nEvaluating grants in order of priority:');

	for (const order of sortedOrders) {
		if (order.totalUsdCost <= remainingBudget) {
			allocations.push({
				email: order.email,
				grantAmount: order.totalUsdCost,
				itemName: order.itemName,
				quantity: order.quantity,
				orderIds: order.orderIds,
				hcbMids: order.hcbMids
			});

			remainingBudget -= order.totalUsdCost;
			console.log(`✓ Allocated $${order.totalUsdCost.toFixed(2)} to ${order.email} for ${order.quantity}x ${order.itemName}`);
		} else {
			console.log(`✗ Cannot allocate $${order.totalUsdCost.toFixed(2)} to ${order.email} for ${order.quantity}x ${order.itemName} (insufficient budget: $${remainingBudget.toFixed(2)})`);
		}
	}

	console.log(`\nRemaining budget: $${remainingBudget.toFixed(2)}`);
	return allocations;
}

function createHCBGrantRequests(allocations: GrantAllocation[]): HCBGrantRequest[] {
	console.log('\nCreating HCB grant request data...');

	const grantRequests: HCBGrantRequest[] = [];

	for (const allocation of allocations) {
		const purpose = allocation.itemName.length <= 30
			? allocation.itemName
			: allocation.itemName.substring(0, 30);

		const merchantLock = allocation.hcbMids && allocation.hcbMids.length > 0
			? allocation.hcbMids.join(',')
			: null;

		grantRequests.push({
			amount_cents: Math.round(allocation.grantAmount * 100),
			email: allocation.email,
			merchant_lock: merchantLock,
			category_lock: null,
			keyword_lock: null,
			purpose: purpose
		});

		console.log(`- ${allocation.email}: $${allocation.grantAmount.toFixed(2)} for ${allocation.itemName}${merchantLock ? ` (MIDs: ${merchantLock})` : ''}`);
	}

	return grantRequests;
}

function writeGrantRequestsToFile(grantRequests: HCBGrantRequest[], allocations: GrantAllocation[]): void {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filename = `grant-requests-${timestamp}.json`;
	const filepath = path.join(process.cwd(), 'scripts', filename);

	const output = {
		timestamp: new Date().toISOString(),
		total_grants: grantRequests.length,
		total_amount_dollars: grantRequests.reduce((sum, req) => sum + (req.amount_cents / 100), 0),
		grant_requests: grantRequests,
		allocation_details: allocations
	};

	writeFileSync(filepath, JSON.stringify(output, null, 2));
	console.log(`\nGrant requests written to: ${filename}`);
}

async function main() {
	try {
		console.log('=== HCB Grant Giver ===\n');

		// Prompt user for YSWS DB filtering
		const useYswsDbFilter = await promptUser('Only include users with YSWS DB approved submissions? (y/n): ');

		let approvedSlackIds: Set<string> | undefined;
		if (useYswsDbFilter) {
			try {
				approvedSlackIds = await fetchApprovedSlackIds();
			} catch (error) {
				console.error('Failed to fetch approved Slack IDs from YSWS DB:', error);
				console.log('Continuing without YSWS DB filtering...\n');
				approvedSlackIds = undefined;
			}
		} else {
			console.log('Proceeding without YSWS DB filtering...\n');
		}

		// Fetch HCB balance
		const budget = await fetchHCBBalance();

		// Fetch pending HCB orders
		const pendingOrders = await fetchPendingHCBOrders();

		if (pendingOrders.length === 0) {
			console.log('No pending HCB orders found. Nothing to process.');
			return;
		}

		// Group orders by user and item
		const groupedOrders = await groupOrdersByUserAndItem(pendingOrders, approvedSlackIds);

		if (groupedOrders.length === 0) {
			console.log('No orders with valid emails found. Nothing to process.');
			return;
		}

		// Calculate total requested
		const totalRequested = groupedOrders.reduce((sum, order) => sum + order.totalUsdCost, 0);
		console.log(`\nTotal grant amount requested: $${totalRequested.toFixed(2)}`);
		console.log(`Available budget: $${budget.toFixed(2)}`);

		if (totalRequested <= budget) {
			console.log('✓ Budget is sufficient to fulfill all requests');
		} else {
			console.log(`⚠️  Budget shortfall: $${(totalRequested - budget).toFixed(2)}`);
			console.log('Will optimize to maximize grants within budget...');
		}

		// Optimize grant allocation
		const allocations = optimizeGrantAllocation(groupedOrders, budget);

		// Output results
		console.log('\n=== GRANT ALLOCATION RESULTS ===');

		if (allocations.length === 0) {
			console.log('No grants can be allocated within the current budget.');
			return;
		}

		const totalAllocated = allocations.reduce((sum, alloc) => sum + alloc.grantAmount, 0);

		console.log(`\nSUMMARY:`);
		console.log(`Total grants: ${allocations.length}`);
		console.log(`Total amount: $${totalAllocated.toFixed(2)}`);
		console.log(`Budget utilization: ${((totalAllocated / budget) * 100).toFixed(1)}%`);

		console.log(`\nDETAILS:`);
		console.log('Email\t\t\t\tGrant Amount\tItem\t\t\tQuantity');
		console.log('─'.repeat(80));

		for (const allocation of allocations) {
			const email = allocation.email.padEnd(30);
			const amount = `$${allocation.grantAmount.toFixed(2)}`.padEnd(12);
			const item = allocation.itemName.padEnd(20);
			const quantity = allocation.quantity.toString();

			console.log(`${email}\t${amount}\t${item}\t${quantity}`);
		}

		console.log('\n=== JSON OUTPUT ===');
		console.log(JSON.stringify(allocations, null, 2));

		// Create HCB grant requests and write to file
		const grantRequests = createHCBGrantRequests(allocations);
		writeGrantRequestsToFile(grantRequests, allocations);

		// Show unfulfilled orders
		const fulfilledOrderIds = new Set(allocations.flatMap(alloc => alloc.orderIds));
		const unfulfilledOrders = groupedOrders.filter(order =>
			!order.orderIds.some(id => fulfilledOrderIds.has(id))
		);

		if (unfulfilledOrders.length > 0) {
			console.log('\n=== UNFULFILLED ORDERS ===');
			const unfulfilledAmount = unfulfilledOrders.reduce((sum, order) => sum + order.totalUsdCost, 0);
			console.log(`${unfulfilledOrders.length} orders could not be fulfilled due to budget constraints`);
			console.log(`Unfulfilled amount: $${unfulfilledAmount.toFixed(2)}`);

			console.log('\nUnfulfilled details:');
			for (const order of unfulfilledOrders) {
				console.log(`- ${order.email}: ${order.quantity}x ${order.itemName} ($${order.totalUsdCost.toFixed(2)})`);
			}
		}

	} catch (error) {
		console.error('Error in grant giver:', error);
		process.exit(1);
	}
}

// Run the script
main();
