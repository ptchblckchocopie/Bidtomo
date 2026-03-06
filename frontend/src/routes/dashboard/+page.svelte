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

  // Timeout cleanup
  let editSuccessTimeout: ReturnType<typeof setTimeout> | null = null;

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
    if (editSuccessTimeout) clearTimeout(editSuccessTimeout);
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

    editSuccessTimeout = setTimeout(() => {
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

<div class="min-h-[calc(100vh-200px)] sm:px-4 sm:-mx-4">
  <!-- Page Header -->
  <div class="mb-8 sm:mb-4">
    <h1 class="headline-bh text-4xl mb-1 tracking-tight font-display sm:text-2xl">Dashboard</h1>
    <p class="label-bh text-sm font-mono uppercase tracking-widest">Manage your products and purchases</p>

    <!-- Stats grid — glass panels -->
    <div class="grid grid-cols-3 gap-4 mt-6 sm:grid-cols-1 sm:mt-4">
      <div class="glass-surface p-6 sm:p-4" style="border: 1px solid var(--color-fg);">
        <span class="label-bh block mb-1 font-mono uppercase tracking-widest text-xs">Active Listings</span>
        <span class="text-3xl font-bold font-display sm:text-2xl" style="color: var(--color-fg);">{activeProducts.length}</span>
      </div>
      <div class="glass-surface p-6 sm:p-4" style="border: 1px solid var(--color-fg);">
        <span class="label-bh block mb-1 font-mono uppercase tracking-widest text-xs">Hidden</span>
        <span class="text-3xl font-bold font-display opacity-60 sm:text-2xl" style="color: var(--color-fg);">{hiddenProducts.length}</span>
      </div>
      <div class="glass-surface p-6 sm:p-4" style="border: 1px solid var(--color-fg);">
        <span class="label-bh block mb-1 font-mono uppercase tracking-widest text-xs">Ended</span>
        <span class="text-3xl font-bold font-display opacity-60 sm:text-2xl" style="color: var(--color-fg);">{endedProducts.length}</span>
      </div>
    </div>
  </div>

  <!-- Main Tabs -->
  <div class="flex gap-1 mb-8 sm:mb-4 sm:-mx-4 sm:px-2"
       style="border-bottom: 1px solid var(--color-border);">
    <button
      class="flex items-center gap-2 px-6 py-3.5 border-b-[3px] -mb-[1px] font-mono text-sm uppercase tracking-widest transition-all duration-100
             {activeTab === 'products'
               ? 'border-b-[var(--color-fg)] text-[var(--color-fg)] font-bold'
               : 'border-b-transparent opacity-50 hover:opacity-80'}
             sm:flex-1 sm:justify-center sm:px-2 sm:py-3"
      onclick={() => switchTab('products')}
    >
      <span>My Products</span>
    </button>
    <button
      class="flex items-center gap-2 px-6 py-3.5 border-b-[3px] -mb-[1px] font-mono text-sm uppercase tracking-widest transition-all duration-100
             {activeTab === 'purchases'
               ? 'border-b-[var(--color-fg)] text-[var(--color-fg)] font-bold'
               : 'border-b-transparent opacity-50 hover:opacity-80'}
             sm:flex-1 sm:justify-center sm:px-2 sm:py-3"
      onclick={() => switchTab('purchases')}
    >
      <span>My Purchases</span>
    </button>
  </div>

  <!-- Tab Content -->
  <div class="animate-fade-in">
    {#if activeTab === 'products'}
      <!-- My Products Tab Content -->
      <div>
        <!-- Sub-tabs for product status -->
        <div class="flex gap-1 mb-6 sm:mb-4 sm:-mx-4 sm:px-4 sm:overflow-x-auto"
             style="border-bottom: 1px solid var(--color-border);">
          <button
            class="px-5 py-2.5 border-b-2 -mb-[1px] font-mono text-sm uppercase tracking-widest transition-all duration-100 whitespace-nowrap
                   {productTab === 'active'
                     ? 'border-b-[var(--color-fg)] text-[var(--color-fg)] font-bold'
                     : 'border-b-transparent opacity-50 hover:opacity-80'}
                   sm:px-4 sm:py-2"
            onclick={() => productTab = 'active'}
          >
            Active ({activeProducts.length})
          </button>
          <button
            class="px-5 py-2.5 border-b-2 -mb-[1px] font-mono text-sm uppercase tracking-widest transition-all duration-100 whitespace-nowrap
                   {productTab === 'hidden'
                     ? 'border-b-[var(--color-fg)] text-[var(--color-fg)] font-bold'
                     : 'border-b-transparent opacity-50 hover:opacity-80'}
                   sm:px-4 sm:py-2"
            onclick={() => productTab = 'hidden'}
          >
            Hidden ({hiddenProducts.length})
          </button>
          <button
            class="px-5 py-2.5 border-b-2 -mb-[1px] font-mono text-sm uppercase tracking-widest transition-all duration-100 whitespace-nowrap
                   {productTab === 'ended'
                     ? 'border-b-[var(--color-fg)] text-[var(--color-fg)] font-bold'
                     : 'border-b-transparent opacity-50 hover:opacity-80'}
                   sm:px-4 sm:py-2"
            onclick={() => productTab = 'ended'}
          >
            Ended ({endedProducts.length})
          </button>
        </div>

        <!-- Product Lists -->
        {#if productTab === 'active'}
          {#if activeProducts.length === 0}
            <div class="text-center py-16 sm:py-8">
              <div class="text-6xl mb-6 opacity-50 sm:text-4xl sm:mb-4">&#128230;</div>
              <h2 class="headline-bh text-2xl mb-2 font-display sm:text-xl">No Active Products</h2>
              <p class="label-bh text-sm mb-8 sm:mb-4">You don't have any active products. Start selling now!</p>
              <a href="/sell" class="btn-bh-red">+ List a Product</a>
            </div>
          {:else}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 sm:grid-cols-1 sm:gap-4">
              {#each activeProducts as product}
                {@render productCard(product, 'active')}
              {/each}
            </div>
          {/if}
        {:else if productTab === 'hidden'}
          {#if hiddenProducts.length === 0}
            <div class="text-center py-16 sm:py-8">
              <div class="text-6xl mb-6 opacity-50 sm:text-4xl sm:mb-4">&#128584;</div>
              <h2 class="headline-bh text-2xl mb-2 font-display sm:text-xl">No Hidden Products</h2>
              <p class="label-bh text-sm">You don't have any hidden products.</p>
            </div>
          {:else}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 sm:grid-cols-1 sm:gap-4">
              {#each hiddenProducts as product}
                {@render productCard(product, 'hidden')}
              {/each}
            </div>
          {/if}
        {:else if productTab === 'ended'}
          {#if endedProducts.length === 0}
            <div class="text-center py-16 sm:py-8">
              <div class="text-6xl mb-6 opacity-50 sm:text-4xl sm:mb-4">&#127937;</div>
              <h2 class="headline-bh text-2xl mb-2 font-display sm:text-xl">No Ended Auctions</h2>
              <p class="label-bh text-sm">When your auctions end, they'll appear here.</p>
            </div>
          {:else}
            <div class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6 sm:grid-cols-1 sm:gap-4">
              {#each endedProducts as product}
                {@render productCard(product, 'ended')}
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {:else}
      <!-- My Purchases Tab Content -->
      <div>
        {#if purchasesLoading}
          <div class="text-center py-12 label-bh text-base">Loading your purchases...</div>
        {:else if purchasesError}
          <div class="text-center p-8 glass-surface font-sans"
               style="border: 1px solid var(--color-fg); color: var(--color-fg);">
            {purchasesError}
          </div>
        {:else if purchases.length === 0}
          <div class="text-center py-16 sm:py-8">
            <div class="text-6xl mb-6 opacity-50 sm:text-4xl sm:mb-4">&#128717;&#65039;</div>
            <h2 class="headline-bh text-2xl mb-2 font-display sm:text-xl">No Purchases Yet</h2>
            <p class="label-bh text-sm mb-8 sm:mb-4">You haven't won any auctions yet. Start bidding to see your purchases here!</p>
            <a href="/products" class="btn-bh-red">Browse Products</a>
          </div>
        {:else}
          <div class="grid gap-6 sm:gap-4">
            {#each purchases as product}
              <div class="card-bh overflow-hidden">
                <a href="/products/{product.id}" class="flex text-inherit no-underline cursor-pointer
                                                        sm:flex-col">
                  <div class="w-[200px] h-[200px] flex-shrink-0 overflow-hidden sm:w-full sm:h-[180px]"
                       style="background: var(--color-muted);">
                    {#if product.images && product.images.length > 0}
                      {@const validImages = product.images.filter(img => img && img.image && img.image.url)}
                      {#if validImages.length > 0}
                        {@const firstImage = validImages[0]}
                        <img src={firstImage.image.url} alt={product.title}
                             class="w-full h-full object-cover transition-transform duration-100 hover:scale-105" />
                      {:else}
                        <div class="w-full h-full flex items-center justify-center">
                          <span class="text-5xl opacity-30">&#128230;</span>
                        </div>
                      {/if}
                    {:else}
                      <div class="w-full h-full flex items-center justify-center">
                        <span class="text-5xl opacity-30">&#128230;</span>
                      </div>
                    {/if}
                  </div>

                  <div class="flex-1 flex flex-col p-6 min-w-0 sm:p-4">
                    <h3 class="headline-bh text-xl font-bold mb-2 line-clamp-2 sm:text-lg">{product.title}</h3>
                    <div class="text-2xl font-extrabold mb-3 sm:text-xl" style="font-family: var(--font-mono, ui-monospace, monospace); color: var(--color-fg);">
                      {formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)}
                    </div>
                    <div class="flex items-center gap-4 mb-2 flex-wrap">
                      <span class="label-bh">&#128197; {formatDate(product.updatedAt)}</span>
                      <span class="badge-bh {getStatusBadgeClass(product.status)}">
                        {getStatusText(product.status)}
                      </span>
                    </div>
                    <div class="label-bh">
                      Seller: {product.seller?.name || 'Unknown'}
                    </div>
                  </div>
                </a>

                <div class="flex gap-3 p-4 sm:flex-col sm:gap-2 sm:p-3"
                     style="border-top: 1px solid var(--color-border);">
                  <a href="/inbox?product={product.id}"
                     class="btn-bh-outline flex-1 text-center inline-flex items-center justify-center gap-2">
                    <svg class="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    Message Seller
                  </a>
                  <a href="/products/{product.id}" class="btn-bh flex-1 text-center">
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
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] animate-fade-in"
       onkeydown={(e) => e.key === 'Escape' && closeEditModal()} role="button" tabindex="-1">
    <div class="glass-elevated max-w-[90%] max-h-[90vh] overflow-y-auto relative
                sm:max-w-full sm:max-h-full sm:w-full sm:h-full sm:border-none"
         onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-2xl
                     cursor-pointer transition-all z-10 glass-surface
                     sm:top-3 sm:right-3 sm:w-9 sm:h-9 sm:text-xl"
              style="color: var(--color-fg);"
              onclick={closeEditModal}>&times;</button>

      <div class="p-8 sm:p-5" style="border-bottom: 1px solid var(--color-border);">
        <h2 class="headline-bh text-2xl font-display tracking-tight sm:text-xl">Edit Product</h2>
      </div>

      <div class="p-8 sm:p-4">
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
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] animate-fade-in"
       onclick={closeViewModal} onkeydown={(e) => e.key === 'Escape' && closeViewModal()} role="button" tabindex="-1">
    <div class="glass-elevated max-w-[90%] max-h-[90vh] overflow-y-auto relative
                sm:max-w-full sm:max-h-full sm:w-full sm:h-full sm:border-none"
         onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-2xl
                     cursor-pointer transition-all z-10 glass-surface
                     sm:top-3 sm:right-3 sm:w-9 sm:h-9 sm:text-xl"
              style="color: var(--color-fg);"
              onclick={closeViewModal}>&times;</button>

      <div class="p-8 sm:p-4">
        {#if viewingProduct.images && viewingProduct.images.length > 0}
          {@const validImages = viewingProduct.images.filter(img => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            <div class="mb-8">
              <ImageSlider images={validImages} productTitle={viewingProduct.title} />
            </div>
          {:else}
            <div class="w-full h-[400px] flex items-center justify-center mb-8" style="background: var(--color-muted);">
              <span class="text-7xl opacity-30">&#128230;</span>
            </div>
          {/if}
        {:else}
          <div class="w-full h-[400px] flex items-center justify-center mb-8" style="background: var(--color-muted);">
            <span class="text-7xl opacity-30">&#128230;</span>
          </div>
        {/if}

        <div>
          <h2 class="headline-bh text-2xl mb-4 sm:text-xl">{viewingProduct.title}</h2>
          <p class="leading-relaxed mb-8 font-sans" style="color: var(--color-fg); opacity: 0.8;">{viewingProduct.description}</p>

          <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 mb-8 sm:grid-cols-1 sm:gap-4">
            <div class="flex flex-col gap-1">
              <span class="label-bh font-mono">Starting Price</span>
              <span class="text-lg font-semibold text-bh-fg">{formatPrice(viewingProduct.startingPrice, viewingProduct.seller?.currency)}</span>
            </div>
            {#if viewingProduct.currentBid}
              <div class="flex flex-col gap-1">
                <span class="label-bh font-mono">Current Bid</span>
                <span class="text-lg font-semibold text-bh-fg">{formatPrice(viewingProduct.currentBid, viewingProduct.seller?.currency)}</span>
              </div>
            {/if}
            <div class="flex flex-col gap-1">
              <span class="label-bh font-mono">Auction Ends</span>
              <span class="text-lg font-semibold text-bh-fg">{formatDate(viewingProduct.auctionEndDate)}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="label-bh">Status</span>
              <span class="badge-bh {getStatusBadgeClass(viewingProduct.status)} inline-block self-start">
                {getStatusText(viewingProduct.status)}
              </span>
            </div>
          </div>

          <a href="/products/{viewingProduct.id}" class="btn-bh-red sm:w-full sm:text-center sm:block">View Full Details</a>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Purchase Product Modal -->
{#if showProductModal && selectedProduct}
  <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-[1000] animate-fade-in"
       onclick={closeProductModal} onkeydown={(e) => e.key === 'Escape' && closeProductModal()} role="button" tabindex="-1">
    <div class="glass-elevated max-w-[90%] max-h-[90vh] overflow-y-auto relative
                sm:max-w-full sm:max-h-full sm:w-full sm:h-full sm:border-none"
         onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-2xl
                     cursor-pointer transition-all z-10 glass-surface
                     sm:top-3 sm:right-3 sm:w-9 sm:h-9 sm:text-xl"
              style="color: var(--color-fg);"
              onclick={closeProductModal}>&times;</button>

      <div class="p-8 sm:p-4">
        {#if selectedProduct.images && selectedProduct.images.length > 0}
          {@const validImages = selectedProduct.images.filter(img => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            <div class="mb-8">
              <ImageSlider images={validImages} productTitle={selectedProduct.title} />
            </div>
          {:else}
            <div class="w-full h-[400px] flex items-center justify-center mb-8" style="background: var(--color-muted);">
              <span class="text-7xl opacity-30">&#128230;</span>
            </div>
          {/if}
        {:else}
          <div class="w-full h-[400px] flex items-center justify-center mb-8" style="background: var(--color-muted);">
            <span class="text-7xl opacity-30">&#128230;</span>
          </div>
        {/if}

        <div>
          <h2 class="headline-bh text-2xl mb-4 sm:text-xl">{selectedProduct.title}</h2>
          <p class="leading-relaxed mb-8 font-sans" style="color: var(--color-fg); opacity: 0.8;">{selectedProduct.description}</p>

          <div class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-6 mb-8 sm:grid-cols-1 sm:gap-4">
            <div class="flex flex-col gap-1">
              <span class="label-bh">Won For</span>
              <span class="text-2xl font-bold" style="font-family: var(--font-mono, ui-monospace, monospace); color: var(--color-fg);">{formatPrice(selectedProduct.currentBid || selectedProduct.startingPrice, selectedProduct.seller?.currency)}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="label-bh">Purchase Date</span>
              <span class="text-lg font-semibold text-bh-fg">{formatDate(selectedProduct.updatedAt)}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="label-bh">Status</span>
              <span class="badge-bh {getStatusBadgeClass(selectedProduct.status)} inline-block self-start">
                {getStatusText(selectedProduct.status)}
              </span>
            </div>
          </div>

          <a href="/products/{selectedProduct.id}" class="btn-bh-red sm:w-full sm:text-center sm:block">View Full Details</a>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Hide/Unhide Confirmation Modal -->
{#if showHideModal && hideModalProduct}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-[1000] animate-fade-in"
       onclick={closeHideModal} onkeydown={(e) => e.key === 'Escape' && closeHideModal()} role="button" tabindex="-1">
    <div class="glass-elevated max-w-[440px] w-full relative animate-slide-up
                sm:mx-4 sm:max-w-[calc(100vw-2rem)]"
         onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-xl
                     bg-transparent border-none cursor-pointer text-bh-fg/50 hover:text-bh-fg
                     disabled:cursor-not-allowed disabled:opacity-30"
              onclick={closeHideModal} disabled={hideModalLoading}>&times;</button>

      <div class="p-6 pb-0">
        <h2 class="headline-bh text-xl font-display">{hideModalProduct.active ? 'Hide Product' : 'Unhide Product'}</h2>
      </div>

      <div class="p-6 pt-4">
        <p class="font-semibold text-lg text-bh-fg mb-2 font-sans">"{hideModalProduct.title}"</p>
        <p class="text-bh-fg/70 leading-relaxed mb-6 font-sans">
          {#if hideModalProduct.active}
            This product will be hidden from the Browse Products page and won't be visible to other users. You can unhide it later from the Hidden tab.
          {:else}
            This product will be restored and visible to all users again on the Browse Products page.
          {/if}
        </p>

        <div class="flex gap-3">
          <button class="btn-bh-outline flex-1" onclick={closeHideModal} disabled={hideModalLoading}>
            Cancel
          </button>
          <button
            class="flex-1 inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-mono uppercase tracking-wider cursor-pointer transition-all duration-100 hover:opacity-85
                   disabled:cursor-not-allowed disabled:opacity-70"
            style="background: var(--color-fg); color: var(--color-bg); border: 1px solid var(--color-fg);"
            onclick={confirmToggleVisibility}
            disabled={hideModalLoading}
          >
            {#if hideModalLoading}
              <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white animate-spin"></span>
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

<!-- Product Card Snippet -->
{#snippet productCard(product: Product, tab: 'active' | 'hidden' | 'ended')}
  <div class="card-bh overflow-hidden">
    <a href="/products/{product.id}" class="block text-inherit no-underline cursor-pointer">
      <div class="w-full h-[200px] overflow-hidden sm:h-[180px]" style="background: var(--color-muted);">
        {#if product.images && product.images.length > 0}
          {@const validImages = product.images.filter((img: any) => img && img.image && img.image.url)}
          {#if validImages.length > 0}
            {@const firstImage = validImages[0]}
            <img src={firstImage.image.url} alt={product.title}
                 class="w-full h-full object-cover transition-transform duration-100 hover:scale-[1.03]" />
          {:else}
            <div class="w-full h-full flex items-center justify-center">
              <span class="text-5xl opacity-30">&#128230;</span>
            </div>
          {/if}
        {:else}
          <div class="w-full h-full flex items-center justify-center">
            <span class="text-5xl opacity-30">&#128230;</span>
          </div>
        {/if}
      </div>

      <div class="p-5 sm:p-4">
        <h3 class="text-lg font-semibold text-bh-fg mb-3 line-clamp-2 sm:text-base sm:mb-2">{product.title}</h3>
        <div class="mb-3">
          <div class="flex justify-between items-center mb-1">
            <span class="label-bh">{tab === 'ended' ? (product.status === 'sold' ? 'Sold for' : 'Final bid') : 'Starting'}</span>
            <span class="text-lg font-bold sm:text-base"
                  style="font-family: var(--font-mono, ui-monospace, monospace); color: {tab === 'ended' ? 'var(--color-fg)' : 'var(--color-fg)'}">
              {tab === 'ended'
                ? formatPrice(product.currentBid || product.startingPrice, product.seller?.currency)
                : formatPrice(product.startingPrice, product.seller?.currency)}
            </span>
          </div>
          {#if tab !== 'ended' && product.currentBid}
            <div class="flex justify-between items-center">
              <span class="label-bh font-mono">Current Bid</span>
              <span class="text-lg font-bold sm:text-base" style="font-family: var(--font-mono, ui-monospace, monospace); color: var(--color-fg);">
                {formatPrice(product.currentBid, product.seller?.currency)}
              </span>
            </div>
          {/if}
        </div>
        <div class="flex justify-between items-center pt-3 sm:flex-col sm:items-start sm:gap-2 sm:pt-2"
             style="border-top: 1px solid var(--color-border);">
          <span class="label-bh">&#128197; {tab === 'ended' ? 'Ended' : 'Ends'}: {formatDate(product.auctionEndDate)}</span>
          {#if tab === 'hidden'}
            <span class="badge-bh" style="background: var(--color-muted); color: var(--color-fg); opacity: 0.6;">Hidden</span>
          {:else}
            <span class="badge-bh {getStatusBadgeClass(product.status)}">{getStatusText(product.status)}</span>
          {/if}
        </div>
      </div>
    </a>

    <div class="flex gap-2 p-4 sm:p-3" style="border-top: 1px solid var(--color-border);">
      {#if tab !== 'ended'}
        <button class="btn-bh-red flex-1 text-center sm:text-sm" onclick={() => openEditModal(product)}>
          &#9998;&#65039; Edit
        </button>
      {/if}
      {#if tab === 'active' && data.user?.role === 'admin'}
        <button class="btn-bh flex-1 text-center sm:text-sm" onclick={() => openHideModal(product)}>
          &#128584; Hide
        </button>
      {/if}
      {#if tab === 'hidden' && data.user?.role === 'admin'}
        <button class="flex-1 inline-flex items-center justify-center px-5 py-2.5 text-sm font-mono uppercase tracking-wider
                       cursor-pointer transition-all duration-100 hover:opacity-85 sm:text-sm"
                style="background: var(--color-fg); color: var(--color-bg); border: 1px solid var(--color-fg);"
                onclick={() => openHideModal(product)}>
          Unhide
        </button>
      {/if}
      <a href="/products/{product.id}" class="btn-bh flex-1 text-center sm:text-sm">
        &#128065;&#65039; View
      </a>
    </div>
  </div>
{/snippet}

<style>
  @keyframes fade-in {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-fade-in {
    animation: fade-in 0.3s ease-in;
  }

  @keyframes slide-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .animate-slide-up {
    animation: slide-up 0.25s ease-out;
  }

  .line-clamp-2 {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  /* Status badges — monochrome */
  .status-active {
    background: var(--color-fg);
    color: var(--color-bg);
    border: 1px solid var(--color-fg);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }

  .status-sold {
    background: var(--color-fg);
    color: var(--color-bg);
    border: 1px solid var(--color-fg);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }

  .status-ended {
    background: transparent;
    color: var(--color-fg);
    border: 1px solid var(--color-fg);
    opacity: 0.6;
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }

  .status-cancelled {
    background: transparent;
    color: var(--color-fg);
    opacity: 0.4;
    border: 1px solid var(--color-fg);
    font-family: var(--font-mono, ui-monospace, monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }
</style>
