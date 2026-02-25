<script lang="ts">
  import type { PageData } from './$types';
  import { type Product } from '$lib/api';
  import { fetchMyPurchases } from '$lib/api';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import ProductForm from '$lib/components/ProductForm.svelte';

  let { data } = $props<{ data: PageData }>();

  // Tab management
  type TabType = 'products' | 'purchases';
  let activeTab: TabType = 'products';

  // Separate products by status and visibility
  let activeProducts = $derived(data.activeProducts);
  let hiddenProducts = $derived(data.hiddenProducts);
  let endedProducts = $derived(data.endedProducts);

  // Purchases state
  let purchases: Product[] = [];
  let purchasesLoading = false;
  let purchasesError = '';

  // Modal states
  let showEditModal = false;
  let showViewModal = false;
  let editingProduct: Product | null = null;
  let viewingProduct: Product | null = null;
  let showProductModal = false;
  let selectedProduct: Product | null = null;

  // Product view state
  let productTab: 'active' | 'hidden' | 'ended' = 'active';

  // Currency symbols
  const currencySymbols: Record<string, string> = {
    PHP: '₱',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
  };

  function formatPrice(price: number, currency: string = 'PHP'): string {
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

  function getStatusText(status: string): string {
    switch (status) {
      case 'available': return 'Active';
      case 'sold': return 'Sold';
      case 'ended': return 'Ended';
      case 'cancelled': return 'Cancelled';
      default: return status;
    }
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'available': return 'status-active';
      case 'sold': return 'status-sold';
      case 'ended': return 'status-ended';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-other';
    }
  }

  function openEditModal(product: Product | null) {
    if (!product) return;
    editingProduct = product;
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
    editingProduct = null;
  }

  function handleEditSuccess(updatedProduct: Product) {
    // Update the product in the correct array and trigger reactivity
    const updateInArray = (arr: Product[]) => {
      const index = arr.findIndex(p => p.id === editingProduct!.id);
      if (index !== -1) {
        arr[index] = {
          ...updatedProduct,
          seller: editingProduct!.seller
        };
        return true;
      }
      return false;
    };

    // Try to find and update in each array
    let found = false;
    if (updateInArray(data.activeProducts)) {
      data.activeProducts = [...data.activeProducts]; // Trigger reactivity
      found = true;
    } else if (updateInArray(data.hiddenProducts)) {
      data.hiddenProducts = [...data.hiddenProducts]; // Trigger reactivity
      found = true;
    } else if (updateInArray(data.endedProducts)) {
      data.endedProducts = [...data.endedProducts]; // Trigger reactivity
      found = true;
    }

    // Check if product moved between categories (e.g., active changed)
    if (found && editingProduct) {
      const productId = editingProduct.id;
      const wasActive = editingProduct.active;
      const isActive = updatedProduct.active;

      // If active status changed, move product between arrays
      if (wasActive !== isActive) {
        // Remove from current array
        data.activeProducts = data.activeProducts.filter((p: Product) => p.id !== productId);
        data.hiddenProducts = data.hiddenProducts.filter((p: Product) => p.id !== productId);

        // Add to correct array
        if (isActive) {
          data.activeProducts = [...data.activeProducts, { ...updatedProduct, seller: editingProduct.seller }];
        } else {
          data.hiddenProducts = [...data.hiddenProducts, { ...updatedProduct, seller: editingProduct.seller }];
        }
      }
    }

    setTimeout(() => {
      closeEditModal();
    }, 1500);
  }

  function openViewModal(product: Product) {
    viewingProduct = product;
    showViewModal = true;
  }

  function closeViewModal() {
    showViewModal = false;
    viewingProduct = null;
  }

  function openProductModal(product: Product) {
    selectedProduct = product;
    showProductModal = true;
  }

  function closeProductModal() {
    showProductModal = false;
    selectedProduct = null;
  }

  // Load purchases when switching to purchases tab
  async function loadPurchases() {
    if (purchases.length > 0) return; // Already loaded

    purchasesLoading = true;
    purchasesError = '';
    try {
      purchases = await fetchMyPurchases();
    } catch (err) {
      purchasesError = 'Failed to load your purchases. Please try again.';
      console.error('Error loading purchases:', err);
    } finally {
      purchasesLoading = false;
    }
  }

  // Tab switching with URL and localStorage persistence
  function switchTab(tab: TabType) {
    activeTab = tab;

    // Save to localStorage
    if (browser) {
      localStorage.setItem('dashboardTab', tab);
    }

    // Update URL without navigation
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.replaceState({}, '', url.toString());

    // Load purchases data if switching to purchases tab
    if (tab === 'purchases') {
      loadPurchases();
    }
  }

  // Initialize tab from URL or localStorage
  onMount(() => {
    if (!browser) return;

    // Check URL parameter first
    const urlTab = $page.url.searchParams.get('tab');
    if (urlTab === 'products' || urlTab === 'purchases') {
      activeTab = urlTab;
    } else {
      // Check localStorage
      const savedTab = localStorage.getItem('dashboardTab');
      if (savedTab === 'products' || savedTab === 'purchases') {
        activeTab = savedTab;
      }
    }

    // Update URL to match
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState({}, '', url.toString());

    // Load purchases if on purchases tab
    if (activeTab === 'purchases') {
      loadPurchases();
    }
  });
