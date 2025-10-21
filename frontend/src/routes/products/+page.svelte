<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';

  export let data: PageData;

  let countdowns: { [key: string]: string } = {};
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function updateCountdowns() {
    data.products.forEach(product => {
      const now = new Date().getTime();
      const end = new Date(product.auctionEndDate).getTime();
      const diff = end - now;

      if (diff <= 0) {
        countdowns[product.id] = 'Ended';
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        countdowns[product.id] = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        countdowns[product.id] = `${hours}h ${minutes}m ${seconds}s`;
      } else {
        countdowns[product.id] = `${minutes}m ${seconds}s`;
      }
    });
    countdowns = { ...countdowns }; // Trigger reactivity
  }

  function getUrgencyClass(endDate: string): string {
    const now = new Date().getTime();
    const end = new Date(endDate).getTime();
    const diff = end - now;
    const hoursLeft = diff / (1000 * 60 * 60);

    if (diff <= 0) return 'ended';
    if (hoursLeft <= 3) return 'critical'; // Less than 3 hours
    if (hoursLeft <= 12) return 'urgent'; // Less than 12 hours
    if (hoursLeft <= 24) return 'warning'; // Less than 24 hours
    return 'normal';
  }

  onMount(() => {
    updateCountdowns();
    countdownInterval = setInterval(updateCountdowns, 1000);
  });

  onDestroy(() => {
    if (countdownInterval) clearInterval(countdownInterval);
  });
</script>

<svelte:head>
  <title>Browse Products - BidMo.to</title>
</svelte:head>

<div class="products-page">
  <h1>Browse Products</h1>

  {#if data.products.length === 0}
    <div class="empty-state">
      <p>No products listed yet.</p>
      <p><a href="/sell">Be the first to list a product!</a></p>
    </div>
  {:else}
    <div class="products-grid">
      {#each data.products as product}
        <a href="/products/{product.id}" class="product-card">
          <div class="product-image">
            {#if product.images && product.images.length > 0 && product.images[0].image}
              <img src="{product.images[0].image.url}" alt="{product.images[0].image.alt || product.title}" />
            {:else}
              <div class="placeholder-image">
                <span>No Image</span>
              </div>
            {/if}
          </div>

          <div class="product-info">
            <h3>{product.title}</h3>
            <p class="description">{product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}</p>

            <div class="pricing">
              <div>
                <span class="label">Starting Price:</span>
                <span class="price">{formatPrice(product.startingPrice, product.seller.currency)}</span>
              </div>

              {#if product.currentBid}
                <div>
                  <span class="label">Current Bid:</span>
                  <span class="price current-bid">{formatPrice(product.currentBid, product.seller.currency)}</span>
                </div>
              {/if}
            </div>

            <div class="auction-info">
              <span class="status status-{product.status}">{product.status}</span>
              <div class="countdown-badge countdown-{getUrgencyClass(product.auctionEndDate)}">
                <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span>{countdowns[product.id] || 'Loading...'}</span>
              </div>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .products-page {
    padding: 2rem 0;
  }

  h1 {
    margin-bottom: 2rem;
    font-size: 2.5rem;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: #f9f9f9;
    border-radius: 8px;
  }

  .empty-state p {
    font-size: 1.2rem;
    margin-bottom: 1rem;
  }

  .empty-state a {
    color: #0066cc;
    font-weight: bold;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }

  .product-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
  }

  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .product-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background-color: #f0f0f0;
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
    background-color: #e0e0e0;
    color: #999;
    font-size: 1.2rem;
  }

  .product-info {
    padding: 1.5rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .product-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
  }

  .description {
    color: #666;
    margin-bottom: 1rem;
    flex: 1;
  }

  .pricing {
    margin-bottom: 1rem;
  }

  .pricing > div {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .label {
    color: #666;
    font-size: 0.9rem;
  }

  .price {
    font-weight: bold;
    font-size: 1.1rem;
  }

  .current-bid {
    color: #0066cc;
  }

  .auction-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .status-active {
    background-color: #10b981;
    color: white;
  }

  .status-ended {
    background-color: #ef4444;
    color: white;
  }

  .status-sold {
    background-color: #6366f1;
    color: white;
  }

  .status-cancelled {
    background-color: #9ca3af;
    color: white;
  }

  .countdown-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 700;
    font-family: 'Courier New', monospace;
    transition: all 0.3s;
  }

  .countdown-icon {
    flex-shrink: 0;
  }

  /* Normal - More than 24 hours */
  .countdown-normal {
    background-color: #e0f2fe;
    color: #0369a1;
    border: 1px solid #7dd3fc;
  }

  /* Warning - Less than 24 hours */
  .countdown-warning {
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #fbbf24;
    animation: pulse-warning 2s ease-in-out infinite;
  }

  /* Urgent - Less than 12 hours */
  .countdown-urgent {
    background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
    color: #9a3412;
    border: 2px solid #f97316;
    animation: pulse-urgent 1.5s ease-in-out infinite;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
  }

  /* Critical - Less than 3 hours */
  .countdown-critical {
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
    color: #991b1b;
    border: 2px solid #dc2626;
    animation: pulse-critical 1s ease-in-out infinite;
    box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
  }

  /* Ended */
  .countdown-ended {
    background-color: #f3f4f6;
    color: #6b7280;
    border: 1px solid #d1d5db;
  }

  @keyframes pulse-warning {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.02);
    }
  }

  @keyframes pulse-urgent {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
    }
    50% {
      transform: scale(1.03);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.5);
    }
  }

  @keyframes pulse-critical {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(220, 38, 38, 0.6);
    }
  }
</style>
