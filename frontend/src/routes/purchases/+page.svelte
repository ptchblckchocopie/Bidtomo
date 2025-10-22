<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { fetchMyPurchases } from '$lib/api';
  import type { Product } from '$lib/api';
  import { goto } from '$app/navigation';

  let purchases: Product[] = [];
  let loading = true;
  let error = '';

  // Currency symbols
  const currencySymbols: Record<string, string> = {
    PHP: '₱',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  };

  function formatPrice(price: number, currency: string): string {
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${price.toLocaleString()}`;
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'sold':
        return 'status-sold';
      case 'ended':
        return 'status-ended';
      default:
        return 'status-other';
    }
  }

  onMount(async () => {
    if (!$authStore.isAuthenticated) {
      goto('/login?redirect=/purchases');
      return;
    }

    try {
      purchases = await fetchMyPurchases();
    } catch (err) {
      error = 'Failed to load your purchases. Please try again.';
      console.error('Error loading purchases:', err);
    } finally {
      loading = false;
    }
  });
</script>

<svelte:head>
  <title>My Purchases - BidMo.to</title>
</svelte:head>

<div class="purchases-page">
  <div class="page-header">
    <h1>My Purchases</h1>
    <p class="subtitle">Items you've won through bidding</p>
  </div>

  {#if loading}
    <div class="loading">Loading your purchases...</div>
  {:else if error}
    <div class="error-message">{error}</div>
  {:else if purchases.length === 0}
    <div class="empty-state">
      <div class="empty-icon">🛍️</div>
      <h2>No Purchases Yet</h2>
      <p>You haven't won any auctions yet. Start bidding to see your purchases here!</p>
      <a href="/products" class="btn-browse">Browse Products</a>
    </div>
  {:else}
    <div class="purchases-list">
      {#each purchases as product}
        <div class="purchase-item">
          <div class="purchase-image">
            {#if product.images && product.images.length > 0 && product.images[0].image}
              <img src={product.images[0].image.url} alt={product.images[0].image.alt || product.title} />
            {:else}
              <div class="placeholder-image-small">📦</div>
            {/if}
          </div>

          <div class="purchase-info">
            <h3>{product.title}</h3>
            <div class="purchase-meta">
              <span class="status-badge-small {getStatusBadgeClass(product.status)}">
                {product.status === 'sold' ? '✓ Sold' : 'Ended'}
              </span>
              <span class="seller-info">Seller: {product.seller.name}</span>
              <span class="purchase-date">Ended: {formatDate(product.auctionEndDate)}</span>
            </div>
          </div>

          <div class="purchase-price">
            <div class="price-label">Winning Bid</div>
            <div class="price-value">
              {formatPrice(product.currentBid || product.startingPrice, product.seller.currency)}
            </div>
          </div>

          <div class="purchase-actions">
            <a href="/products/{product.id}" class="btn-view-small">
              View
            </a>
            <a href="/inbox?product={product.id}" class="btn-message">
              💬 Message Seller
            </a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .purchases-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 0;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
    color: #333;
  }

  .subtitle {
    color: #666;
    font-size: 1.1rem;
  }

  .loading {
    text-align: center;
    padding: 3rem;
    color: #666;
    font-size: 1.2rem;
  }

  .error-message {
    background-color: #fee;
    color: #c33;
    padding: 1rem;
    border-radius: 8px;
    text-align: center;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .empty-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-size: 1.8rem;
    color: #333;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: #666;
    font-size: 1.1rem;
    margin-bottom: 2rem;
  }

  .btn-browse {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-browse:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .purchases-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .purchase-item {
    background-color: white;
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    display: flex;
    gap: 1.25rem;
    align-items: center;
    transition: box-shadow 0.2s;
  }

  .purchase-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .purchase-image {
    width: 80px;
    height: 80px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background-color: #f3f4f6;
  }

  .purchase-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .placeholder-image-small {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
  }

  .purchase-info {
    flex: 1;
    min-width: 0;
  }

  .purchase-info h3 {
    font-size: 1.125rem;
    margin: 0 0 0.5rem 0;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .purchase-meta {
    display: flex;
    gap: 1rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .status-badge-small {
    display: inline-block;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    color: white;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
  }

  .status-sold {
    background-color: #10b981;
  }

  .status-ended {
    background-color: #6b7280;
  }

  .seller-info,
  .purchase-date {
    font-size: 0.875rem;
    color: #666;
  }

  .purchase-price {
    text-align: right;
    padding: 0 1rem;
  }

  .price-label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .price-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #10b981;
  }

  .purchase-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .btn-view-small,
  .btn-message {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.875rem;
    text-decoration: none;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .btn-view-small {
    background-color: #3b82f6;
    color: white;
  }

  .btn-view-small:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
  }

  .btn-message {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-message:hover {
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.4);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .purchase-item {
      flex-direction: column;
      align-items: flex-start;
    }

    .purchase-image {
      width: 100%;
      height: 150px;
    }

    .purchase-price {
      padding: 0;
      text-align: left;
    }

    .purchase-actions {
      width: 100%;
    }

    .btn-view-small,
    .btn-message {
      flex: 1;
    }
  }
</style>
