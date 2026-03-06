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

<div class="flex items-center justify-center min-h-[60vh]">
  <div class="text-center">
    <p class="label-bh mb-2">Loading</p>
    <p class="font-sans text-lg" style="color: var(--color-muted-fg);">Redirecting to Browse Products...</p>
  </div>
</div>
