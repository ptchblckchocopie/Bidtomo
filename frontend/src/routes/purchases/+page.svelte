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
    <div class="purchases-grid">
      {#each purchases as product}
        <div class="purchase-card">
          <a href="/products/{product.id}" class="product-link">
            <div class="product-image">
              {#if product.images && product.images.length > 0 && product.images[0].image}
                <img src={product.images[0].image.url} alt={product.images[0].image.alt || product.title} />
              {:else}
                <div class="no-image">📦</div>
              {/if}
              <div class="status-badge {getStatusBadgeClass(product.status)}">
                {product.status === 'sold' ? '✓ Sold' : 'Ended'}
              </div>
            </div>

            <div class="product-info">
              <h3>{product.title}</h3>
              <p class="description">{product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}</p>

              <div class="price-info">
                <div class="price-row">
                  <span class="label">Winning Bid:</span>
                  <span class="price">{formatPrice(product.currentBid || product.startingPrice, product.seller.currency)}</span>
                </div>
                <div class="price-row small">
                  <span class="label">Starting Price:</span>
                  <span class="price">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                </div>
              </div>

              <div class="product-details">
                <div class="detail">
                  <span class="detail-label">Seller:</span>
                  <span class="detail-value">{product.seller.name}</span>
                </div>
                <div class="detail">
                  <span class="detail-label">Ended:</span>
                  <span class="detail-value">{formatDate(product.auctionEndDate)}</span>
                </div>
              </div>

              <div class="action-buttons">
                <a href="/inbox?product={product.id}" class="btn-message">
                  💬 Message Seller
                </a>
              </div>
            </div>
          </a>
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

  .purchases-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 2rem;
  }

  .purchase-card {
    background-color: white;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .purchase-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }

  .product-link {
    text-decoration: none;
    color: inherit;
    display: block;
  }

  .product-image {
    position: relative;
    width: 100%;
    height: 200px;
    background-color: #f5f5f5;
    overflow: hidden;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-image {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    font-size: 4rem;
    color: #ccc;
  }

  .status-badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    padding: 0.375rem 0.75rem;
    border-radius: 20px;
    font-size: 0.875rem;
    font-weight: 600;
    color: white;
  }

  .status-sold {
    background-color: #10b981;
  }

  .status-ended {
    background-color: #6b7280;
  }

  .product-info {
    padding: 1.5rem;
  }

  h3 {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    color: #333;
  }

  .description {
    color: #666;
    font-size: 0.95rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .price-info {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .price-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: white;
  }

  .price-row.small {
    font-size: 0.875rem;
    margin-top: 0.5rem;
    opacity: 0.9;
  }

  .price-row .label {
    font-weight: 500;
  }

  .price-row .price {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .price-row.small .price {
    font-size: 1rem;
    font-weight: 500;
  }

  .product-details {
    margin-bottom: 1rem;
  }

  .detail {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .detail:last-child {
    border-bottom: none;
  }

  .detail-label {
    color: #666;
    font-size: 0.9rem;
  }

  .detail-value {
    color: #333;
    font-weight: 500;
    font-size: 0.9rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
  }

  .btn-message {
    flex: 1;
    padding: 0.75rem 1rem;
    background-color: #dc2626;
    color: white;
    text-decoration: none;
    text-align: center;
    border-radius: 6px;
    font-weight: 600;
    transition: background-color 0.2s;
  }

  .btn-message:hover {
    background-color: #b91c1c;
  }
</style>
