<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { watchlistStore } from '$lib/stores/watchlist';
  import { t } from '$lib/stores/locale';
  import { fetchWatchlist } from '$lib/api';
  import { goto } from '$app/navigation';
  import WatchlistToggle from '$lib/components/WatchlistToggle.svelte';
  import ProductCardSkeleton from '$lib/components/ProductCardSkeleton.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';

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
  <title>{$t('watchlist.title')} - BidMo.to</title>
</svelte:head>

<div class="watchlist-page">
  <h1>{$t('watchlist.title')}</h1>

  {#if loading}
    <div class="products-grid">
      {#each Array(4) as _}
        <ProductCardSkeleton />
      {/each}
    </div>
  {:else if products.length === 0}
    <EmptyState
      icon="💛"
      title={$t('watchlist.empty')}
      message={$t('watchlist.emptyDesc')}
      actionLabel={$t('watchlist.browseProducts')}
      actionHref="/products"
    />
  {:else}
    <div class="products-grid">
      {#each products as product (product.id)}
        <a href="/products/{product.id}?from=watchlist" class="product-card">
          <div class="product-image">
            {#if product.images && product.images.length > 0 && product.images[0].image}
              <img
                src={product.images[0].image.sizes?.thumbnail?.url || product.images[0].image.url}
                alt={product.images[0].image.alt || product.title}
                width="400"
                height="200"
                loading="lazy"
              />
            {:else}
              <div class="placeholder-image">
                <span>{$t('watchlist.noImage')}</span>
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
                <span class="label-small">{$t('watchlist.currentBid')}</span>
                <span class="price-large">{formatPrice(product.currentBid, product.seller?.currency)}</span>
              {:else}
                <span class="label-small">{$t('watchlist.startingPrice')}</span>
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
          {$t('watchlist.previous')}
        </button>
        <span class="page-info">{$t('products.page', { current: currentPage, total: totalPages })}</span>
        <button
          class="btn-bh"
          disabled={currentPage >= totalPages}
          onclick={() => loadPage(currentPage + 1)}
        >
          {$t('watchlist.next')}
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

  @media (max-width: 640px) {
    .products-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
