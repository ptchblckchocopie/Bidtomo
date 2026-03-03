<script lang="ts">
  import { watchlistStore } from '$lib/stores/watchlist';

  let { productId, size = 'md' }: { productId: string; size?: 'sm' | 'md' | 'lg' } = $props();

  let loading = $state(false);
  let isWatched = $derived($watchlistStore.items.has(productId));

  const sizeMap = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  const padMap = {
    sm: 'p-1',
    md: 'p-1.5',
    lg: 'p-2',
  };

  async function toggle(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    loading = true;
    try {
      if (isWatched) {
        await watchlistStore.remove(productId);
      } else {
        await watchlistStore.add(productId);
      }
    } finally {
      loading = false;
    }
  }
</script>

<button
  onclick={toggle}
  class="watchlist-toggle {padMap[size]} {loading ? 'opacity-50' : ''}"
  class:watched={isWatched}
  title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
  aria-label={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
  disabled={loading}
>
  <svg
    class="{sizeMap[size]} transition-all duration-150"
    viewBox="0 0 24 24"
    fill={isWatched ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="2"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
</button>

<style>
  .watchlist-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--bh-bg, #fff);
    border: 2px solid var(--bh-border, #1a1a1a);
    color: var(--bh-muted-fg, #666);
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 10;
  }

  .watchlist-toggle:hover {
    color: var(--bh-red, #dc2626);
    border-color: var(--bh-red, #dc2626);
  }

  .watchlist-toggle.watched {
    color: var(--bh-red, #dc2626);
    border-color: var(--bh-red, #dc2626);
    background: var(--bh-bg, #fff);
  }

  .watchlist-toggle:disabled {
    cursor: wait;
  }
</style>
