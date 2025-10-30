<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { API_URL } from '$lib/api';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';

  export let data: PageData;
  export let params: any = undefined; // SvelteKit passes this automatically

  let countdowns: { [key: string]: string } = {};
  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let userBids: { [productId: string]: number } = {}; // Maps product ID to user's bid amount
  let userBidsByProduct: { [productId: string]: any[] } = {}; // All user bids per product

  // Local state for form inputs
  let searchInput = data.search || '';
  let regionInput = data.region || '';
  let cityInput = data.city || '';
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastDataSearch = data.search || ''; // Track last known data.search value
  let lastDataRegion = data.region || '';
  let lastDataCity = data.city || '';

  // Items per page options
  const itemsPerPageOptions = [12, 24, 48, 96];

  // Get cities for selected region
  $: availableCities = regionInput ? getCitiesByRegion(regionInput) : [];

  // Reset city when region changes
  $: if (regionInput && !availableCities.includes(cityInput)) {
    // Don't auto-clear if we're loading from URL params
    const urlCity = $page.url.searchParams.get('city') || '';
    if (cityInput && cityInput !== urlCity) {
      cityInput = '';
    }
  }

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
  $: {
    const currentDataSearch = data.search || '';
    if (currentDataSearch !== lastDataSearch) {
      // data.search changed - only update input if it's different from what user typed
      if (currentDataSearch !== searchInput) {
        searchInput = currentDataSearch;
      }
      lastDataSearch = currentDataSearch;
    }
  }

  // Update local location inputs when data changes
  $: {
    const currentDataRegion = data.region || '';
    if (currentDataRegion !== lastDataRegion) {
      if (currentDataRegion !== regionInput) {
        regionInput = currentDataRegion;
      }
      lastDataRegion = currentDataRegion;
    }
  }

  $: {
    const currentDataCity = data.city || '';
    if (currentDataCity !== lastDataCity) {
      if (currentDataCity !== cityInput) {
        cityInput = currentDataCity;
      }
      lastDataCity = currentDataCity;
    }
  }

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
    countdowns = { ...countdowns }; // Trigger reactivity
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
      const response = await fetch(
        `${API_URL}/api/bids?where[bidder][equals]=${$authStore.user.id}&limit=1000`,
        {
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

  // Sort products to show ones with user bids first
  $: sortedProducts = [...data.products].sort((a, b) => {
    const aHasBid = userBids[a.id] ? 1 : 0;
    const bHasBid = userBids[b.id] ? 1 : 0;
    return bHasBid - aHasBid; // Products with bids first
  });

  // Refetch bids when auth state changes
  $: if ($authStore.isAuthenticated !== undefined) {
    fetchUserBids();
  }

  onMount(() => {
    updateCountdowns();
    countdownInterval = setInterval(updateCountdowns, 1000);
    fetchUserBids();

    // Scroll to products section if there's a status query parameter
    // (useful when navigating from another page or using back/forward buttons)
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
        // Tab is hidden, stop countdown to save resources
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
      } else {
        // Tab is visible again, restart countdown
        if (!countdownInterval) {
          updateCountdowns(); // Immediate update when returning
          countdownInterval = setInterval(updateCountdowns, 1000);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup visibility listener on destroy
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  onDestroy(() => {
    if (countdownInterval) clearInterval(countdownInterval);
  });
</script>

<svelte:head>
  <title>Browse Products - BidMo.to</title>
</svelte:head>
<!-- Beta Notice Banner -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 mb-0 overflow-hidden relative z-10">
  <div class="bg-gradient-to-br from-yellow-400 to-yellow-500 border-b-4 border-yellow-600 px-3 py-4">
    <div class="max-w-7xl mx-auto text-center">
      <div class="inline-block bg-black/20 text-white px-2 sm:px-3 py-1 rounded-full text-xs font-bold tracking-wide sm:tracking-wider mb-2">
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
  <section class="bg-gradient-to-br from-primary to-primary-dark text-white px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 text-center">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-20 sm:h-28 lg:h-36 w-auto mx-auto drop-shadow-2xl" />
      </div>

      <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3">
        Welcome to <span class="bg-gradient-to-r from-yellow-400 to-yellow-500 bg-clip-text text-transparent">BidMo.to</span>
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
            <a href="/sell" class="hover:text-yellow-400 transition">List an Item</a>
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
          on:input={handleSearchInput}
          placeholder="Search by title, description, or keywords..."
          class="search-input"
        />
        {#if searchInput}
          <button class="clear-search" on:click={() => { searchInput = ''; handleSearchInput(); }}>✕</button>
        {/if}
      </div>

      <div class="location-filters">
        <select
          bind:value={regionInput}
          on:change={handleLocationInput}
          class="location-select"
        >
          <option value="">All Regions</option>
          {#each regions as region}
            <option value={region}>{region}</option>
          {/each}
        </select>
        <select
          bind:value={cityInput}
          on:change={handleLocationInput}
          class="location-select"
          disabled={!regionInput}
        >
          <option value="">All Cities</option>
          {#each availableCities as city}
            <option value={city}>{city}</option>
          {/each}
        </select>
        {#if searchInput || regionInput || cityInput}
          <button class="btn-clear-filters" on:click={clearFilters}>Clear All</button>
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
        <select value={data.limit} on:change={(e) => changeItemsPerPage(parseInt(e.currentTarget.value))}>
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
      <button class="btn-clear-search" on:click={clearFilters}>Clear Filters</button>
    </div>
  {/if}

  <!-- Tabs - Always visible -->
  <div class="tabs-container" id="products-section">
    <button
      class="tab"
      class:active={data.status === 'active'}
      on:click={() => changeTab('active')}
    >
      Active Auctions
    </button>
    <button
      class="tab"
      class:active={data.status === 'ended'}
      on:click={() => changeTab('ended')}
    >
      Ended Auctions
    </button>
    <button
      class="tab"
      class:active={data.status === 'my-bids'}
      on:click={() => changeTab('my-bids')}
    >
      My Bids
    </button>
  </div>

  <!-- Products Grid -->
  {#if sortedProducts.length > 0}
      <section class="auction-section">
        <div class="products-grid">
          {#each sortedProducts as product}
            <a href="/products/{product.id}?from=browse" class="product-card" class:ended-card={data.status === 'ended'}>
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
                    {#if $authStore.user && product.seller.id === $authStore.user.id}
                      <span class="owner-badge">Your Listing</span>
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
              on:click={() => goToPage(data.currentPage - 1)}
            >
              ← Previous
            </button>

            <div class="pagination-numbers">
              {#each Array(data.totalPages) as _, i}
                <button
                  class="pagination-number"
                  class:active={data.currentPage === i + 1}
                  on:click={() => goToPage(i + 1)}
                >
                  {i + 1}
                </button>
              {/each}
            </div>

            <button
              class="pagination-btn"
              disabled={data.currentPage === data.totalPages}
              on:click={() => goToPage(data.currentPage + 1)}
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
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
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
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    transition: border-color 0.2s;
    background-color: white;
    cursor: pointer;
  }

  .location-select:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .location-select:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn-clear-filters {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #6b7280 0%, #4b5563 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
  }

  .btn-clear-filters:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(107, 114, 128, 0.4);
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
    color: #dc2626;
  }

  .search-results {
    color: #666;
    font-size: 0.95rem;
    margin: 0;
  }

  .btn-clear-search {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-clear-search:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
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
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    background-color: white;
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
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  /* Tabs */
  .tabs-container {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 2rem;
    border-bottom: 2px solid #f0f0f0;
    padding-bottom: 0.5rem;
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
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
    background: #f9fafb;
    border-color: #d1d5db;
  }

  .tab.active {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    border-color: #dc2626;
    color: white;
  }

  .tab-badge {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.125rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tab.active .tab-badge {
    background: rgba(255, 255, 255, 0.9);
    color: #dc2626;
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
    border-radius: 8px;
    font-size: 1.25rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    pointer-events: none;
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

  .empty-state .filter-detail {
    font-size: 1rem;
    color: #666;
    margin-bottom: 0.5rem;
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
    position: relative;
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
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 6px;
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
    color: #0066cc;
  }

  .your-bid {
    color: #10b981;
  }

  .percent-increase {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(16, 185, 129, 0.3);
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
    border-top: 1px solid #eee;
  }

  .status-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .owner-badge {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
    color: white;
    box-shadow: 0 2px 6px rgba(139, 92, 246, 0.3);
    letter-spacing: 0.5px;
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

  .countdown-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
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
    background-color: #e0f2fe;
    color: #0369a1;
    border: 1px solid #7dd3fc;
  }

  /* Warning - Less than 24 hours */
  .countdown-warning {
    background-color: #fef3c7;
    color: #92400e;
    border: 1px solid #fbbf24;
    animation: pulse-warning 2s ease-in-out infinite;
  }

  /* Urgent - Less than 12 hours */
  .countdown-urgent {
    background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
    color: #9a3412;
    border: 2px solid #f97316;
    animation: pulse-urgent 1.5s ease-in-out infinite;
    box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
  }

  /* Critical - Less than 3 hours */
  .countdown-critical {
    background: linear-gradient(135deg, #fecaca 0%, #fca5a5 100%);
    color: #991b1b;
    border: 2px solid #dc2626;
    animation: pulse-critical 1s ease-in-out infinite;
    box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
  }

  /* Ended */
  .countdown-ended {
    background-color: #f3f4f6;
    color: #6b7280;
    border: 1px solid #d1d5db;
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
      box-shadow: 0 2px 8px rgba(249, 115, 22, 0.3);
    }
    50% {
      transform: scale(1.03);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.5);
    }
  }

  @keyframes pulse-critical {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 2px 12px rgba(220, 38, 38, 0.4);
    }
    50% {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(220, 38, 38, 0.6);
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
    background-color: white;
    border: 2px solid #dc2626;
    color: #dc2626;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background-color: #dc2626;
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  .pagination-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
    border-color: #ccc;
    color: #ccc;
  }

  .pagination-numbers {
    display: flex;
    gap: 0.25rem;
  }

  .pagination-number {
    min-width: 2.5rem;
    padding: 0.625rem 0.75rem;
    background-color: white;
    border: 2px solid #e5e7eb;
    color: #666;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pagination-number:hover {
    border-color: #dc2626;
    color: #dc2626;
  }

  .pagination-number.active {
    background-color: #dc2626;
    border-color: #dc2626;
    color: white;
  }
</style>
