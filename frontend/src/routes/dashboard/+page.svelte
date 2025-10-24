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

  export let data: PageData;
  export let params: any = undefined; // SvelteKit passes this automatically

  // Tab management
  type TabType = 'products' | 'purchases';
  let activeTab: TabType = 'products';

  // Separate products by status and visibility
  $: activeProducts = data.activeProducts;
  $: hiddenProducts = data.hiddenProducts;
  $: endedProducts = data.endedProducts;

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
        data.activeProducts = data.activeProducts.filter(p => p.id !== productId);
        data.hiddenProducts = data.hiddenProducts.filter(p => p.id !== productId);

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
      on:click={() => switchTab('products')}
    >
      <span class="tab-icon">📦</span>
      <span class="tab-label">My Products</span>
    </button>
    <button
      class="main-tab"
      class:active={activeTab === 'purchases'}
      on:click={() => switchTab('purchases')}
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
            on:click={() => productTab = 'active'}
          >
            Active ({activeProducts.length})
          </button>
          <button
            class="sub-tab"
            class:active={productTab === 'hidden'}
            on:click={() => productTab = 'hidden'}
          >
            Hidden ({hiddenProducts.length})
          </button>
          <button
            class="sub-tab"
            class:active={productTab === 'ended'}
            on:click={() => productTab = 'ended'}
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
                  <div class="product-image" on:click={() => openViewModal(product)} role="button" tabindex="0">
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

                  <div class="product-details">
                    <h3>{product.title}</h3>
                    <div class="product-price">
                      <div class="price-row">
                        <span class="price-label">Starting:</span>
                        <span class="price-value">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                      </div>
                      {#if product.currentBid}
                        <div class="price-row current-bid">
                          <span class="price-label">Current Bid:</span>
                          <span class="price-value">{formatPrice(product.currentBid, product.seller.currency)}</span>
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

                  <div class="product-actions">
                    <button class="btn-edit" on:click={() => openEditModal(product)}>
                      ✏️ Edit
                    </button>
                    <button class="btn-view" on:click={() => openViewModal(product)}>
                      👁️ View
                    </button>
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
                  <div class="product-image" on:click={() => openViewModal(product)} role="button" tabindex="0">
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

                  <div class="product-details">
                    <h3>{product.title}</h3>
                    <div class="product-price">
                      <div class="price-row">
                        <span class="price-label">Starting:</span>
                        <span class="price-value">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                      </div>
                      {#if product.currentBid}
                        <div class="price-row current-bid">
                          <span class="price-label">Current Bid:</span>
                          <span class="price-value">{formatPrice(product.currentBid, product.seller.currency)}</span>
                        </div>
                      {/if}
                    </div>
                    <div class="product-meta">
                      <span class="meta-item">📅 Ends: {formatDate(product.auctionEndDate)}</span>
                      <span class="status-badge status-hidden">Hidden</span>
                    </div>
                  </div>

                  <div class="product-actions">
                    <button class="btn-edit" on:click={() => openEditModal(product)}>
                      ✏️ Edit
                    </button>
                    <button class="btn-view" on:click={() => openViewModal(product)}>
                      👁️ View
                    </button>
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
                  <div class="product-image" on:click={() => openViewModal(product)} role="button" tabindex="0">
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

                  <div class="product-details">
                    <h3>{product.title}</h3>
                    <div class="product-price">
                      <div class="price-row">
                        <span class="price-label">{product.status === 'sold' ? 'Sold for:' : 'Final bid:'}</span>
                        <span class="price-value sold">{formatPrice(product.currentBid || product.startingPrice, product.seller.currency)}</span>
                      </div>
                    </div>
                    <div class="product-meta">
                      <span class="meta-item">📅 Ended: {formatDate(product.auctionEndDate)}</span>
                      <span class="status-badge {getStatusBadgeClass(product.status)}">{getStatusText(product.status)}</span>
                    </div>
                  </div>

                  <div class="product-actions">
                    <button class="btn-view" on:click={() => openViewModal(product)}>
                      👁️ View
                    </button>
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
              <div class="purchase-item" on:click={() => openProductModal(product)} role="button" tabindex="0">
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

                <div class="purchase-details">
                  <h3>{product.title}</h3>
                  <div class="purchase-meta">
                    <span class="purchase-price">Won for: {formatPrice(product.currentBid || product.startingPrice, product.seller.currency)}</span>
                    <span class="purchase-date">📅 {formatDate(product.updatedAt)}</span>
                  </div>
                  <span class="status-badge {getStatusBadgeClass(product.status)}">
                    {getStatusText(product.status)}
                  </span>
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
  <div class="modal-overlay" on:keydown={(e) => e.key === 'Escape' && closeEditModal()} role="button" tabindex="-1">
    <div class="modal-content" on:keydown|stopPropagation role="dialog" tabindex="-1">
      <button class="modal-close" on:click={closeEditModal}>&times;</button>

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
  <div class="modal-overlay" on:click={closeViewModal} on:keydown={(e) => e.key === 'Escape' && closeViewModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
      <button class="modal-close" on:click={closeViewModal}>&times;</button>

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
              <span class="info-value">{formatPrice(viewingProduct.startingPrice, viewingProduct.seller.currency)}</span>
            </div>
            {#if viewingProduct.currentBid}
              <div class="info-item">
                <span class="info-label">Current Bid:</span>
                <span class="info-value">{formatPrice(viewingProduct.currentBid, viewingProduct.seller.currency)}</span>
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
  <div class="modal-overlay" on:click={closeProductModal} on:keydown={(e) => e.key === 'Escape' && closeProductModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown|stopPropagation role="dialog" tabindex="-1">
      <button class="modal-close" on:click={closeProductModal}>&times;</button>

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
              <span class="info-value won">{formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller.currency)}</span>
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
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .subtitle {
    color: #6b7280;
    font-size: 1.125rem;
  }

  /* Main Tabs */
  .main-tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
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
    color: #6b7280;
    font-size: 1.125rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .main-tab:hover {
    color: #dc2626;
    background: rgba(220, 38, 38, 0.05);
  }

  .main-tab.active {
    color: #dc2626;
    border-bottom-color: #dc2626;
    background: rgba(220, 38, 38, 0.05);
  }

  .tab-icon {
    font-size: 1.5rem;
  }

  /* Sub Tabs */
  .sub-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .sub-tab {
    padding: 0.75rem 1.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #6b7280;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -1px;
  }

  .sub-tab:hover {
    color: #dc2626;
  }

  .sub-tab.active {
    color: #dc2626;
    border-bottom-color: #dc2626;
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
    background: white;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: all 0.3s ease;
  }

  .product-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-4px);
  }

  .product-image {
    width: 100%;
    height: 200px;
    overflow: hidden;
    cursor: pointer;
    background: #f3f4f6;
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
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
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
    color: #1f2937;
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
    color: #6b7280;
  }

  .price-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: #1f2937;
  }

  .price-value.sold,
  .price-value.won {
    color: #059669;
  }

  .current-bid .price-value {
    color: #dc2626;
  }

  .product-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid #e5e7eb;
  }

  .meta-item {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .status-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-active {
    background: #dcfce7;
    color: #166534;
  }

  .status-sold {
    background: #dbeafe;
    color: #1e40af;
  }

  .status-ended {
    background: #fee2e2;
    color: #991b1b;
  }

  .status-hidden {
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-cancelled {
    background: #fef3c7;
    color: #92400e;
  }

  .product-actions {
    display: flex;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-edit,
  .btn-view {
    flex: 1;
    padding: 0.625rem 1rem;
    border-radius: 6px;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-edit {
    background: #fef3c7;
    color: #92400e;
  }

  .btn-edit:hover {
    background: #fde68a;
  }

  .btn-view {
    background: #dbeafe;
    color: #1e40af;
  }

  .btn-view:hover {
    background: #bfdbfe;
  }

  /* Purchases List */
  .purchases-list {
    display: grid;
    gap: 1.5rem;
  }

  .purchase-item {
    display: flex;
    gap: 1.5rem;
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.3s ease;
  }

  .purchase-item:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateX(4px);
  }

  .purchase-image {
    width: 150px;
    height: 150px;
    flex-shrink: 0;
    border-radius: 8px;
    overflow: hidden;
    background: #f3f4f6;
  }

  .purchase-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .purchase-details {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .purchase-details h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.75rem;
  }

  .purchase-meta {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .purchase-price {
    font-size: 1.25rem;
    font-weight: 700;
    color: #059669;
  }

  .purchase-date {
    font-size: 0.875rem;
    color: #6b7280;
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
    color: #1f2937;
    margin-bottom: 0.5rem;
  }

  .empty-state p {
    color: #6b7280;
    font-size: 1.125rem;
    margin-bottom: 2rem;
  }

  .btn-primary {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  /* Loading & Error */
  .loading {
    text-align: center;
    padding: 3rem;
    font-size: 1.125rem;
    color: #6b7280;
  }

  .error-message {
    text-align: center;
    padding: 2rem;
    background: #fee2e2;
    color: #991b1b;
    border-radius: 8px;
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
    background: white;
    border-radius: 12px;
    max-width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .modal-close:hover {
    background: white;
    transform: scale(1.1);
  }

  .modal-header {
    padding: 2rem 2rem 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h2 {
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
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
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
    border-radius: 12px;
    margin-bottom: 2rem;
  }

  .modal-placeholder-image .placeholder-icon {
    font-size: 6rem;
  }

  .modal-info h2 {
    font-size: 1.75rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .product-description {
    color: #4b5563;
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
    color: #6b7280;
    font-weight: 500;
  }

  .info-value {
    font-size: 1.125rem;
    color: #1f2937;
    font-weight: 600;
  }

  .info-value.won {
    color: #059669;
    font-size: 1.5rem;
  }

  .btn-view-full {
    display: inline-block;
    padding: 0.75rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    text-decoration: none;
    transition: all 0.2s;
  }

  .btn-view-full:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .main-tabs {
      flex-direction: column;
      gap: 0;
    }

    .main-tab {
      border-bottom: 1px solid #e5e7eb;
      border-left: 3px solid transparent;
      margin-bottom: 0;
      margin-left: -2px;
    }

    .main-tab.active {
      border-left-color: #dc2626;
      border-bottom-color: #e5e7eb;
    }

    .products-grid {
      grid-template-columns: 1fr;
    }

    .purchase-item {
      flex-direction: column;
    }

    .purchase-image {
      width: 100%;
      height: 200px;
    }

    .info-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
