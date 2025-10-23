<script lang="ts">
  import { onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth';
  import { fetchMyPurchases } from '$lib/api';
  import type { Product } from '$lib/api';
  import { goto } from '$app/navigation';
  import ImageSlider from '$lib/components/ImageSlider.svelte';

  let purchases: Product[] = [];
  let loading = true;
  let error = '';
  let showProductModal = false;
  let selectedProduct: Product | null = null;

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

  function openProductModal(product: Product) {
    selectedProduct = product;
    showProductModal = true;
  }

  function closeProductModal() {
    showProductModal = false;
    selectedProduct = null;
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
            <button on:click={() => openProductModal(product)} class="btn-view-small">
              View
            </button>
            <a href="/inbox?product={product.id}" class="btn-message">
              💬 Message Seller
            </a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Product Detail Modal -->
{#if showProductModal && selectedProduct}
  <div class="modal-overlay" on:click={closeProductModal} on:keydown={(e) => e.key === 'Escape' && closeProductModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
      <button class="modal-close" on:click={closeProductModal}>&times;</button>

      <div class="modal-body">
        <!-- Image Slider -->
        {#if selectedProduct.images && selectedProduct.images.length > 0}
          {@const validImages = selectedProduct.images.filter(img => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            <div class="modal-image-section">
              <ImageSlider images={validImages} productTitle={selectedProduct.title} />
            </div>
          {:else}
            <div class="modal-placeholder-image">
              <span class="placeholder-icon">📦</span>
            </div>
          {/if}
        {:else}
          <div class="modal-placeholder-image">
            <span class="placeholder-icon">📦</span>
          </div>
        {/if}

        <!-- Product Info -->
        <div class="modal-info-section">
          <div class="modal-header">
            <h2>{selectedProduct.title}</h2>
            <span class="status-badge {getStatusBadgeClass(selectedProduct.status)}">
              {selectedProduct.status === 'sold' ? '✓ Sold' : 'Ended'}
            </span>
          </div>

          <div class="product-detail-grid">
            <div class="detail-item">
              <span class="detail-label">Seller</span>
              <span class="detail-value">{selectedProduct.seller.name}</span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Starting Bid</span>
              <span class="detail-value">
                {formatPrice(selectedProduct.startingPrice, selectedProduct.seller.currency)}
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Winning Bid</span>
              <span class="detail-value price-highlight">
                {formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller.currency)}
              </span>
            </div>

            <div class="detail-item">
              <span class="detail-label">Auction Ended</span>
              <span class="detail-value">{formatDate(selectedProduct.auctionEndDate)}</span>
            </div>
          </div>

          {#if selectedProduct.description}
            <div class="description-section">
              <h3>Description</h3>
              <p>{selectedProduct.description}</p>
            </div>
          {/if}

          {#if selectedProduct.keywords && selectedProduct.keywords.length > 0}
            <div class="keywords-section">
              <h3>Tags</h3>
              <div class="keywords-list">
                {#each selectedProduct.keywords as keyword}
                  <span class="keyword-tag">
                    {typeof keyword === 'string'
                      ? keyword
                      : (keyword?.keyword || keyword?.value || keyword?.label || keyword?.name || JSON.stringify(keyword))}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          <div class="modal-actions">
            <a href="/products/{selectedProduct.id}" class="btn-open-page" target="_blank" rel="noopener noreferrer">
              🔗 Open Product Page
            </a>
            <a href="/inbox?product={selectedProduct.id}" class="btn-message-large">
              💬 Message Seller
            </a>
            <button on:click={closeProductModal} class="btn-close-modal">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

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
    border: none;
    cursor: pointer;
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

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    animation: fadeIn 0.2s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background-color: white;
    border-radius: 12px;
    max-width: 900px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    position: relative;
    animation: slideUp 0.3s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: white;
    border: none;
    font-size: 2rem;
    color: #666;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .modal-close:hover {
    background-color: #f0f0f0;
    color: #333;
  }

  .modal-body {
    display: flex;
    flex-direction: column;
  }

  .modal-image-section {
    width: 100%;
    background-color: #f9fafb;
  }

  .modal-placeholder-image {
    width: 100%;
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #f3f4f6;
  }

  .placeholder-icon {
    font-size: 4rem;
  }

  .modal-info-section {
    padding: 2rem;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 1rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .modal-header h2 {
    font-size: 1.75rem;
    color: #333;
    margin: 0;
    flex: 1;
  }

  .status-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    color: white;
    font-weight: 600;
    font-size: 0.875rem;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .product-detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .detail-label {
    font-size: 0.875rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .detail-value {
    font-size: 1.125rem;
    color: #333;
    font-weight: 500;
  }

  .price-highlight {
    color: #10b981;
    font-weight: 700;
    font-size: 1.5rem;
  }

  .description-section {
    margin-bottom: 2rem;
  }

  .description-section h3 {
    font-size: 1.25rem;
    color: #333;
    margin-bottom: 0.75rem;
  }

  .description-section p {
    color: #666;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .keywords-section {
    margin-bottom: 2rem;
  }

  .keywords-section h3 {
    font-size: 1.25rem;
    color: #333;
    margin-bottom: 0.75rem;
  }

  .keywords-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .keyword-tag {
    display: inline-block;
    padding: 0.5rem 1rem;
    background-color: #f3f4f6;
    color: #666;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 2px solid #e5e7eb;
  }

  .btn-open-page {
    flex: 1;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-open-page:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-message-large {
    flex: 1;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-message-large:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .btn-close-modal {
    flex: 1;
    padding: 1rem 2rem;
    background-color: #e5e7eb;
    color: #333;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-close-modal:hover {
    background-color: #d1d5db;
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

    .modal-content {
      margin: 0;
      max-height: 100vh;
      border-radius: 0;
    }

    .modal-info-section {
      padding: 1.5rem;
    }

    .modal-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .product-detail-grid {
      grid-template-columns: 1fr;
    }

    .modal-actions {
      flex-direction: column;
    }

    .modal-placeholder-image {
      height: 250px;
    }
  }
</style>
