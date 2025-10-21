<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

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

  function getTimeRemaining(endDate: string): string {
    const now = new Date().getTime();
    const end = new Date(endDate).getTime();
    const diff = end - now;

    if (diff <= 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h remaining`;
    return `${hours}h remaining`;
  }
</script>

<svelte:head>
  <title>Browse Products - Marketplace Platform</title>
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
              <span class="time-remaining">{getTimeRemaining(product.auctionEndDate)}</span>
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

  .time-remaining {
    color: #666;
    font-size: 0.9rem;
  }
</style>
