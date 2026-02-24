<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';
  import { getGlobalSSE, disconnectGlobalSSE, type SSEEvent, type BidUpdateEvent } from '$lib/sse';
  import { updateProduct } from '$lib/api';

  let { data, params }: { data: PageData; params?: any } = $props();

  let countdowns: { [key: string]: string } = $state({});
  let countdownInterval: ReturnType<typeof setInterval> | null = $state(null);
  let userBids: { [productId: string]: number } = $state({}); // Maps product ID to user's bid amount
  let userBidsByProduct: { [productId: string]: any[] } = $state({}); // All user bids per product

  // Local state for form inputs
  let searchInput = $state(data.search || '');
  let regionInput = $state(data.region || '');
  let cityInput = $state(data.city || '');
  let searchTimeout: ReturnType<typeof setTimeout> | null = $state(null);
  let lastDataSearch = $state(data.search || ''); // Track last known data.search value
  let lastDataRegion = $state(data.region || '');
  let lastDataCity = $state(data.city || '');

  // SSE state
  let sseUnsubscribe: (() => void) | null = $state(null);
  let newProductCount = $state(0);

  // Admin hide/show
  let hiddenProductIds: Set<string | number> = $state(new Set());

  async function toggleProductVisibility(productId: string | number, currentlyActive: boolean) {
    const action = currentlyActive ? 'hide' : 'unhide';
    const confirmed = confirm(`Are you sure you want to ${action} this item?`);
    if (!confirmed) return;

    const result = await updateProduct(String(productId), { active: !currentlyActive });
    if (result) {
      hiddenProductIds.add(productId);
      hiddenProductIds = new Set(hiddenProductIds);
    }
  }

  // Items per page options
  const itemsPerPageOptions = [12, 24, 48, 96];

  // Get cities for selected region
  let availableCities = $derived(regionInput ? getCitiesByRegion(regionInput) : []);

  // Reset city when region changes
  $effect(() => {
    if (regionInput && !availableCities.includes(cityInput)) {
      // Don't auto-clear if we're loading from URL params
      const urlCity = $page.url.searchParams.get('city') || '';
      if (cityInput && cityInput !== urlCity) {
        cityInput = '';
      }
    }
  });

  function updateURL(params: Record<string, string | number>) {
    const url = new URL($page.url);
    Object.entries(params).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, value.toString());
      } else {
        url.searchParams.delete(key);
      }
    });
    goto(url.toString(), { keepFocus: true, noScroll: false });
  }

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      updateURL({
        search: searchInput,
        region: regionInput,
        city: cityInput,
        page: '1', // Reset to page 1 on new search
        status: data.status,
        limit: data.limit.toString()
      });
    }, 500); // Debounce for 500ms
  }

  function handleLocationInput() {
    if (searchTimeout) clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
      updateURL({
        search: searchInput,
        region: regionInput,
        city: cityInput,
        page: '1', // Reset to page 1 on location change
        status: data.status,
        limit: data.limit.toString()
      });
    }, 500); // Debounce for 500ms
  }

  function clearFilters() {
    searchInput = '';
    regionInput = '';
    cityInput = '';
    updateURL({
      search: '',
      region: '',
      city: '',
      page: '1',
      status: data.status,
      limit: data.limit.toString()
    });
  }

  function changeTab(status: string) {
    hiddenProductIds = new Set();
    updateURL({
      status,
      page: '1', // Reset to page 1 on tab change
      search: searchInput,
      region: regionInput,
      city: cityInput,
      limit: data.limit.toString()
    });

    // Scroll to products section after a small delay to allow URL update
    setTimeout(() => {
      const productsSection = document.getElementById('products-section');
      if (productsSection) {
        productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  function goToPage(page: number) {
    updateURL({
      page: page.toString(),
      status: data.status,
      search: searchInput,
      region: regionInput,
      city: cityInput,
      limit: data.limit.toString()
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeItemsPerPage(limit: number) {
    updateURL({
      limit: limit.toString(),
      page: '1', // Reset to page 1 when changing items per page
      status: data.status,
      search: searchInput,
      region: regionInput,
      city: cityInput
    });
  }

  // Update local search input when data changes (e.g., browser back/forward)
  // Only update if data.search has actually changed and is different from current input
  $effect(() => {
    const currentDataSearch = data.search || '';
    if (currentDataSearch !== lastDataSearch) {
      // data.search changed - only update input if it's different from what user typed
      if (currentDataSearch !== searchInput) {
        searchInput = currentDataSearch;
      }
      lastDataSearch = currentDataSearch;
    }
  });

  // Update local location inputs when data changes
  $effect(() => {
    const currentDataRegion = data.region || '';
    if (currentDataRegion !== lastDataRegion) {
      if (currentDataRegion !== regionInput) {
        regionInput = currentDataRegion;
      }
      lastDataRegion = currentDataRegion;
    }
  });

  $effect(() => {
    const currentDataCity = data.city || '';
    if (currentDataCity !== lastDataCity) {
      if (currentDataCity !== cityInput) {
        cityInput = currentDataCity;
      }
      lastDataCity = currentDataCity;
    }
  });

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

  // Fetch user's bids
  async function fetchUserBids() {
    if (!$authStore.isAuthenticated || !$authStore.user) {
      userBids = {};
      userBidsByProduct = {};
      return;
    }

    try {
      const token = localStorage.getItem('auth_token');
      const headers: HeadersInit = {};
      if (token) {
        headers['Authorization'] = `JWT ${token}`;
      }
      const response = await fetch(
        `/api/bridge/bids?where[bidder][equals]=${$authStore.user.id}&limit=1000`,
        {
          headers,
          credentials: 'include',
        }
      );

      if (response.ok) {
        const bidsData = await response.json();
        const bids = bidsData.docs || [];

        // Group bids by product and find highest bid per product
        const bidsByProduct: { [key: string]: any[] } = {};
        const highestBids: { [key: string]: number } = {};

        bids.forEach((bid: any) => {
          const productId = typeof bid.product === 'object' ? bid.product.id : bid.product;

          if (!bidsByProduct[productId]) {
            bidsByProduct[productId] = [];
          }
          bidsByProduct[productId].push(bid);

          if (!highestBids[productId] || bid.amount > highestBids[productId]) {
            highestBids[productId] = bid.amount;
          }
        });

        userBids = highestBids;
        userBidsByProduct = bidsByProduct;
      }
    } catch (error) {
      console.error('Error fetching user bids:', error);
    }
  }

  // Sort products to show ones with user bids first, filter out toggled items
  let sortedProducts = $derived(
    [...data.products]
      .filter((p: any) => !hiddenProductIds.has(p.id))
      .sort((a, b) => {
        const aHasBid = userBids[a.id] ? 1 : 0;
        const bHasBid = userBids[b.id] ? 1 : 0;
        return bHasBid - aHasBid; // Products with bids first
      })
  );

  // Refetch bids when auth state changes
  $effect(() => {
    if ($authStore.isAuthenticated !== undefined) {
      fetchUserBids();
    }
  });

  onMount(() => {
    updateCountdowns();
    countdownInterval = setInterval(updateCountdowns, 1000);
    fetchUserBids();

    // Connect to global SSE for live bid updates and new product notifications
    const globalSSE = getGlobalSSE();
    globalSSE.connect();

    sseUnsubscribe = globalSSE.subscribe((event: SSEEvent) => {
      if (event.type === 'bid' && 'productId' in event) {
        // Live bid update — update the product card in place
        const bidEvent = event as BidUpdateEvent;
        if (bidEvent.success && bidEvent.amount) {
          const productIndex = data.products.findIndex(
            (p) => String(p.id) === String(bidEvent.productId)
          );
          if (productIndex !== -1) {
            data.products[productIndex] = {
              ...data.products[productIndex],
              currentBid: bidEvent.amount,
            };
          }
        }
      } else if (event.type === 'accepted' && 'productId' in event) {
        // Product sold — update status in place
        const acceptedEvent = event as any;
        const productIndex = data.products.findIndex(
          (p) => String(p.id) === String(acceptedEvent.productId)
        );
        if (productIndex !== -1) {
          data.products[productIndex] = {
            ...data.products[productIndex],
            status: 'sold',
            currentBid: acceptedEvent.amount || data.products[productIndex].currentBid,
          };
        }
      } else if (event.type === 'new_product') {
        // New product listed — show notification banner
        if (data.status === 'active') {
          newProductCount++;
        }
      }
    });

    // Scroll to products section if there's a status query parameter
    if (data.status && window.location.search.includes('status=')) {
      setTimeout(() => {
        const productsSection = document.getElementById('products-section');
        if (productsSection) {
          productsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }

    // Handle visibility change - stop countdown when tab is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
      } else {
        if (!countdownInterval) {
          updateCountdowns();
          countdownInterval = setInterval(updateCountdowns, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  onDestroy(() => {
    if (countdownInterval) clearInterval(countdownInterval);
    if (sseUnsubscribe) sseUnsubscribe();
    disconnectGlobalSSE();
  });
</script>

<svelte:head>
  <title>Browse Products - BidMo.to</title>
</svelte:head>
<!-- Beta Notice Banner -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 mb-0 overflow-hidden relative z-10">
  <div class="bg-bh-yellow border-b-4 border-bh-border px-3 py-4">
    <div class="max-w-7xl mx-auto text-center">
      <div class="inline-block bg-black/20 text-white px-2 sm:px-3 py-1 border-2 border-bh-border text-xs font-bold tracking-wide sm:tracking-wider mb-2">
        🚧 EXPERIMENTAL
      </div>
      <p class="text-white text-xs sm:text-sm md:text-base leading-snug sm:leading-relaxed mx-auto max-w-5xl px-2 break-words">
        We're testing what works and gathering public interest.
        <strong class="font-bold underline whitespace-nowrap">No integrated payments yet</strong> —
        transactions are coordinated directly between buyers and sellers.
        Once we have enough traction, we'll integrate secure payments and become a full-blown bidding platform!
      </p>
    </div>
  </div>
</div>

<!-- Welcome Hero Section -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 mb-8">
  <section class="bg-bh-red border-b-4 border-bh-border text-white px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 text-center">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-20 sm:h-28 lg:h-36 w-auto mx-auto" />
      </div>

      <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3">
        Welcome to <span class="text-bh-yellow">BidMo.to</span>
      </h1>

      <p class="text-base sm:text-lg lg:text-xl mb-3 opacity-95">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>

      <p class="text-sm sm:text-base mb-6 opacity-90 max-w-2xl mx-auto">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <div class="flex flex-wrap gap-4 sm:gap-8 justify-center text-sm sm:text-base">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔍</span>
          <span>Browse Auctions</span>
        </div>
        {#if $authStore.isAuthenticated}
          <div class="flex items-center gap-2">
            <span class="text-xl">🔨</span>
            <a href="/sell" class="hover:text-bh-yellow transition">List an Item</a>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">FREE</span>
          <span>To Join</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">SAFE</span>
          <span>No Payment Integration</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">BETA</span>
          <span>Help Us Grow</span>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="products-page">
  <div class="page-header">
    <h2>Browse Products</h2>

    <!-- Search and Filters -->
    <div class="search-filter-container">
      <div class="search-container">
        <input
          type="text"
          bind:value={searchInput}
          oninput={handleSearchInput}
          placeholder="Search by title, description, or keywords..."
          class="search-input input-bh"
        />
        {#if searchInput}
          <button class="clear-search" onclick={() => { searchInput = ''; handleSearchInput(); }}>✕</button>
        {/if}
      </div>

      <div class="location-filters">
        <select
          bind:value={regionInput}
          onchange={handleLocationInput}
          class="location-select"
        >
          <option value="">All Regions</option>
          {#each regions as region}
            <option value={region}>{region}</option>
          {/each}
        </select>
        <select
          bind:value={cityInput}
          onchange={handleLocationInput}
          class="location-select"
          disabled={!regionInput}
        >
          <option value="">All Cities</option>
          {#each availableCities as city}
            <option value={city}>{city}</option>
          {/each}
        </select>
        {#if searchInput || regionInput || cityInput}
          <button class="btn-clear-filters" onclick={clearFilters}>Clear All</button>
        {/if}
      </div>
    </div>

    {#if (data.search || data.region || data.city) && data.totalDocs > 0}
      <p class="search-results">Found {data.totalDocs} result{data.totalDocs !== 1 ? 's' : ''}</p>
    {/if}

    <!-- Items per page selector -->
    <div class="controls-container">
      <div class="items-per-page">
        <label>Items per page:</label>
        <select value={data.limit} onchange={(e) => changeItemsPerPage(parseInt(e.currentTarget.value))}>
          {#each itemsPerPageOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if (data.search || data.region || data.city) && data.totalDocs === 0}
    <div class="empty-state">
      <p>No products found matching your filters</p>
      {#if data.search}<p class="filter-detail">Search: "{data.search}"</p>{/if}
      {#if data.region}<p class="filter-detail">Region: "{data.region}"</p>{/if}
      {#if data.city}<p class="filter-detail">City: "{data.city}"</p>{/if}
      <button class="btn-clear-search" onclick={clearFilters}>Clear Filters</button>
    </div>
  {/if}

  <!-- Tabs - Always visible -->
  <div class="tabs-container" id="products-section">
    <button
      class="tab"
      class:active={data.status === 'active'}
      onclick={() => changeTab('active')}
    >
      Active Auctions
    </button>
    <button
      class="tab"
      class:active={data.status === 'ended'}
      onclick={() => changeTab('ended')}
    >
      Ended Auctions
    </button>
    <button
      class="tab"
      class:active={data.status === 'my-bids'}
      onclick={() => changeTab('my-bids')}
    >
      My Bids
    </button>
    {#if $authStore.user?.role === 'admin'}
      <button
        class="tab tab-admin"
        class:active={data.status === 'hidden'}
        onclick={() => changeTab('hidden')}
      >
        Hidden Items
      </button>
    {/if}
  </div>

  <!-- New Products Notification Banner -->
  {#if newProductCount > 0}
    <button
      class="new-products-banner"
      onclick={() => { newProductCount = 0; window.location.reload(); }}
    >
      {newProductCount} new {newProductCount === 1 ? 'product' : 'products'} listed — click to refresh
    </button>
  {/if}

  <!-- Products Grid -->
  {#if sortedProducts.length > 0}
      <section class="auction-section">
        <div class="products-grid">
          {#each sortedProducts as product}
            <a href="/products/{product.id}?from=browse" class="product-card" class:ended-card={data.status === 'ended'} class:hidden-card={!product.active}>
              <div class="product-image">
                {#if product.images && product.images.length > 0 && product.images[0].image}
                  <img src="{product.images[0].image.url}" alt="{product.images[0].image.alt || product.title}" />
                {:else}
                  <div class="placeholder-image">
                    <span>No Image</span>
                  </div>
                {/if}
                {#if data.status === 'ended'}
                  <div class="ended-overlay">
                    {product.status === 'sold' ? '✓ SOLD' : product.status.toUpperCase()}
                  </div>
                {/if}
              </div>

              <div class="product-info">
                <h3>{product.title}</h3>
                <p class="description">{product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}</p>

                {#if product.region || product.city}
                  <div class="location-info">
                    <svg class="location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>{product.city}{product.city && product.region ? ', ' : ''}{product.region}</span>
                  </div>
                {/if}

                <div class="pricing">
                  {#if product.currentBid}
                    <div class="current-bid-section">
                      <div class="current-bid-row">
                        <div>
                          <span class="label-small">{data.status === 'ended' && product.status === 'sold' ? 'Sold For:' : data.status === 'ended' ? 'Final Bid:' : 'Current Bid:'}</span>
                          <span class="price-large current-bid">{formatPrice(product.currentBid, product.seller.currency)}</span>
                        </div>
                        {#if product.currentBid > product.startingPrice}
                          <div class="percent-increase">
                            <svg class="arrow-up-mini" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                              <polyline points="18 15 12 9 6 15"></polyline>
                            </svg>
                            <span>{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%</span>
                          </div>
                        {/if}
                      </div>
                      <div class="starting-price-row">
                        <span class="label-tiny">Starting:</span>
                        <span class="price-tiny">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                      </div>
                    </div>
                  {:else}
                    <div>
                      <span class="label-small">Starting Price:</span>
                      <span class="price-large">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                    </div>
                  {/if}

                  {#if userBids[product.id]}
                    <div class="user-bid-section">
                      <span class="label-small">Your Bid:</span>
                      <span class="price-large your-bid">{formatPrice(userBids[product.id], product.seller.currency)}</span>
                    </div>
                  {/if}
                </div>

                <div class="auction-info">
                  <div class="status-row">
                    <span class="status status-{product.status}">{product.status}</span>
                    {#if $authStore.user && product.seller?.id === $authStore.user.id}
                      <span class="owner-badge">Your Listing</span>
                    {/if}
                    {#if $authStore.user?.role === 'admin' && data.status !== 'hidden'}
                      <button
                        class="admin-hide-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggleProductVisibility(product.id, product.active); }}
                      >
                        Hide
                      </button>
                    {/if}
                    {#if data.status === 'hidden'}
                      <button
                        class="admin-show-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); toggleProductVisibility(product.id, product.active); }}
                      >
                        Unhide
                      </button>
                    {/if}
                  </div>
                  {#if data.status === 'active' || data.status === 'my-bids'}
                    <div class="countdown-badge countdown-{getUrgencyClass(product.auctionEndDate)}">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>{countdowns[product.id] || 'Loading...'}</span>
                    </div>
                  {:else}
                    <div class="countdown-badge countdown-ended">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>Ended</span>
                    </div>
                  {/if}
                </div>
              </div>
            </a>
          {/each}
        </div>

        <!-- Pagination -->
        {#if data.totalPages > 1}
          <div class="pagination">
            <button
              class="pagination-btn"
              disabled={data.currentPage === 1}
              onclick={() => goToPage(data.currentPage - 1)}
            >
              ← Previous
            </button>

            <div class="pagination-numbers">
              {#each Array(data.totalPages) as _, i}
                <button
                  class="pagination-number"
                  class:active={data.currentPage === i + 1}
                  onclick={() => goToPage(i + 1)}
                >
                  {i + 1}
                </button>
              {/each}
            </div>

            <button
              class="pagination-btn"
              disabled={data.currentPage === data.totalPages}
              onclick={() => goToPage(data.currentPage + 1)}
            >
              Next →
            </button>
          </div>
        {/if}
      </section>
  {:else}
    <div class="empty-state">
      {#if data.status === 'my-bids'}
        <p>You do not have any bids yet.</p>
        <p><a href="/products?status=active">Browse Active Auctions</a></p>
      {:else if data.status === 'ended'}
        <p>No Ended Auctions Available</p>
        <p><a href="/products?status=active">Browse Active Auctions</a></p>
      {:else}
        <p>No active auctions available.</p>
        <p><a href="/sell">Be the first to list a product!</a></p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .products-page {
    padding: 2rem 0;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  h1 {
    margin-bottom: 1.5rem;
    font-size: 2.5rem;
  }

  .search-filter-container {
    margin-bottom: 1rem;
  }

  .search-container {
    position: relative;
    max-width: 600px;
    margin-bottom: 1rem;
  }

  .search-input {
    width: 100%;
    padding: 1rem 3rem 1rem 1rem;
    font-size: 1rem;
  }

  .location-filters {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
    max-width: 600px;
  }

  .location-select {
    flex: 1;
    min-width: 200px;
    padding: 0.75rem 1rem;
    font-size: 0.95rem;
    border: 2px solid var(--color-border);
    transition: border-color 0.2s;
    background-color: var(--color-white);
    cursor: pointer;
  }

  .location-select:focus {
    outline: none;
    border-color: var(--color-red);
    box-shadow: var(--shadow-bh-sm);
  }

  .location-select:disabled {
    background-color: var(--color-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn-clear-filters {
    padding: 0.75rem 1.5rem;
    background: var(--color-fg);
    color: white;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .btn-clear-filters:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .clear-search {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 1.25rem;
    color: #999;
    cursor: pointer;
    padding: 0.5rem;
    line-height: 1;
    transition: color 0.2s;
  }

  .clear-search:hover {
    color: var(--color-red);
  }

  .search-results {
    color: #666;
    font-size: 0.95rem;
    margin: 0;
  }

  .btn-clear-search {
    padding: 0.75rem 1.5rem;
    background: var(--color-fg);
    color: white;
    border: none;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-clear-search:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  .controls-container {
    margin-top: 1rem;
  }

  .items-per-page {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .items-per-page label {
    font-size: 0.95rem;
    color: #666;
    font-weight: 500;
  }

  .items-per-page select {
    padding: 0.5rem 2.5rem 0.5rem 0.75rem;
    font-size: 0.95rem;
    border: 2px solid var(--color-border);
    background-color: var(--color-white);
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 1.25rem;
    cursor: pointer;
    transition: border-color 0.2s;
    appearance: none;
  }

  .items-per-page select:hover {
    border-color: #d1d5db;
  }

  .items-per-page select:focus {
    outline: none;
    border-color: var(--color-red);
    box-shadow: var(--shadow-bh-sm);
  }

  /* Tabs */
  .tabs-container {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid var(--color-border);
    padding-bottom: 0.5rem;
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: var(--color-white);
    border: 2px solid var(--color-border);
    font-weight: 600;
    font-size: 1rem;
    color: #666;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .tab:hover {
    background: var(--color-muted);
    border-color: #d1d5db;
  }

  .tab.active {
    background: var(--color-red);
    border-color: var(--color-red);
    border-bottom: 4px solid var(--color-border);
    color: white;
  }

  .tab-badge {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tab.active .tab-badge {
    background: rgba(255, 255, 255, 0.9);
    color: var(--color-red);
  }

  .auction-section {
    margin-bottom: 3rem;
  }

  .ended-card {
    opacity: 0.85;
  }

  .ended-card:hover {
    opacity: 1;
  }

  .ended-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background-color: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 0.75rem 1.5rem;
    font-size: 1.25rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    pointer-events: none;
  }

  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background-color: var(--color-muted);
  }

  .empty-state p {
    font-size: 1.2rem;
    margin-bottom: 1rem;
  }

  .empty-state .filter-detail {
    font-size: 1rem;
    color: #666;
    margin-bottom: 0.5rem;
  }

  .empty-state a {
    color: var(--color-blue);
    font-weight: bold;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }

  .product-card {
    background: var(--color-white);
    border: var(--border-bh) solid var(--color-border);
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-bh-sm);
  }

  .product-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-bh-md);
  }

  .product-image {
    position: relative;
    width: 100%;
    height: 200px;
    overflow: hidden;
    background-color: var(--color-muted);
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
    background-color: var(--color-muted);
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
    margin-bottom: 0.75rem;
    flex: 1;
  }

  .location-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
    color: #666;
    margin-bottom: 0.75rem;
    padding: 0.375rem 0.5rem;
    background-color: var(--color-muted);
    width: fit-content;
  }

  .location-icon {
    color: var(--color-red);
    flex-shrink: 0;
  }

  .pricing {
    margin-bottom: 1rem;
  }

  .pricing > div {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .current-bid-section {
    margin-bottom: 0.75rem;
  }

  .current-bid-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.25rem;
  }

  .current-bid-row > div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .starting-price-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    opacity: 0.7;
  }

  .user-bid-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: var(--color-muted);
    border: 2px solid var(--color-blue);
    margin-top: 0.5rem;
  }

  .label {
    color: #666;
    font-size: 0.9rem;
  }

  .label-small {
    color: #666;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .label-tiny {
    color: #888;
    font-size: 0.7rem;
    font-weight: 500;
  }

  .price {
    font-weight: bold;
    font-size: 1.1rem;
  }

  .price-large {
    font-weight: 900;
    font-size: 1.4rem;
    display: block;
  }

  .price-tiny {
    font-size: 0.85rem;
    font-weight: 600;
    color: #555;
  }

  .current-bid {
    color: var(--color-blue);
  }

  .your-bid {
    color: var(--color-blue);
  }

  .percent-increase {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-blue);
    color: white;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
    box-shadow: var(--shadow-bh-sm);
  }

  .arrow-up-mini {
    color: white;
    flex-shrink: 0;
  }

  .auction-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border);
  }

  .status-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .status {
    padding: 0.25rem 0.75rem;
    font-size: 0.85rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .owner-badge {
    padding: 0.25rem 0.75rem;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    background: var(--color-blue);
    color: white;
    box-shadow: var(--shadow-bh-sm);
    letter-spacing: 0.5px;
  }

  .hidden-card {
    opacity: 0.5;
  }

  .admin-hide-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    background: #dc3545;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.2s;
  }

  .admin-hide-btn:hover {
    background: #b02a37;
  }

  .admin-show-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    background: #198754;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.2s;
  }

  .admin-show-btn:hover {
    background: #146c43;
  }

  .tab-admin {
    color: #dc3545;
  }

  .tab-admin.active {
    border-color: #dc3545;
    color: #dc3545;
  }

  .status-active {
    background: var(--color-blue);
    color: white;
  }

  .status-ended {
    background: var(--color-red);
    color: white;
  }

  .status-sold {
    background: var(--color-yellow);
    color: var(--color-fg);
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
    background-color: var(--color-muted);
    color: var(--color-blue);
    border: 2px solid var(--color-blue);
  }

  /* Warning - Less than 24 hours */
  .countdown-warning {
    background-color: var(--color-yellow);
    color: var(--color-fg);
    border: 2px solid var(--color-border);
    animation: pulse-warning 2s ease-in-out infinite;
  }

  /* Urgent - Less than 12 hours */
  .countdown-urgent {
    background: var(--color-yellow);
    color: var(--color-fg);
    border: 2px solid var(--color-border);
    animation: pulse-urgent 1.5s ease-in-out infinite;
    box-shadow: var(--shadow-bh-sm);
  }

  /* Critical - Less than 3 hours */
  .countdown-critical {
    background: var(--color-red);
    color: var(--color-white);
    border: 2px solid var(--color-border);
    animation: pulse-critical 1s ease-in-out infinite;
    box-shadow: var(--shadow-bh-md);
  }

  /* Ended */
  .countdown-ended {
    background-color: var(--color-muted);
    color: #6b7280;
    border: 2px solid var(--color-border);
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
      box-shadow: var(--shadow-bh-sm);
    }
    50% {
      transform: scale(1.03);
      box-shadow: var(--shadow-bh-md);
    }
  }

  @keyframes pulse-critical {
    0%, 100% {
      transform: scale(1);
      box-shadow: var(--shadow-bh-md);
    }
    50% {
      transform: scale(1.05);
      box-shadow: var(--shadow-bh-md);
    }
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    margin-top: 2rem;
    padding: 1rem;
  }

  .pagination-btn {
    padding: 0.625rem 1.25rem;
    background-color: var(--color-white);
    border: 2px solid var(--color-red);
    color: var(--color-red);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background-color: var(--color-red);
    color: white;
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-sm);
  }

  .pagination-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    border-color: var(--color-border);
    color: var(--color-border);
  }

  .pagination-numbers {
    display: flex;
    gap: 0.25rem;
  }

  .pagination-number {
    min-width: 2.5rem;
    padding: 0.625rem 0.75rem;
    background-color: var(--color-white);
    border: 2px solid var(--color-border);
    color: #666;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-number:hover {
    border-color: var(--color-red);
    color: var(--color-red);
  }

  .pagination-number.active {
    background-color: var(--color-red);
    border-color: var(--color-red);
    color: white;
  }

  .new-products-banner {
    width: 100%;
    padding: 0.75rem 1.5rem;
    background: var(--color-blue);
    color: white;
    border: 2px solid var(--color-border);
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    text-align: center;
    margin-bottom: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
    animation: slideDown 0.3s ease-out;
  }

  .new-products-banner:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-bh-md);
  }

  @keyframes slideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>