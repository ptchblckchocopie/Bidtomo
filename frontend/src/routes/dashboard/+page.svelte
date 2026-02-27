<script lang="ts">
  import type { PageData } from './$types';
  import { type Product, fetchProduct, updateProduct, fetchActiveProductsBySeller, fetchHiddenProductsBySeller, fetchEndedProductsBySeller } from '$lib/api';
  import { fetchMyPurchases } from '$lib/api';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getUserSSE, disconnectUserSSE, type ProductVisibilityEvent } from '$lib/sse';

  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import ProductForm from '$lib/components/ProductForm.svelte';

  let { data } = $props<{ data: PageData }>();

  // Tab management
  type TabType = 'products' | 'purchases';
  let activeTab: TabType = $state('products');

  // Separate products by status and visibility (local state for instant UI updates)
  let activeProducts: Product[] = $state(data.activeProducts);
  let hiddenProducts: Product[] = $state(data.hiddenProducts);
  let endedProducts: Product[] = $state(data.endedProducts);

  // Purchases state
  let purchases: Product[] = $state([]);
  let purchasesLoading = $state(false);
  let purchasesError = $state('');

  // Modal states
  let showEditModal = $state(false);
  let showViewModal = $state(false);
  let editingProduct: Product | null = $state(null);
  let viewingProduct: Product | null = $state(null);
  let showProductModal = $state(false);
  let selectedProduct: Product | null = $state(null);

  // Hide/unhide confirmation modal
  let showHideModal = $state(false);
  let hideModalProduct: Product | null = $state(null);
  let hideModalLoading = $state(false);

  function openHideModal(product: Product) {
    hideModalProduct = product;
    showHideModal = true;
  }

  function closeHideModal() {
    showHideModal = false;
    hideModalLoading = false;
    hideModalProduct = null;
  }

  async function confirmToggleVisibility() {
    if (!hideModalProduct) return;
    hideModalLoading = true;
    try {
      const newActive = !hideModalProduct.active;
      const result = await updateProduct(String(hideModalProduct.id), { active: newActive });
      if (result) {
        const productId = hideModalProduct.id;
        if (newActive) {
          // Move from hidden to active
          const product = hiddenProducts.find(p => p.id === productId);
          if (product) {
            hiddenProducts = hiddenProducts.filter(p => p.id !== productId);
            activeProducts = [...activeProducts, { ...product, active: true }];
          }
        } else {
          // Move from active to hidden
          const product = activeProducts.find(p => p.id === productId);
          if (product) {
            activeProducts = activeProducts.filter(p => p.id !== productId);
            hiddenProducts = [...hiddenProducts, { ...product, active: false }];
          }
        }
      }
    } finally {
      closeHideModal();
    }
  }

  // Product view state
  let productTab: 'active' | 'hidden' | 'ended' = $state('active');

  // Refresh product lists from server (used when returning to page after hide/unhide elsewhere)
  async function refreshProducts() {
    if (!data.user?.id) return;
    const sellerId = String(data.user.id);
    const [fresh_active, fresh_hidden, fresh_ended] = await Promise.all([
      fetchActiveProductsBySeller(sellerId),
      fetchHiddenProductsBySeller(sellerId),
      fetchEndedProductsBySeller(sellerId),
    ]);
    activeProducts = fresh_active;
    hiddenProducts = fresh_hidden;
    endedProducts = fresh_ended;
  }

  // SSE cleanup
  let unsubscribeSSE: (() => void) | null = null;

  onDestroy(() => {
    if (unsubscribeSSE) unsubscribeSSE();
    if (data.user?.id) disconnectUserSSE(String(data.user.id));
  });

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
    if (!editingProduct) return;

    const productId = editingProduct.id;
    const wasActive = editingProduct.active;
    const isActive = updatedProduct.active;
    const merged = { ...updatedProduct, seller: editingProduct.seller };

    // If active status changed, move product between arrays
    if (wasActive !== isActive) {
      activeProducts = activeProducts.filter(p => p.id !== productId);
      hiddenProducts = hiddenProducts.filter(p => p.id !== productId);

      if (isActive) {
        activeProducts = [...activeProducts, merged];
      } else {
        hiddenProducts = [...hiddenProducts, merged];
      }
    } else {
      // Same category — update in place
      const update = (arr: Product[]) => {
        const idx = arr.findIndex(p => p.id === productId);
        if (idx !== -1) return [...arr.slice(0, idx), merged, ...arr.slice(idx + 1)];
        return arr;
      };
      activeProducts = update(activeProducts);
      hiddenProducts = update(hiddenProducts);
      endedProducts = update(endedProducts);
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

    // Subscribe to user SSE for real-time product visibility changes (e.g. admin hides a product)
    if (data.user?.id) {
      const userSSE = getUserSSE(String(data.user.id));
      userSSE.connect();
      unsubscribeSSE = userSSE.subscribe(async (event) => {
        if (event.type === 'product_visibility') {
          const { productId, active } = event as ProductVisibilityEvent;
          const pid = String(productId);
          if (active) {
            // Product was unhidden — move from hidden to active
            const product = hiddenProducts.find(p => String(p.id) === pid);
            if (product) {
              hiddenProducts = hiddenProducts.filter(p => String(p.id) !== pid);
              activeProducts = [...activeProducts, { ...product, active: true }];
            }
          } else {
            // Product was hidden — move from active to hidden
            const product = activeProducts.find(p => String(p.id) === pid);
            if (product) {
              activeProducts = activeProducts.filter(p => String(p.id) !== pid);
              hiddenProducts = [...hiddenProducts, { ...product, active: false }];
            }
          }
        }
      });
    }

    // Re-fetch product lists when user returns to this tab/page
    // Covers: browser tab switch, and SPA navigation back from product detail after hide/unhide
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        refreshProducts();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Also refresh on SPA navigation back (component remounts with possibly stale cached data)
    refreshProducts();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
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
                    {#if data.user?.role === 'admin'}
                      <button class="btn-hide" onclick={() => openHideModal(product)}>
                        🙈 Hide
                      </button>
                    {/if}
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
                    {#if data.user?.role === 'admin'}
                      <button class="btn-unhide" onclick={() => openHideModal(product)}>
                        👁️ Unhide
                      </button>
                    {/if}
                    <a href="/products/{product.id}" class="btn-view">
                      🔗 View
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

<!-- Hide/Unhide Confirmation Modal -->
{#if showHideModal && hideModalProduct}
  <div class="hide-modal-overlay" onclick={closeHideModal} onkeydown={(e) => e.key === 'Escape' && closeHideModal()} role="button" tabindex="-1">
    <div class="hide-modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="hide-modal-close" onclick={closeHideModal} disabled={hideModalLoading}>&times;</button>

      <div class="hide-modal-header">
        <h2>{hideModalProduct.active ? 'Hide Product' : 'Unhide Product'}</h2>
      </div>

      <div class="hide-modal-body">
        <p class="hide-modal-product-title">"{hideModalProduct.title}"</p>
        <p class="hide-modal-description">
          {#if hideModalProduct.active}
            This product will be hidden from the Browse Products page and won't be visible to other users. You can unhide it later from the Hidden tab.
          {:else}
            This product will be restored and visible to all users again on the Browse Products page.
          {/if}
        </p>

        <div class="hide-modal-actions">
          <button class="btn-hide-cancel" onclick={closeHideModal} disabled={hideModalLoading}>
            Cancel
          </button>
          <button
            class="btn-hide-confirm {hideModalProduct.active ? 'btn-confirm-hide' : 'btn-confirm-unhide'}"
            onclick={confirmToggleVisibility}
            disabled={hideModalLoading}
          >
            {#if hideModalLoading}
              <span class="hide-spinner"></span>
              Processing...
            {:else}
              {hideModalProduct.active ? 'Hide Product' : 'Unhide Product'}
            {/if}
          </button>
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

  :global(html.dark) .status-active {
    background: rgba(94, 106, 210, 0.2);
    color: #8b93e0;
    border: 1px solid rgba(94, 106, 210, 0.3);
  }

  :global(html.dark) .status-ended {
    background: rgba(255, 85, 85, 0.15);
    color: #ff7777;
    border: 1px solid rgba(255, 85, 85, 0.25);
  }

  :global(html.dark) .status-sold {
    background: rgba(201, 168, 48, 0.15);
    color: #d4b44a;
    border: 1px solid rgba(201, 168, 48, 0.25);
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

  :global(html.dark) .btn-view {
    background: rgba(94, 106, 210, 0.2);
    color: #8b93e0;
    border: 1px solid rgba(94, 106, 210, 0.3);
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
    .dashboard-page {
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .page-header {
      margin-bottom: 1rem;
    }

    .page-header h1 {
      font-size: 1.5rem;
    }

    .subtitle {
      font-size: 0.95rem;
    }

    .main-tabs {
      display: flex;
      flex-direction: row;
      gap: 0;
      margin-bottom: 1rem;
      margin-left: -1rem;
      margin-right: -1rem;
      border-bottom: 2px solid var(--color-border);
    }

    .main-tab {
      flex: 1;
      padding: 0.75rem 0.5rem;
      font-size: 0.95rem;
      justify-content: center;
      border-bottom: 3px solid transparent;
      border-left: none;
      margin-bottom: -2px;
      margin-left: 0;
    }

    .main-tab.active {
      border-bottom-color: var(--color-red);
      border-left-color: transparent;
    }

    .tab-icon {
      font-size: 1.2rem;
    }

    .sub-tabs {
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      gap: 0;
      margin-bottom: 1rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }

    .sub-tab {
      padding: 0.6rem 1rem;
      font-size: 0.875rem;
      white-space: nowrap;
    }

    .products-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
      padding: 0;
    }

    .product-card {
      border-width: 2px;
      box-shadow: 2px 2px 0px var(--color-border);
    }

    .product-card:hover {
      transform: none;
    }

    .product-image {
      height: 180px;
    }

    .product-details {
      padding: 1rem;
    }

    .product-details h3 {
      font-size: 1rem;
      margin-bottom: 0.5rem;
    }

    .price-value {
      font-size: 1rem;
    }

    .product-meta {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
      padding-top: 0.5rem;
    }

    .meta-item {
      font-size: 0.8rem;
    }

    .product-actions {
      padding: 0.75rem 1rem;
    }

    .btn-edit,
    .btn-view {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }

    .purchase-card {
      border-width: 2px;
      box-shadow: 2px 2px 0px var(--color-border);
    }

    .purchase-card:hover {
      transform: none;
    }

    .purchase-image {
      width: 100%;
      height: 180px;
    }

    .purchase-content {
      padding: 1rem;
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
      padding: 0.75rem 1rem;
    }

    .btn-message,
    .btn-view-product {
      width: 100%;
      padding: 0.75rem 1rem;
      font-size: 0.85rem;
    }

    .empty-state {
      padding: 2rem 1rem;
    }

    .empty-icon {
      font-size: 3.5rem;
    }

    .empty-state h2 {
      font-size: 1.25rem;
    }

    .empty-state p {
      font-size: 0.95rem;
    }

    .modal-content {
      max-width: 100%;
      max-height: 100vh;
      width: 100%;
      height: 100%;
      border: none;
      box-shadow: none;
    }

    .modal-header {
      padding: 1.25rem 1rem 0.75rem;
    }

    .modal-header h2 {
      font-size: 1.25rem;
    }

    .modal-body {
      padding: 1rem;
    }

    .modal-close {
      top: 0.75rem;
      right: 0.75rem;
      width: 36px;
      height: 36px;
      font-size: 1.25rem;
    }

    .info-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .modal-info h2 {
      font-size: 1.25rem;
    }

    .btn-view-full {
      width: 100%;
      text-align: center;
      display: block;
    }

    .hide-modal-content {
      margin: 1rem;
      max-width: calc(100vw - 2rem);
    }
  }

  /* Hide/Unhide buttons */
  .btn-hide,
  .btn-unhide {
    flex: 1;
    padding: 0.625rem 1rem;
    border: 2px solid var(--color-border);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-align: center;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .btn-hide {
    background: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-hide:hover {
    background: var(--color-fg);
    color: white;
  }

  :global(html.dark) .btn-hide:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--color-fg);
  }

  .btn-unhide {
    background: var(--color-green);
    color: white;
  }

  .btn-unhide:hover {
    opacity: 0.85;
  }

  /* Hide/Unhide Confirmation Modal */
  .hide-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: hideOverlayFadeIn 0.2s ease-out;
  }

  @keyframes hideOverlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .hide-modal-content {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    box-shadow: var(--shadow-bh-sm);
    max-width: 440px;
    width: 100%;
    position: relative;
    animation: hideModalSlideUp 0.25s ease-out;
  }

  @keyframes hideModalSlideUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .hide-modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-fg);
    opacity: 0.5;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hide-modal-close:hover {
    opacity: 1;
  }

  .hide-modal-close:disabled {
    cursor: not-allowed;
    opacity: 0.3;
  }

  .hide-modal-header {
    padding: 1.5rem 1.5rem 0;
  }

  .hide-modal-header h2 {
    font-size: 1.25rem;
    font-weight: 700;
    margin: 0;
  }

  .hide-modal-body {
    padding: 1rem 1.5rem 1.5rem;
  }

  .hide-modal-product-title {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--color-fg);
    margin-bottom: 0.5rem;
  }

  .hide-modal-description {
    color: var(--color-fg);
    opacity: 0.7;
    line-height: 1.5;
    margin-bottom: 1.5rem;
  }

  .hide-modal-actions {
    display: flex;
    gap: 0.75rem;
  }

  .btn-hide-cancel {
    flex: 1;
    padding: 0.75rem 1.5rem;
    background: var(--color-muted);
    border: 2px solid var(--color-border);
    color: var(--color-fg);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-hide-cancel:hover {
    background: var(--color-border);
  }

  .btn-hide-cancel:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .btn-hide-confirm {
    flex: 1;
    padding: 0.75rem 1.5rem;
    border: 2px solid transparent;
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .btn-confirm-hide {
    background: var(--color-red);
    border-color: var(--color-red);
  }

  .btn-confirm-hide:hover {
    opacity: 0.85;
  }

  .btn-confirm-unhide {
    background: var(--color-green);
    border-color: var(--color-green);
  }

  .btn-confirm-unhide:hover {
    opacity: 0.85;
  }

  .btn-hide-confirm:disabled {
    cursor: not-allowed;
    opacity: 0.7;
  }

  .hide-spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: hideSpinnerRotate 0.6s linear infinite;
  }

  @keyframes hideSpinnerRotate {
    to { transform: rotate(360deg); }
  }
</style>
