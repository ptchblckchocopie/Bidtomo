<script lang="ts">
  import type { PageData } from './$types';
  import StarRating from '$lib/components/StarRating.svelte';
  import type { Rating } from '$lib/api';

  export let data: PageData;

  // Format date helper
  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  // Get product image URL
  function getProductImage(product: any): string | null {
    if (product.images && product.images.length > 0) {
      const firstImage = product.images[0]?.image;
      if (typeof firstImage === 'object' && firstImage?.url) {
        return firstImage.url;
      }
    }
    return null;
  }

  // Format price
  function formatPrice(amount: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  // Get rater name from rating
  function getRaterName(rating: Rating): string {
    if (typeof rating.rater === 'object' && rating.rater) {
      return rating.rater.name || 'Anonymous';
    }
    return 'Anonymous';
  }

  // Get product from rating (via transaction)
  function getProductFromRating(rating: Rating): any | null {
    if (typeof rating.transaction === 'object' && rating.transaction) {
      const transaction = rating.transaction;
      if (typeof transaction.product === 'object' && transaction.product) {
        return transaction.product;
      }
    }
    return null;
  }

  // Get product image from rating
  function getProductImageFromRating(rating: Rating): string | null {
    const product = getProductFromRating(rating);
    if (product) {
      return getProductImage(product);
    }
    return null;
  }

  // Get the role of the profile user in the transaction (seller or buyer)
  function getProfileUserRole(rating: Rating): 'seller' | 'buyer' {
    // If raterRole is 'buyer', the ratee (profile user) was the seller
    // If raterRole is 'seller', the ratee (profile user) was the buyer
    return rating.raterRole === 'buyer' ? 'seller' : 'buyer';
  }

  // Active tab
  let activeTab: 'listings' | 'reviews' = 'listings';

  // Separate ratings by role
  $: ratingsAsSeller = data.ratings.filter(r => r.raterRole === 'buyer'); // Buyers rate sellers
  $: ratingsAsBuyer = data.ratings.filter(r => r.raterRole === 'seller'); // Sellers rate buyers
</script>

<svelte:head>
  <title>{data.user.name} - User Profile</title>
</svelte:head>

<div class="profile-page">
  <div class="profile-container">
    <!-- Profile Header -->
    <div class="profile-header">
      <div class="profile-avatar">
        {data.user.name?.charAt(0)?.toUpperCase() || '?'}
      </div>
      <div class="profile-info">
        <h1 class="profile-name">{data.user.name}</h1>
        <p class="member-since">Member since {formatDate(data.user.createdAt)}</p>

        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-rating">
              <StarRating rating={data.ratingStats.asSeller.averageRating} size="small" />
              <span class="stat-value">{data.ratingStats.asSeller.averageRating.toFixed(1)}</span>
            </div>
            <span class="stat-label">Seller Rating ({data.ratingStats.asSeller.totalRatings})</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <div class="stat-rating">
              <StarRating rating={data.ratingStats.asBuyer.averageRating} size="small" />
              <span class="stat-value">{data.ratingStats.asBuyer.averageRating.toFixed(1)}</span>
            </div>
            <span class="stat-label">Buyer Rating ({data.ratingStats.asBuyer.totalRatings})</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{data.totalSoldProducts}</span>
            <span class="stat-label">Completed Sales</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-value">{data.totalActiveProducts}</span>
            <span class="stat-label">Active Listings</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="profile-tabs">
      <button
        class="tab-btn"
        class:active={activeTab === 'listings'}
        on:click={() => activeTab = 'listings'}
      >
        Listings
      </button>
      <button
        class="tab-btn"
        class:active={activeTab === 'reviews'}
        on:click={() => activeTab = 'reviews'}
      >
        Reviews ({data.ratings.length})
      </button>
    </div>

    <!-- Tab Content -->
    {#if activeTab === 'listings'}
      <div class="tab-content">
        <!-- Active Listings -->
        {#if data.activeProducts.length > 0}
          <section class="listings-section">
            <h2>Active Listings</h2>
            <div class="products-grid">
              {#each data.activeProducts as product}
                <a href="/products/{product.id}" class="product-card">
                  <div class="product-image">
                    {#if getProductImage(product)}
                      <img src={getProductImage(product)} alt={product.title} />
                    {:else}
                      <div class="no-image">No Image</div>
                    {/if}
                    <div class="status-badge available">Active</div>
                  </div>
                  <div class="product-info">
                    <h3>{product.title}</h3>
                    <div class="product-price">
                      {#if product.currentBid}
                        <span class="current-bid">{formatPrice(product.currentBid, product.seller?.currency)}</span>
                        <span class="bid-label">Current bid</span>
                      {:else}
                        <span class="starting-price">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
                        <span class="bid-label">Starting price</span>
                      {/if}
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </section>
        {/if}

        <!-- Completed Sales -->
        {#if data.soldProducts.length > 0}
          <section class="listings-section">
            <h2>Completed Sales</h2>
            <div class="products-grid">
              {#each data.soldProducts as product}
                <a href="/products/{product.id}" class="product-card sold">
                  <div class="product-image">
                    {#if getProductImage(product)}
                      <img src={getProductImage(product)} alt={product.title} />
                    {:else}
                      <div class="no-image">No Image</div>
                    {/if}
                    <div class="status-badge sold">Sold</div>
                  </div>
                  <div class="product-info">
                    <h3>{product.title}</h3>
                    <div class="product-price">
                      <span class="sold-price">{formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)}</span>
                      <span class="bid-label">Final price</span>
                    </div>
                  </div>
                </a>
              {/each}
            </div>
          </section>
        {/if}

        {#if data.activeProducts.length === 0 && data.soldProducts.length === 0}
          <div class="empty-state">
            <p>This user hasn't listed any products yet.</p>
          </div>
        {/if}
      </div>
    {:else if activeTab === 'reviews'}
      <div class="tab-content">
        {#if data.ratings.length > 0}
          <!-- Reviews as Seller -->
          {#if ratingsAsSeller.length > 0}
            <section class="reviews-section">
              <div class="reviews-section-header">
                <h2>Reviews as Seller</h2>
                <span class="reviews-count">{ratingsAsSeller.length} review{ratingsAsSeller.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="reviews-list">
                {#each ratingsAsSeller as rating}
                  {@const product = getProductFromRating(rating)}
                  {@const productImage = getProductImageFromRating(rating)}
                  <div class="review-card">
                    <!-- Product Image (Left) -->
                    {#if product}
                      <a href="/products/{product.id}" class="review-product-image">
                        {#if productImage}
                          <img src={productImage} alt={product.title} />
                        {:else}
                          <div class="no-image-thumb">📦</div>
                        {/if}
                      </a>
                    {:else}
                      <div class="review-product-image placeholder">
                        <div class="no-image-thumb">📦</div>
                      </div>
                    {/if}

                    <!-- Review Details (Right) -->
                    <div class="review-details">
                      {#if product}
                        <div class="review-product-info">
                          <a href="/products/{product.id}" class="product-title-link">{product.title}</a>
                          <span class="transaction-role">Sold this item</span>
                          <a href="/inbox?product={product.id}" class="chat-link" title="Open chat">
                            💬 Chat
                          </a>
                        </div>
                      {/if}

                      <div class="review-header">
                        <div class="reviewer-info">
                          <span class="reviewer-name">{getRaterName(rating)}</span>
                          <span class="reviewer-role buyer-badge">Buyer</span>
                        </div>
                        <span class="review-date">{formatDate(rating.createdAt)}</span>
                      </div>
                      <div class="review-rating">
                        <StarRating rating={rating.rating} size="small" />
                        <span class="rating-score">{rating.rating}/5</span>
                      </div>
                      {#if rating.comment}
                        <p class="review-comment">"{rating.comment}"</p>
                      {/if}

                      {#if rating.hasFollowUp && rating.followUp}
                        <div class="follow-up-review">
                          <div class="follow-up-header">
                            <span class="follow-up-label">Follow-up</span>
                            {#if rating.followUp.createdAt}
                              <span class="follow-up-date">{formatDate(rating.followUp.createdAt)}</span>
                            {/if}
                          </div>
                          <div class="review-rating">
                            <StarRating rating={rating.followUp.rating || 0} size="small" />
                            <span class="rating-score">{rating.followUp.rating}/5</span>
                          </div>
                          {#if rating.followUp.comment}
                            <p class="review-comment">"{rating.followUp.comment}"</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}

          <!-- Reviews as Buyer -->
          {#if ratingsAsBuyer.length > 0}
            <section class="reviews-section">
              <div class="reviews-section-header">
                <h2>Reviews as Buyer</h2>
                <span class="reviews-count">{ratingsAsBuyer.length} review{ratingsAsBuyer.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="reviews-list">
                {#each ratingsAsBuyer as rating}
                  {@const product = getProductFromRating(rating)}
                  {@const productImage = getProductImageFromRating(rating)}
                  <div class="review-card">
                    <!-- Product Image (Left) -->
                    {#if product}
                      <a href="/products/{product.id}" class="review-product-image">
                        {#if productImage}
                          <img src={productImage} alt={product.title} />
                        {:else}
                          <div class="no-image-thumb">📦</div>
                        {/if}
                      </a>
                    {:else}
                      <div class="review-product-image placeholder">
                        <div class="no-image-thumb">📦</div>
                      </div>
                    {/if}

                    <!-- Review Details (Right) -->
                    <div class="review-details">
                      {#if product}
                        <div class="review-product-info">
                          <a href="/products/{product.id}" class="product-title-link">{product.title}</a>
                          <span class="transaction-role">Won this item</span>
                          <a href="/inbox?product={product.id}" class="chat-link" title="Open chat">
                            💬 Chat
                          </a>
                        </div>
                      {/if}

                      <div class="review-header">
                        <div class="reviewer-info">
                          <span class="reviewer-name">{getRaterName(rating)}</span>
                          <span class="reviewer-role seller-badge">Seller</span>
                        </div>
                        <span class="review-date">{formatDate(rating.createdAt)}</span>
                      </div>
                      <div class="review-rating">
                        <StarRating rating={rating.rating} size="small" />
                        <span class="rating-score">{rating.rating}/5</span>
                      </div>
                      {#if rating.comment}
                        <p class="review-comment">"{rating.comment}"</p>
                      {/if}

                      {#if rating.hasFollowUp && rating.followUp}
                        <div class="follow-up-review">
                          <div class="follow-up-header">
                            <span class="follow-up-label">Follow-up</span>
                            {#if rating.followUp.createdAt}
                              <span class="follow-up-date">{formatDate(rating.followUp.createdAt)}</span>
                            {/if}
                          </div>
                          <div class="review-rating">
                            <StarRating rating={rating.followUp.rating || 0} size="small" />
                            <span class="rating-score">{rating.followUp.rating}/5</span>
                          </div>
                          {#if rating.followUp.comment}
                            <p class="review-comment">"{rating.followUp.comment}"</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </section>
          {/if}
        {:else}
          <div class="empty-state">
            <p>This user hasn't received any reviews yet.</p>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-page {
    padding: 2rem 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .profile-container {
    background: white;
    border-radius: 16px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  /* Profile Header */
  .profile-header {
    display: flex;
    gap: 1.5rem;
    padding: 2rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .profile-avatar {
    width: 100px;
    height: 100px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .profile-info {
    flex: 1;
  }

  .profile-name {
    margin: 0 0 0.25rem 0;
    font-size: 1.75rem;
  }

  .member-since {
    margin: 0 0 1rem 0;
    opacity: 0.9;
    font-size: 0.9rem;
  }

  .profile-stats {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .stat-rating {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .stat-label {
    font-size: 0.8rem;
    opacity: 0.9;
  }

  .stat-divider {
    width: 1px;
    height: 40px;
    background: rgba(255, 255, 255, 0.3);
    align-self: center;
  }

  /* Tabs */
  .profile-tabs {
    display: flex;
    border-bottom: 1px solid #e9ecef;
  }

  .tab-btn {
    flex: 1;
    padding: 1rem;
    background: none;
    border: none;
    font-size: 1rem;
    font-weight: 500;
    color: #666;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s ease;
  }

  .tab-btn:hover {
    color: #333;
    background: #f8f9fa;
  }

  .tab-btn.active {
    color: #667eea;
    border-bottom-color: #667eea;
  }

  /* Tab Content */
  .tab-content {
    padding: 2rem;
  }

  /* Listings Section */
  .listings-section {
    margin-bottom: 2rem;
  }

  .listings-section h2 {
    margin: 0 0 1rem 0;
    font-size: 1.25rem;
    color: #333;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .product-card {
    background: #f8f9fa;
    border-radius: 12px;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .product-card.sold {
    opacity: 0.85;
  }

  .product-image {
    position: relative;
    aspect-ratio: 4/3;
    background: #e9ecef;
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
    color: #999;
    font-size: 0.9rem;
  }

  .status-badge {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-badge.available {
    background: #10b981;
    color: white;
  }

  .status-badge.sold {
    background: #6b7280;
    color: white;
  }

  .product-info {
    padding: 0.75rem;
  }

  .product-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
    font-weight: 600;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .product-price {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .current-bid, .starting-price, .sold-price {
    font-weight: 600;
    color: #333;
  }

  .bid-label {
    font-size: 0.75rem;
    color: #666;
  }

  /* Reviews */
  .reviews-section {
    margin-bottom: 2rem;
  }

  .reviews-section-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 2px solid #e9ecef;
  }

  .reviews-section-header h2 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }

  .reviews-count {
    font-size: 0.85rem;
    color: #666;
    background: #e9ecef;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
  }

  .reviews-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .review-card {
    display: flex;
    gap: 1rem;
    background: #f8f9fa;
    border-radius: 12px;
    padding: 1rem;
    align-items: flex-start;
  }

  /* Review Product Image (Left) */
  .review-product-image {
    width: 100px;
    height: 100px;
    border-radius: 8px;
    overflow: hidden;
    background: #e9ecef;
    flex-shrink: 0;
    display: block;
  }

  .review-product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.2s;
  }

  .review-product-image:hover img {
    transform: scale(1.05);
  }

  .review-product-image.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .no-image-thumb {
    font-size: 2rem;
    color: #999;
  }

  /* Review Details (Right) */
  .review-details {
    flex: 1;
    min-width: 0;
  }

  .review-product-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .product-title-link {
    font-weight: 600;
    color: #333;
    font-size: 0.95rem;
    text-decoration: none;
    transition: color 0.2s;
  }

  .product-title-link:hover {
    color: #667eea;
  }

  .transaction-role {
    font-size: 0.75rem;
    color: #666;
    background: #e9ecef;
    padding: 0.125rem 0.5rem;
    border-radius: 4px;
  }

  .chat-link {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: #667eea;
    color: white;
    border-radius: 4px;
    text-decoration: none;
    font-size: 0.75rem;
    transition: background 0.2s;
    margin-left: auto;
  }

  .chat-link:hover {
    background: #5a6fd6;
  }

  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 0.5rem;
  }

  .reviewer-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .reviewer-name {
    font-weight: 600;
    color: #333;
  }

  .reviewer-role {
    font-size: 0.75rem;
    color: #666;
    background: #e9ecef;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
    width: fit-content;
  }

  .review-date {
    font-size: 0.8rem;
    color: #666;
  }

  .review-rating {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .rating-score {
    font-weight: 600;
    color: #333;
  }

  .review-comment {
    margin: 0;
    font-style: italic;
    color: #555;
    line-height: 1.5;
  }

  .follow-up-review {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #e0e0e0;
  }

  .follow-up-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .follow-up-label {
    font-weight: 600;
    color: #667eea;
    font-size: 0.85rem;
  }

  .follow-up-date {
    font-size: 0.75rem;
    color: #666;
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 3rem 1rem;
    color: #666;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .profile-header {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .profile-stats {
      justify-content: center;
    }

    .stat-item {
      align-items: center;
    }

    .products-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 480px) {
    .profile-page {
      padding: 1rem 0.5rem;
    }

    .tab-content {
      padding: 1rem;
    }

    .products-grid {
      grid-template-columns: 1fr;
    }

    .profile-stats {
      flex-direction: column;
      gap: 0.75rem;
    }

    .stat-divider {
      display: none;
    }

    .review-card {
      flex-direction: column;
    }

    .review-product-image {
      width: 80px;
      height: 80px;
    }

    .review-product-info {
      flex-direction: column;
      align-items: flex-start;
    }

    .chat-link {
      margin-left: 0;
      margin-top: 0.25rem;
    }

    .product-title-link {
      white-space: normal;
    }
  }
</style>