</script>

<svelte:head>
  <title>Dashboard - BidMo.to</title>
</svelte:head>

<div class="dashboard-page">
  <div class="page-header">
    <h1>Dashboard</h1>
    <p class="subtitle">Manage your products and purchases</p>
  </div>

  <!-- Main Tabs -->
  <div class="main-tabs">
    <button
      class="main-tab"
      class:active={activeTab === 'products'}
      onclick={() => switchTab('products')}
    >
      <span class="tab-icon">📦</span>
      <span class="tab-label">My Products</span>
    </button>
    <button
      class="main-tab"
      class:active={activeTab === 'purchases'}
      onclick={() => switchTab('purchases')}
    >
      <span class="tab-icon">🛍️</span>
      <span class="tab-label">My Purchases</span>
    </button>
  </div>

  <!-- Tab Content -->
  <div class="tab-content">
    {#if activeTab === 'products'}
      <!-- My Products Tab Content -->
      <div class="products-section">
        <!-- Sub-tabs for product status -->
        <div class="sub-tabs">
          <button
            class="sub-tab"
            class:active={productTab === 'active'}
            onclick={() => productTab = 'active'}
          >
            Active ({activeProducts.length})
          </button>
          <button
            class="sub-tab"
            class:active={productTab === 'hidden'}
            onclick={() => productTab = 'hidden'}
          >
            Hidden ({hiddenProducts.length})
          </button>
          <button
            class="sub-tab"
            class:active={productTab === 'ended'}
            onclick={() => productTab = 'ended'}
          >
            Ended ({endedProducts.length})
          </button>
        </div>

        <!-- Product Lists -->
        {#if productTab === 'active'}
          {#if activeProducts.length === 0}
            <div class="empty-state">
              <div class="empty-icon">📦</div>
              <h2>No Active Products</h2>
              <p>You don't have any active products. Start selling now!</p>
              <a href="/sell" class="btn-primary">+ List a Product</a>
            </div>
          {:else}
            <div class="products-grid">
              {#each activeProducts as product}
                <div class="product-card">
                  <a href="/products/{product.id}" class="card-link">
                    <div class="product-image">
                      {#if product.images && product.images.length > 0}
                        {@const validImages = product.images.filter((img: any) => img && img.image && img.image.url)}
                        {#if validImages.length > 0}
                          {@const firstImage = validImages[0]}
                          <img src={firstImage.image.url} alt={product.title} />
                        {:else}
                          <div class="placeholder-image">
                            <span class="placeholder-icon">📦</span>
                          </div>
                        {/if}
                      {:else}
                        <div class="placeholder-image">
                          <span class="placeholder-icon">📦</span>
                        </div>
                      {/if}
                    </div>

                    <div class="product-details">
                      <h3>{product.title}</h3>
                      <div class="product-price">
                        <div class="price-row">
                          <span class="price-label">Starting:</span>
                          <span class="price-value">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
                        </div>
                        {#if product.currentBid}
                          <div class="price-row current-bid">
                            <span class="price-label">Current Bid:</span>
                            <span class="price-value">{formatPrice(product.currentBid, product.seller?.currency)}</span>
                          </div>
                        {/if}
                      </div>
                      <div class="product-meta">
                        <span class="meta-item">📅 Ends: {formatDate(product.auctionEndDate)}</span>
                        <span class="status-badge {getStatusBadgeClass(product.status)}">
                          {getStatusText(product.status)}
                        </span>
                      </div>
                    </div>
                  </a>

                  <div class="product-actions">
                    <button class="btn-edit" onclick={() => openEditModal(product)}>
                      ✏️ Edit
                    </button>
                    <a href="/products/{product.id}" class="btn-view">
                      👁️ View
                    </a>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else if productTab === 'hidden'}
          {#if hiddenProducts.length === 0}
            <div class="empty-state">
              <div class="empty-icon">🙈</div>
              <h2>No Hidden Products</h2>
              <p>You don't have any hidden products.</p>
            </div>
          {:else}
            <div class="products-grid">
              {#each hiddenProducts as product}
                <div class="product-card">
                  <a href="/products/{product.id}" class="card-link">
                    <div class="product-image">
                      {#if product.images && product.images.length > 0}
                        {@const validImages = product.images.filter((img: any) => img && img.image && img.image.url)}
                        {#if validImages.length > 0}
                          {@const firstImage = validImages[0]}
                          <img src={firstImage.image.url} alt={product.title} />
                        {:else}
                          <div class="placeholder-image">
                            <span class="placeholder-icon">📦</span>
                          </div>
                        {/if}
                      {:else}
                        <div class="placeholder-image">
                          <span class="placeholder-icon">📦</span>
                        </div>
                      {/if}
                    </div>

                    <div class="product-details">
                      <h3>{product.title}</h3>
                      <div class="product-price">
                        <div class="price-row">
                          <span class="price-label">Starting:</span>
                          <span class="price-value">{formatPrice(product.startingPrice, product.seller?.currency)}</span>
                        </div>
                        {#if product.currentBid}
                          <div class="price-row current-bid">
                            <span class="price-label">Current Bid:</span>
                            <span class="price-value">{formatPrice(product.currentBid, product.seller?.currency)}</span>
                          </div>
                        {/if}
                      </div>
                      <div class="product-meta">
                        <span class="meta-item">📅 Ends: {formatDate(product.auctionEndDate)}</span>
                        <span class="status-badge status-hidden">Hidden</span>
                      </div>
                    </div>
                  </a>

                  <div class="product-actions">
                    <button class="btn-edit" onclick={() => openEditModal(product)}>
                      ✏️ Edit
                    </button>
                    <a href="/products/{product.id}" class="btn-view">
                      👁️ View
                    </a>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {:else if productTab === 'ended'}
          {#if endedProducts.length === 0}
            <div class="empty-state">
              <div class="empty-icon">🏁</div>
              <h2>No Ended Auctions</h2>
              <p>When your auctions end, they'll appear here.</p>
            </div>
          {:else}
            <div class="products-grid">
              {#each endedProducts as product}
                <div class="product-card">
                  <a href="/products/{product.id}" class="card-link">
                    <div class="product-image">
                      {#if product.images && product.images.length > 0}
                        {@const validImages = product.images.filter((img: any) => img && img.image && img.image.url)}
                        {#if validImages.length > 0}
                          {@const firstImage = validImages[0]}
                          <img src={firstImage.image.url} alt={product.title} />
                        {:else}
                          <div class="placeholder-image">
                            <span class="placeholder-icon">📦</span>
                          </div>
                        {/if}
                      {:else}
                        <div class="placeholder-image">
                          <span class="placeholder-icon">📦</span>
                        </div>
                      {/if}
                    </div>

                    <div class="product-details">
                      <h3>{product.title}</h3>
                      <div class="product-price">
                        <div class="price-row">
                          <span class="price-label">{product.status === 'sold' ? 'Sold for:' : 'Final bid:'}</span>
                          <span class="price-value sold">{formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)}</span>
                        </div>
                      </div>
                      <div class="product-meta">
                        <span class="meta-item">📅 Ended: {formatDate(product.auctionEndDate)}</span>
                        <span class="status-badge {getStatusBadgeClass(product.status)}">{getStatusText(product.status)}</span>
                      </div>
                    </div>
                  </a>

                  <div class="product-actions">
                    <a href="/products/{product.id}" class="btn-view">
                      👁️ View
                    </a>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <!-- My Purchases Tab Content -->
      <div class="purchases-section">
        {#if purchasesLoading}
          <div class="loading">Loading your purchases...</div>
        {:else if purchasesError}
          <div class="error-message">{purchasesError}</div>
        {:else if purchases.length === 0}
          <div class="empty-state">
            <div class="empty-icon">🛍️</div>
            <h2>No Purchases Yet</h2>
            <p>You haven't won any auctions yet. Start bidding to see your purchases here!</p>
            <a href="/products" class="btn-primary">Browse Products</a>
          </div>
        {:else}
          <div class="purchases-list">
            {#each purchases as product}
              <div class="purchase-card">
                <a href="/products/{product.id}" class="purchase-link">
                  <div class="purchase-image">
                    {#if product.images && product.images.length > 0}
                      {@const validImages = product.images.filter(img => img && img.image && img.image.url)}
                      {#if validImages.length > 0}
                        {@const firstImage = validImages[0]}
                        <img src={firstImage.image.url} alt={product.title} />
                      {:else}
                        <div class="placeholder-image">
                          <span class="placeholder-icon">📦</span>
                        </div>
                      {/if}
                    {:else}
                      <div class="placeholder-image">
                        <span class="placeholder-icon">📦</span>
                      </div>
                    {/if}
                  </div>

                  <div class="purchase-content">
                    <div class="purchase-info">
                      <h3>{product.title}</h3>
                      <div class="purchase-price-tag">
                        {formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)}
                      </div>
                      <div class="purchase-meta-row">
                        <span class="purchase-date">📅 {formatDate(product.updatedAt)}</span>
                        <span class="status-badge {getStatusBadgeClass(product.status)}">
                          {getStatusText(product.status)}
                        </span>
                      </div>
                      <div class="purchase-seller">
                        Seller: {product.seller?.name || 'Unknown'}
                      </div>
                    </div>
                  </div>
                </a>

                <div class="purchase-actions-bar">
                  <a href="/inbox?product={product.id}" class="btn-message">
                    <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Message Seller
                  </a>
                  <a href="/products/{product.id}" class="btn-view-product">
                    View Details
                  </a>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<!-- Edit Product Modal -->
{#if showEditModal && editingProduct}
  <div class="modal-overlay" onkeydown={(e) => e.key === 'Escape' && closeEditModal()} role="button" tabindex="-1">
    <div class="modal-content" onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeEditModal}>&times;</button>

      <div class="modal-header">
        <h2>Edit Product</h2>
      </div>

      <div class="modal-body">
        <ProductForm
          mode="edit"
          product={editingProduct}
          onSuccess={handleEditSuccess}
          onCancel={closeEditModal}
        />
      </div>
    </div>
  </div>
{/if}

<!-- Product View Modal -->
{#if showViewModal && viewingProduct}
  <div class="modal-overlay" onclick={closeViewModal} onkeydown={(e) => e.key === 'Escape' && closeViewModal()} role="button" tabindex="-1">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeViewModal}>&times;</button>

      <div class="modal-body">
        {#if viewingProduct.images && viewingProduct.images.length > 0}
          {@const validImages = viewingProduct.images.filter(img => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            <div class="modal-image-section">
              <ImageSlider images={validImages} productTitle={viewingProduct.title} />
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

        <div class="modal-info">
          <h2>{viewingProduct.title}</h2>
          <p class="product-description">{viewingProduct.description}</p>

          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Starting Price:</span>
              <span class="info-value">{formatPrice(viewingProduct.startingPrice, viewingProduct.seller?.currency)}</span>
            </div>
            {#if viewingProduct.currentBid}
              <div class="info-item">
                <span class="info-label">Current Bid:</span>
                <span class="info-value">{formatPrice(viewingProduct.currentBid, viewingProduct.seller?.currency)}</span>
              </div>
            {/if}
            <div class="info-item">
              <span class="info-label">Auction Ends:</span>
              <span class="info-value">{formatDate(viewingProduct.auctionEndDate)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Status:</span>
              <span class="status-badge {getStatusBadgeClass(viewingProduct.status)}">
                {getStatusText(viewingProduct.status)}
              </span>
            </div>
          </div>

          <a href="/products/{viewingProduct.id}" class="btn-view-full">View Full Details</a>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Purchase Product Modal -->
{#if showProductModal && selectedProduct}
  <div class="modal-overlay" onclick={closeProductModal} onkeydown={(e) => e.key === 'Escape' && closeProductModal()} role="button" tabindex="-1">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeProductModal}>&times;</button>

      <div class="modal-body">
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

        <div class="modal-info">
          <h2>{selectedProduct.title}</h2>
          <p class="product-description">{selectedProduct.description}</p>

          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Won For:</span>
              <span class="info-value won">{formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller?.currency)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Purchase Date:</span>
              <span class="info-value">{formatDate(selectedProduct.updatedAt)}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Status:</span>
              <span class="status-badge {getStatusBadgeClass(selectedProduct.status)}">
                {getStatusText(selectedProduct.status)}
              </span>
            </div>
          </div>

          <a href="/products/{selectedProduct.id}" class="btn-view-full">View Full Details</a>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .dashboard-page {
    min-height: calc(100vh - 200px);
  }

  .page-header {
    margin-bottom: 2rem;
  }

  .page-header h1 {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--color-fg);
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1.125rem;
  }

  /* Main Tabs */
  .main-tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid var(--color-border);
    margin-bottom: 2rem;
  }

  .main-tab {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .main-tab:hover {
    color: var(--color-red);
    opacity: 1;
    background: var(--color-muted);
  }

  .main-tab.active {
    color: var(--color-red);
    border-bottom-color: var(--color-red);
    background: var(--color-muted);
    opacity: 1;
  }

  .tab-icon {
    font-size: 1.5rem;
  }

  /* Sub Tabs */
  .sub-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  .sub-tab {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
  }

  .sub-tab:hover {
    color: var(--color-red);
    opacity: 1;
  }

  .sub-tab.active {
    color: var(--color-red);
    border-bottom-color: var(--color-red);
    opacity: 1;
  }

  /* Tab Content */
  .tab-content {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Products Grid */
  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .product-card {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .product-card:hover {
    box-shadow: var(--shadow-bh-sm);
    transform: translateY(-4px);
  }

  .card-link {
    display: block;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }

  .card-link:hover .product-image img {
    transform: scale(1.03);
    transition: transform 0.3s ease;
  }

  .product-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    background: var(--color-muted);
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
    background: var(--color-muted);
  }

  .placeholder-icon {
    font-size: 4rem;
    opacity: 0.3;
  }

  .product-details {
    padding: 1.25rem;
  }

  .product-details h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-bottom: 0.75rem;
    color: var(--color-fg);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .product-price {
    margin-bottom: 0.75rem;
  }

  .price-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .price-label {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
  }

  .price-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--color-fg);
  }

  .price-value.sold,
  .price-value.won {
    color: var(--color-blue);
  }

  .current-bid .price-value {
    color: var(--color-red);
  }

  .product-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border);
  }

  .meta-item {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-active {
    background: var(--color-blue);
    color: white;
  }

  .status-sold {
    background: var(--color-yellow);
    color: var(--color-fg);
  }

  .status-ended {
    background: var(--color-red);
    color: white;
  }

  .status-hidden {
    background: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.7;
  }

  .status-cancelled {
    background: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.7;
  }

  .product-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid var(--color-border);
  }

  .btn-edit,
  .btn-view {
    flex: 1;
    padding: 0.625rem 1rem;
    border: 2px solid var(--color-border);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-edit {
    background: var(--color-yellow);
    color: var(--color-fg);
  }

  .btn-edit:hover {
    opacity: 0.85;
  }

  .btn-view {
    background: var(--color-blue);
    color: white;
  }

  .btn-view:hover {
    opacity: 0.85;
  }

  /* Purchases List */
  .purchases-list {
    display: grid;
    gap: 1.5rem;
  }

  .purchase-card {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .purchase-card:hover {
    box-shadow: var(--shadow-bh-sm);
    transform: translateY(-2px);
  }

  .purchase-link {
    display: flex;
    text-decoration: none;
    color: inherit;
    cursor: pointer;
  }

  .purchase-link:hover .purchase-image img {
    transform: scale(1.05);
  }

  .purchase-image {
    width: 200px;
    height: 200px;
    flex-shrink: 0;
    overflow: hidden;
    background: var(--color-muted);
    position: relative;
  }

  .purchase-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }

  .purchase-card:hover .purchase-image img {
    transform: scale(1.05);
  }

  .purchase-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    min-width: 0;
  }

  .purchase-info {
    flex: 1;
    cursor: pointer;
  }

  .purchase-info h3 {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-fg);
    margin-bottom: 0.5rem;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .purchase-price-tag {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-blue);
    margin-bottom: 0.75rem;
  }

  .purchase-meta-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
    flex-wrap: wrap;
  }

  .purchase-date {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
  }

  .purchase-seller {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
    margin-bottom: 1rem;
  }

  .purchase-actions-bar {
    display: flex;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--color-border);
  }

  .btn-message {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    background: var(--color-blue);
    color: white;
    border: 2px solid var(--color-border);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
    transition: all 0.2s;
    flex: 1;
  }

  .btn-message:hover {
    opacity: 0.85;
  }

  .btn-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .btn-view-product {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.25rem;
    background: var(--color-white);
    color: var(--color-fg);
    border: var(--border-bh) solid var(--color-border);
    font-weight: 600;
    font-size: 0.9rem;
    text-decoration: none;
    transition: all 0.2s;
    flex: 1;
  }

  .btn-view-product:hover {
    background: var(--color-muted);
  }

  /* Tablet styles for purchases */
  @media (min-width: 769px) and (max-width: 1024px) {
    .purchase-image {
      width: 160px;
      height: 160px;
    }

    .purchase-content {
      padding: 1.25rem;
    }

    .purchase-actions-bar {
      flex-direction: column;
      gap: 0.5rem;
    }
  }

  /* Empty State */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  .empty-icon {
    font-size: 5rem;
    margin-bottom: 1.5rem;
    opacity: 0.5;
  }

  .empty-state h2 {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--color-fg);
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 1.125rem;
    margin-bottom: 2rem;
  }

  .btn-primary {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: var(--color-red);
    color: white;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    opacity: 0.85;
  }

  /* Loading & Error */
  .loading {
    text-align: center;
    padding: 3rem;
    font-size: 1.125rem;
    color: var(--color-fg);
    opacity: 0.6;
  }

  .error-message {
    text-align: center;
    padding: 2rem;
    background: var(--color-red);
    color: white;
    border: var(--border-bh) solid var(--color-border);
    font-weight: 500;
  }

  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.2s ease-out;
  }

  .modal-content {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-md);
    max-width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 40px;
    height: 40px;
    background: var(--color-muted);
    border: 2px solid var(--color-border);
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: var(--color-white);
  }

  .modal-header {
    padding: 2rem 2rem 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header h2 {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--color-fg);
  }

  .modal-body {
    padding: 2rem;
  }

  .modal-image-section {
    margin-bottom: 2rem;
  }

  .modal-placeholder-image {
    width: 100%;
    height: 400px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-muted);
    margin-bottom: 2rem;
  }

  .modal-placeholder-image .placeholder-icon {
    font-size: 6rem;
  }

  .modal-info h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-fg);
    margin-bottom: 1rem;
  }

  .product-description {
    color: var(--color-fg);
    opacity: 0.8;
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-label {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.6;
    font-weight: 500;
  }

  .info-value {
    font-size: 1.125rem;
    color: var(--color-fg);
    font-weight: 600;
  }

  .info-value.won {
    color: var(--color-blue);
    font-size: 1.5rem;
  }

  .btn-view-full {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: var(--color-red);
    color: white;
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-view-full:hover {
    opacity: 0.85;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .main-tabs {
      flex-direction: column;
      gap: 0;
    }

    .main-tab {
      border-bottom: 1px solid var(--color-border);
      border-left: 3px solid transparent;
      margin-bottom: 0;
      margin-left: -2px;
    }

    .main-tab.active {
      border-left-color: var(--color-red);
      border-bottom-color: var(--color-border);
    }

    .products-grid {
      grid-template-columns: 1fr;
      padding: 0;
    }

    .product-card {
      box-shadow: 2px 2px 0px var(--color-border);
    }

    .product-card:hover {
      transform: none;
    }

    .purchase-image {
      width: 100%;
      height: 180px;
    }

    .purchase-content {
      padding: 1.25rem;
    }

    .purchase-info h3 {
      font-size: 1.1rem;
    }

    .purchase-price-tag {
      font-size: 1.25rem;
    }

    .purchase-link {
      flex-direction: column;
    }

    .purchase-actions-bar {
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem 1.25rem;
    }

    .btn-message,
    .btn-view-product {
      width: 100%;
      padding: 0.875rem 1rem;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
