<script lang="ts">
  export let params: any = undefined; // SvelteKit passes this automatically
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/products', { replaceState: true });
  });
</script>

<svelte:head>
  <title>BidMo.to - Browse Auctions</title>
</svelte:head>

<div class="loading-redirect">
  <p>Redirecting to Browse Products...</p>
</div>

<style>
  .loading-redirect {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    font-size: 1.2rem;
    color: #666;
  }
</style>
