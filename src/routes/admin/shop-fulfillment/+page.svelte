<script lang="ts">
	import { toast } from 'svelte-sonner';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	interface Item {
		id: string;
		name: string;
		fulfillmentType?: string;
		mailType?: string;
		weightGrams?: number;
		rubberStamps?: string;
		mailNotes?: string;
	}

	let items: Item[] = $state(data.items);
	let expandedItemId: string | null = $state(null);
	let saving: Record<string, boolean> = $state({});

	async function toggleFulfillmentType(itemId: string, type: 'JENIN_MAIL' | 'JENIN_ORDER' | null) {
		const item = items.find((i) => i.id === itemId);
		if (!item) return;

		// Toggle off if clicking same type
		if (item.fulfillmentType === type) {
			item.fulfillmentType = null;
		} else {
			item.fulfillmentType = type;
		}

		// Collapse if not JENIN_MAIL
		if (item.fulfillmentType !== 'JENIN_MAIL') {
			expandedItemId = null;
		} else if (item.fulfillmentType === 'JENIN_MAIL') {
			expandedItemId = itemId;
		}

		await saveItem(itemId);
	}

	async function updateMailConfig(itemId: string) {
		await saveItem(itemId);
	}

	async function saveItem(itemId: string) {
		const item = items.find((i) => i.id === itemId);
		if (!item) return;

		saving[itemId] = true;

		try {
			const res = await fetch('/api/admin/shop-items', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					itemId,
					fulfillmentType: item.fulfillmentType,
					mailType: item.mailType,
					weightGrams: item.weightGrams ? parseInt(item.weightGrams.toString()) : null,
					rubberStamps: item.rubberStamps,
					mailNotes: item.mailNotes
				})
			});

			if (!res.ok) {
				const error = await res.json();
				toast.error(`Failed to save: ${error.error}`);
				return;
			}

			toast.success('Fulfillment settings updated');
		} catch (error) {
			toast.error('Failed to save fulfillment settings');
			console.error(error);
		} finally {
			saving[itemId] = false;
		}
	}
</script>

<div class="mx-auto max-w-4xl space-y-6 p-6">
	<div>
		<h1 class="text-3xl font-bold">Shop Fulfillment Settings</h1>
		<p class="mt-2 text-stone-600">Configure how shop items are fulfilled</p>
	</div>

	<div class="space-y-4">
		{#each items as item (item.id)}
			<div class="border border-stone-200 rounded-lg p-4">
				<div class="flex items-center justify-between gap-4">
					<div class="flex-1">
						<h3 class="font-semibold">{item.name}</h3>
						<p class="text-sm text-stone-600">ID: {item.id}</p>
					</div>

					<div class="flex gap-4">
						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={item.fulfillmentType === 'JENIN_MAIL'}
								onchange={() => toggleFulfillmentType(item.id, 'JENIN_MAIL')}
								disabled={saving[item.id]}
								class="rounded"
							/>
							<span>JENIN_MAIL</span>
						</label>

						<label class="flex items-center gap-2 cursor-pointer">
							<input
								type="checkbox"
								checked={item.fulfillmentType === 'JENIN_ORDER'}
								onchange={() => toggleFulfillmentType(item.id, 'JENIN_ORDER')}
								disabled={saving[item.id]}
								class="rounded"
							/>
							<span>JENIN_ORDER</span>
						</label>
					</div>
				</div>

				{#if expandedItemId === item.id && item.fulfillmentType === 'JENIN_MAIL'}
					<div class="mt-4 space-y-4 border-t border-stone-200 pt-4">
						<div>
							<label class="block text-sm font-medium">Mail Type</label>
							<select
								bind:value={item.mailType}
								onchange={() => updateMailConfig(item.id)}
								disabled={saving[item.id]}
								class="mt-1 w-full rounded border border-stone-300 px-3 py-2"
							>
								<option value="">Select type...</option>
								<option value="lettermail">Lettermail (up to 30g)</option>
								<option value="bubble_packet">Bubble Packet (up to 500g)</option>
								<option value="parcel">Parcel (custom quote)</option>
							</select>
						</div>

						{#if item.mailType === 'bubble_packet' || item.mailType === 'parcel'}
							<div>
								<label class="block text-sm font-medium">Weight (grams)</label>
								<input
									type="number"
									bind:value={item.weightGrams}
									onchange={() => updateMailConfig(item.id)}
									disabled={saving[item.id]}
									placeholder="e.g., 250"
									class="mt-1 w-full rounded border border-stone-300 px-3 py-2"
								/>
							</div>
						{/if}

						<div>
							<label class="block text-sm font-medium">Rubber Stamps (items to pack)</label>
							<textarea
								bind:value={item.rubberStamps}
								onchange={() => updateMailConfig(item.id)}
								disabled={saving[item.id]}
								placeholder="List each item on its own line&#10;e.g. Sticker pack&#10;T-shirt"
								class="mt-1 w-full rounded border border-stone-300 px-3 py-2"
								rows="3"
							></textarea>
							<p class="mt-1 text-xs text-stone-500">
								Format text for physical rubber stamps (max ~11 chars per line)
							</p>
						</div>

						<div>
							<label class="block text-sm font-medium">Notes (optional)</label>
							<input
								type="text"
								bind:value={item.mailNotes}
								onchange={() => updateMailConfig(item.id)}
								disabled={saving[item.id]}
								placeholder="Additional metadata"
								class="mt-1 w-full rounded border border-stone-300 px-3 py-2"
							/>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	input[type='checkbox'] {
		accent-color: #000;
	}

	input:disabled,
	select:disabled,
	textarea:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
