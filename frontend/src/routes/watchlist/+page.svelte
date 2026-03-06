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

<div class="watchlist-page">
  <h1>Watchlist</h1>

  {#if loading}
    <div class="products-grid">
      {#each Array(4) as _}
        <div class="product-card skeleton-card">
          <div class="product-image skeleton-pulse"></div>
          <div class="product-info">
            <div class="skeleton-line skeleton-pulse" style="width:70%;height:1.2rem"></div>
            <div class="skeleton-line skeleton-pulse" style="width:90%;height:0.9rem;margin-top:0.5rem"></div>
            <div class="skeleton-line skeleton-pulse" style="width:50%;height:1rem;margin-top:0.75rem"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if products.length === 0}
    <div class="empty-state">
      <svg class="w-16 h-16 mx-auto mb-4 text-bh-muted-fg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <h2>Your watchlist is empty</h2>
      <p>Browse products and tap the heart icon to save items you're interested in.</p>
      <a href="/products" class="btn-bh-red mt-4 inline-block">Browse Products</a>
    </div>
  {:else}
    <div class="products-grid">
      {#each products as product (product.id)}
        <a href="/products/{product.id}?from=watchlist" class="product-card">
          <div class="product-image">
            {#if product.images && product.images.length > 0 && product.images[0].image}
              <img
                src={product.images[0].image.url}
                alt={product.images[0].image.alt || product.title}
                width="400"
                height="200"
                loading="lazy"
              />
            {:else}
              <div class="placeholder-image">
                <span>No Image</span>
              </div>
            {/if}
            <div class="watchlist-btn">
              <WatchlistToggle productId={product.id} size="sm" />
            </div>
          </div>
          <div class="product-info">
            <h3>{product.title}</h3>
            <p class="description">{product.description?.substring(0, 100)}{product.description?.length > 100 ? '...' : ''}</p>
            <div class="pricing">
              {#if product.currentBid}
                <span class="label-small">Current Bid:</span>
                <span class="price-large">{formatPrice(product.currentBid, product.seller?.currency)}</span>
              {:else}
                <span class="label-small">Starting Price:</span>
                <span class="price-large">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
              {/if}
            </div>
            <span class="status status-{product.status}">{product.status}</span>
          </div>
        </a>
      {/each}
    </div>

    {#if totalPages > 1}
      <div class="pagination">
        <button
          class="btn-bh"
          disabled={currentPage <= 1}
          onclick={() => loadPage(currentPage - 1)}
        >
          Previous
        </button>
        <span class="page-info">Page {currentPage} of {totalPages}</span>
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

<style>
  .watchlist-page {
    padding: 2rem 0;
  }

  h1 {
    font-size: 2rem;
    font-weight: 900;
    margin-bottom: 1.5rem;
    text-transform: uppercase;
    letter-spacing: -0.025em;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }

  .product-card {
    background: var(--color-surface);
    border: 2px solid var(--color-border);
    overflow: hidden;
    transition: all 0.15s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
  }

  .product-card:hover {
    background: var(--color-muted);
    border-color: var(--color-fg);
  }

  .product-image {
    position: relative;
    width: 100%;
    height: 200px;
    overflow: hidden;
    background-color: var(--color-muted);
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-muted);
    color: #999;
  }

  .watchlist-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .product-info {
    padding: 1.25rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .product-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.15rem;
    font-weight: 700;
  }

  .description {
    color: var(--color-muted-fg);
    margin-bottom: 0.75rem;
    flex: 1;
    font-size: 0.9rem;
  }

  .pricing {
    margin-bottom: 0.5rem;
  }

  .label-small {
    font-size: 0.75rem;
    color: var(--color-muted-fg);
    display: block;
  }

  .price-large {
    font-size: 1.2rem;
    font-weight: 800;
    color: var(--color-primary);
  }

  .status {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    border: 2px solid var(--color-border);
    width: fit-content;
  }

  .status-available { background: var(--color-green, #22c55e); color: white; }
  .status-sold { background: var(--color-red, #dc2626); color: white; }
  .status-ended { background: var(--color-muted, #888); color: white; }

  .empty-state {
    text-align: center;
    padding: 4rem 1rem;
  }

  .empty-state h2 {
    font-size: 1.5rem;
    font-weight: 800;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: var(--color-muted-fg);
    max-width: 400px;
    margin: 0 auto;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
  }

  .page-info {
    font-weight: 600;
  }

  .skeleton-card {
    pointer-events: none;
  }

  .skeleton-pulse {
    background: linear-gradient(90deg, var(--color-muted) 25%, #e0e0e0 50%, var(--color-muted) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-line {
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @media (max-width: 640px) {
    .products-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
