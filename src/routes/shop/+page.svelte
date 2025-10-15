<script>
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import ItemCard from '$lib/components/shop/item-card.svelte';

  let shopItems = [];

  onMount(async () => {
    const response = await fetch('/shop/items');
    shopItems = await response.json();
  });
</script>

<h1>Shop</h1>
<div class="shop-grid">
  {#each shopItems as item}
    <ItemCard {item} userTokens={100} />
  {/each}
</div>

<style>
  .shop-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }
</style>