<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  onMount(() => {
    goto('/products', { replaceState: true });
  });
</script>

<svelte:head>
  <title>BidMo.to - Browse Auctions</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[60vh] text-lg text-bh-fg/60">
  <p>Redirecting to Browse Products...</p>
</div>
