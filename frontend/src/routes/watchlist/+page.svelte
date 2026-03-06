<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { watchlistStore } from '$lib/stores/watchlist';
  import { fetchWatchlist } from '$lib/api';
  import { goto } from '$app/navigation';
  import WatchlistToggle from '$lib/components/WatchlistToggle.svelte';

  let products: any[] = $state([]);
  let loading = $state(true);
  let currentPage = $state(1);
  let totalPages = $state(1);
  const LIMIT = 12;

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  async function loadPage(page: number) {
    loading = true;
    const result = await fetchWatchlist({ page, limit: LIMIT });
    products = result.docs
      .map((doc: any) => doc.product)
      .filter((p: any) => p && typeof p === 'object');
    totalPages = result.totalPages || 1;
    currentPage = result.page || page;
    loading = false;
  }

  onMount(() => {
    if (!$authStore.isAuthenticated) {
      goto('/login');
      return;
    }
    loadPage(1);
  });

  // Reload when watchlist store changes (items added/removed from other pages)
  let prevSize = $state(0);
  $effect(() => {
    const size = $watchlistStore.items.size;
    if (prevSize !== 0 && size !== prevSize) {
      loadPage(currentPage);
    }
    prevSize = size;
  });
</script>

<svelte:head>
  <title>Watchlist - BidMo.to</title>
</svelte:head>

<div class="max-w-6xl mx-auto px-4 py-8">
  <!-- Page Header -->
  <div class="pb-3 mb-8" style="border-bottom: 2px solid var(--color-border);">
    <h1 class="headline-bh text-4xl">Watchlist</h1>
  </div>

  {#if loading}
    <!-- Skeleton Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each Array(4) as _}
        <div class="card-bh overflow-hidden">
          <div class="h-48 animate-pulse" style="background: var(--color-muted);"></div>
          <div class="p-4 space-y-3">
            <div class="h-5 w-3/4 animate-pulse" style="background: var(--color-muted);"></div>
            <div class="h-4 w-full animate-pulse" style="background: var(--color-muted);"></div>
            <div class="h-5 w-1/2 animate-pulse" style="background: var(--color-muted);"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if products.length === 0}
    <!-- Empty State -->
    <div class="card-bh p-12 text-center">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <h2 class="headline-bh text-2xl mb-2">Your watchlist is empty</h2>
      <p class="text-sm opacity-60 max-w-sm mx-auto mb-6">Browse products and tap the heart icon to save items you're interested in.</p>
      <a href="/products" class="btn-bh-red">Browse Products</a>
    </div>
  {:else}
    <!-- Product Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each products as product (product.id)}
        <a
          href="/products/{product.id}?from=watchlist"
          class="group block card-bh overflow-hidden no-underline text-inherit"
        >
          <!-- Image -->
          <div class="relative h-48 overflow-hidden" style="background: var(--color-muted);">
            {#if product.images && product.images.length > 0 && product.images[0].image}
              <img
                src={product.images[0].image.url}
                alt={product.images[0].image.alt || product.title}
                width="400"
                height="200"
                loading="lazy"
                class="w-full h-full object-cover"
              />
            {:else}
              <div class="w-full h-full flex items-center justify-center text-sm opacity-40">No Image</div>
            {/if}
            <div class="absolute top-2 right-2">
              <WatchlistToggle productId={product.id} size="sm" />
            </div>
          </div>

          <!-- Info -->
          <div class="p-4 flex flex-col flex-1">
            <h3 class="text-base font-bold mb-1 truncate">{product.title}</h3>
            <p class="text-sm opacity-60 mb-3 line-clamp-2 flex-1">{product.description?.substring(0, 100)}{product.description?.length > 100 ? '...' : ''}</p>

            <!-- Price -->
            <div class="mb-2">
              {#if product.currentBid}
                <span class="label-bh block">Current Bid</span>
                <span class="font-mono text-lg font-bold">{formatPrice(product.currentBid, product.seller?.currency)}</span>
              {:else}
                <span class="label-bh block">Starting Price</span>
                <span class="font-mono text-lg font-bold">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
              {/if}
            </div>

            <!-- Status Badge -->
            <span class="badge-bh w-fit"
              style="border: 1px solid var(--color-border);
                {product.status === 'available' ? 'color: var(--color-green); background: color-mix(in srgb, var(--color-green) 15%, transparent);' : ''}
                {product.status === 'sold' ? 'color: var(--color-red); background: color-mix(in srgb, var(--color-red) 15%, transparent);' : ''}
                {product.status === 'ended' ? 'background: var(--color-muted); opacity: 0.6;' : ''}"
            >
              {product.status}
            </span>
          </div>
        </a>
      {/each}
    </div>

    <!-- Pagination -->
    {#if totalPages > 1}
      <div class="flex justify-center items-center gap-4 mt-8 pt-4" style="border-top: 1px solid var(--color-border);">
        <button
          class="btn-bh"
          disabled={currentPage <= 1}
          onclick={() => loadPage(currentPage - 1)}
        >
          Previous
        </button>
        <span class="font-mono text-sm tracking-wider">{currentPage} / {totalPages}</span>
        <button
          class="btn-bh"
          disabled={currentPage >= totalPages}
          onclick={() => loadPage(currentPage + 1)}
        >
          Next
        </button>
      </div>
    {/if}
  {/if}
</div>
