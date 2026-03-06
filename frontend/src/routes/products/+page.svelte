<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';
  import { categories, getCategoryLabel } from '$lib/data/categories';
  import { getGlobalSSE, disconnectGlobalSSE, type SSEEvent, type BidUpdateEvent, type ProductVisibilityEvent } from '$lib/sse';
  import { updateProduct } from '$lib/api';
  import { watchlistStore } from '$lib/stores/watchlist';
  import WatchlistToggle from '$lib/components/WatchlistToggle.svelte';

  let { data, params }: { data: PageData; params?: any } = $props();

  let countdowns: { [key: string]: string } = $state({});
  let countdownInterval: ReturnType<typeof setInterval> | null = $state(null);
  let userBids: { [productId: string]: number } = $state({}); // Maps product ID to user's bid amount
  let userBidsByProduct: { [productId: string]: any[] } = $state({}); // All user bids per product

  // Local state for form inputs
  let searchInput = $state(data.search || '');
  let regionInput = $state(data.region || '');
  let cityInput = $state(data.city || '');
  let searchTypeInput = $state(data.searchType || 'products');
  let searchTimeout: ReturnType<typeof setTimeout> | null = $state(null);
  let lastDataSearch = $state(data.search || ''); // Track last known data.search value
  let lastDataRegion = $state(data.region || '');
  let lastDataCity = $state(data.city || '');
  let categoryInput = $state(data.category || '');
  let lastDataCategory = $state(data.category || '');

  // SSE state
  let sseUnsubscribe: (() => void) | null = $state(null);
  let newProductCount = $state(0);

  // Loading state for tab/filter transitions
  let loading = $state(false);
  let lastStatus = $state(data.status);

  // Clear loading when data changes (new results arrived)
  $effect(() => {
    const _products = data.products;
    const _users = data.users;
    const _status = data.status;
    const _searchType = data.searchType;
    loading = false;
    lastStatus = _status;
  });

  // Admin hide/show
  let removedProductIds: (string | number)[] = $state([]);
  let adminModalProduct: { id: string | number; title: string; active: boolean } | null = $state(null);
  let adminModalLoading = $state(false);

  function openAdminModal(product: any) {
    adminModalProduct = { id: product.id, title: product.title, active: product.active };
  }

  function closeAdminModal() {
    adminModalProduct = null;
    adminModalLoading = false;
  }

  async function confirmToggleVisibility() {
    if (!adminModalProduct) return;
    adminModalLoading = true;
    const result = await updateProduct(String(adminModalProduct.id), { active: !adminModalProduct.active });
    if (result) {
      removedProductIds = [...removedProductIds, adminModalProduct.id];
    }
    closeAdminModal();
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
    goto(url.toString(), { keepFocus: true, noScroll: true });
  }

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);

    loading = true;
    searchTimeout = setTimeout(() => {
      updateURL({
        search: searchInput,
        searchType: searchTypeInput,
        region: searchTypeInput === 'products' ? regionInput : '',
        city: searchTypeInput === 'products' ? cityInput : '',
        category: searchTypeInput === 'products' ? categoryInput : '',
        page: '1',
        status: data.status,
        limit: data.limit.toString()
      });
    }, 300);
  }

  function handleSearchTypeChange(type: string) {
    if (searchTypeInput === type) return; // Already on this tab
    searchTypeInput = type;
    loading = true;
    updateURL({
      searchType: type,
      search: searchInput,
      region: type === 'products' ? regionInput : '',
      city: type === 'products' ? cityInput : '',
      category: type === 'products' ? categoryInput : '',
      page: '1',
      status: data.status,
      limit: data.limit.toString()
    });
  }

  function handleLocationInput() {
    if (searchTimeout) clearTimeout(searchTimeout);

    loading = true;
    searchTimeout = setTimeout(() => {
      updateURL({
        search: searchInput,
        searchType: searchTypeInput,
        region: regionInput,
        city: cityInput,
        category: categoryInput,
        page: '1',
        status: data.status,
        limit: data.limit.toString()
      });
    }, 300);
  }

  function clearFilters() {
    searchInput = '';
    regionInput = '';
    cityInput = '';
    categoryInput = '';
    updateURL({
      search: '',
      searchType: searchTypeInput,
      region: '',
      city: '',
      category: '',
      page: '1',
      status: data.status,
      limit: data.limit.toString()
    });
  }

  function changeTab(status: string) {
    if (data.status === status) return;
    removedProductIds = [];
    loading = true;
    updateURL({
      status,
      page: '1',
      search: searchInput,
      searchType: searchTypeInput,
      region: regionInput,
      city: cityInput,
      category: categoryInput,
      limit: data.limit.toString()
    });
  }

  function goToPage(page: number) {
    updateURL({
      page: page.toString(),
      status: data.status,
      search: searchInput,
      searchType: searchTypeInput,
      region: regionInput,
      city: cityInput,
      category: categoryInput,
      limit: data.limit.toString()
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function changeItemsPerPage(limit: number) {
    updateURL({
      limit: limit.toString(),
      page: '1',
      status: data.status,
      search: searchInput,
      searchType: searchTypeInput,
      region: regionInput,
      city: cityInput,
      category: categoryInput
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

  $effect(() => {
    const currentDataCategory = data.category || '';
    if (currentDataCategory !== lastDataCategory) {
      if (currentDataCategory !== categoryInput) {
        categoryInput = currentDataCategory;
      }
      lastDataCategory = currentDataCategory;
    }
  });

  // Sync searchType from URL on back/forward navigation
  $effect(() => {
    const currentSearchType = data.searchType || 'products';
    if (currentSearchType !== searchTypeInput) {
      searchTypeInput = currentSearchType;
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

  // Cache end timestamps to avoid repeated Date parsing
  let endTimestamps: { [key: string]: number } = {};
  // Track ended products to skip them in future ticks
  let endedProducts = new Set<string>();

  function updateCountdowns() {
    const now = Date.now();

    for (const product of data.products) {
      const key = String(product.id);

      // Skip already-ended products
      if (endedProducts.has(key)) continue;

      // Cache parsed end timestamp
      if (!endTimestamps[key]) {
        endTimestamps[key] = new Date(product.auctionEndDate).getTime();
      }

      const diff = endTimestamps[key] - now;

      if (diff <= 0) {
        countdowns[product.id] = 'Ended';
        endedProducts.add(key);
        continue;
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
    }
  }

  // Reset caches when product list changes (pagination, search)
  $effect(() => {
    // Read data.products to track the dependency
    const _products = data.products;
    endTimestamps = {};
    endedProducts = new Set();
  });

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
      .filter((p: any) => !removedProductIds.includes(p.id))
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
    if (data.status !== 'ended') {
      updateCountdowns();
      countdownInterval = setInterval(updateCountdowns, 1000);
    }
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
      } else if (event.type === 'product_visibility') {
        // Product hidden/unhidden by admin — remove from browse list if hidden
        const visEvent = event as ProductVisibilityEvent;
        const pid = String(visEvent.productId);
        if (!visEvent.active) {
          // Hidden — remove from visible products
          data.products = data.products.filter(p => String(p.id) !== pid);
          // Also remove from admin's removed list so it doesn't linger
          removedProductIds = [...removedProductIds, visEvent.productId];
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
<div class="mb-0 overflow-hidden relative z-10">
  <div class="beta-banner">
    <div class="max-w-7xl mx-auto text-center">
      <span class="badge-bh font-mono mb-2 inline-block">
        Experimental
      </span>
      <p class="text-sm sm:text-base leading-snug sm:leading-relaxed mx-auto max-w-5xl px-2 break-words" style="color: var(--color-fg); opacity: 0.7;">
        We're testing what works and gathering public interest.
        <strong class="font-semibold" style="color: var(--color-fg); opacity: 1;">No integrated payments yet</strong> ---
        transactions are coordinated directly between buyers and sellers.
        Once we have enough traction, we'll integrate secure payments and become a full-blown bidding platform!
      </p>
    </div>
  </div>
</div>

<!-- Welcome Hero Section -->
<div class="mb-0">
  <section class="hero-section py-10 sm:py-14 lg:py-20 text-center">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-20 sm:h-28 lg:h-36 w-auto mx-auto" />
      </div>

      <h1 class="headline-bh text-3xl sm:text-4xl lg:text-5xl mb-3 hero-title font-display">
        Welcome to <span class="font-display" style="border-bottom: 4px solid var(--color-fg);">BidMo.to</span>
      </h1>

      <p class="text-base sm:text-lg lg:text-xl mb-3 hero-subtitle font-sans">
        Bid mo 'to! The Filipino way to bid, buy, and sell unique items
      </p>

      <p class="text-sm sm:text-base mb-8 hero-body max-w-2xl mx-auto font-sans">
        Join us in building the Philippines' most exciting auction platform.
        Your participation helps us understand what features matter most!
      </p>

      <div class="flex flex-wrap gap-4 sm:gap-8 justify-center text-sm sm:text-base hero-features">
        <div class="flex items-center gap-2">
          <span class="hero-icon-muted">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <span>Browse Auctions</span>
        </div>
        {#if $authStore.isAuthenticated}
          <div class="flex items-center gap-2">
            <span class="hero-icon-muted">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </span>
            <a href="/sell" class="hero-link font-semibold">List an Item</a>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="font-semibold hero-emphasis">Free</span>
          <span>to join</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-semibold hero-emphasis">Safe</span>
          <span>No payment integration</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge-bh font-mono">Beta</span>
          <span>Help us grow</span>
        </div>
      </div>
    </div>
  </section>
</div>

<!-- Divider between hero and content -->
<div class="divider-bh mt-0 mb-0"></div>

<div class="products-page">
  <div class="page-header">
    <h2 class="headline-bh text-2xl sm:text-3xl mb-4 pb-3">Browse Products</h2>

    <!-- Search and Filters -->
    <div class="search-filter-container">
      <!-- Search Type Toggle -->
      <div class="search-type-toggle">
        <button
          class="search-type-btn"
          class:active={searchTypeInput === 'products'}
          onclick={() => handleSearchTypeChange('products')}
        >
          Products
        </button>
        <button
          class="search-type-btn"
          class:active={searchTypeInput === 'users'}
          onclick={() => handleSearchTypeChange('users')}
        >
          Users
        </button>
      </div>

      <div class="search-container">
        <input
          type="text"
          bind:value={searchInput}
          oninput={handleSearchInput}
          placeholder={searchTypeInput === 'users' ? 'Search users by name...' : 'Search by title, description, or keywords...'}
          class="search-input input-bh"
          aria-label="Search products"
        />
        {#if searchInput}
          <button class="clear-search" aria-label="Clear search" onclick={() => { searchInput = ''; handleSearchInput(); }}>&#x2715;</button>
        {/if}
      </div>

      {#if searchTypeInput === 'products'}
        <div class="location-filters">
          <select
            bind:value={regionInput}
            onchange={handleLocationInput}
            class="location-select"
            aria-label="Filter by region"
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
            aria-label="Filter by city"
          >
            <option value="">All Cities</option>
            {#each availableCities as city}
              <option value={city}>{city}</option>
            {/each}
          </select>
          <select
            bind:value={categoryInput}
            onchange={handleLocationInput}
            class="location-select"
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {#each categories as category}
              <option value={category.value}>{category.label}</option>
            {/each}
          </select>
          {#if searchInput || regionInput || cityInput || categoryInput}
            <button class="btn-bh" onclick={clearFilters}>Clear All</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if (data.search || data.region || data.city || data.category) && data.totalDocs > 0}
      <p class="label-bh mt-2">Found {data.totalDocs} result{data.totalDocs !== 1 ? 's' : ''}</p>
    {/if}

    <!-- Items per page selector -->
    <div class="controls-container">
      <div class="items-per-page">
        <label class="label-bh" for="items-per-page">Items per page:</label>
        <select id="items-per-page" class="ipp-select" value={data.limit} onchange={(e) => changeItemsPerPage(parseInt(e.currentTarget.value))}>
          {#each itemsPerPageOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </div>
    </div>
  </div>

  {#if searchTypeInput === 'users'}
    <!-- User Search Results -->
    {#if loading}
      <section class="auction-section">
        <div class="users-grid">
          {#each Array(data.limit || 12) as _}
            <div class="user-card skeleton-card card-bh">
              <div class="user-card-avatar skeleton-pulse"></div>
              <div class="user-card-info">
                <div class="skeleton-line skeleton-title skeleton-pulse"></div>
                <div class="skeleton-line skeleton-desc-short skeleton-pulse"></div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {:else if data.users && data.users.length > 0}
      <section class="auction-section">
        <div class="users-grid">
          {#each data.users as user}
            <a href="/users/{user.id}" class="user-card card-bh">
              <div class="user-card-avatar">
                {#if user.profilePicture && typeof user.profilePicture === 'object' && user.profilePicture.url}
                  <img src={user.profilePicture.url} alt={user.name} />
                {:else}
                  <span class="user-card-initial">{user.name?.charAt(0)?.toUpperCase() || '?'}</span>
                {/if}
              </div>
              <div class="user-card-info">
                <h3>{user.name}</h3>
                <span class="user-card-role badge-bh role-{user.role}">{user.role}</span>
              </div>
              <div class="user-card-meta">
                <span class="label-bh">{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
              </div>
            </a>
          {/each}
        </div>

        <!-- Pagination -->
        {#if data.totalPages > 1}
          <div class="pagination">
            <button
              class="btn-bh-outline pagination-btn"
              disabled={data.currentPage === 1}
              onclick={() => goToPage(data.currentPage - 1)}
            >
              Prev
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
              class="btn-bh-outline pagination-btn"
              disabled={data.currentPage === data.totalPages}
              onclick={() => goToPage(data.currentPage + 1)}
            >
              Next
            </button>
          </div>
        {/if}
      </section>
    {:else}
      <div class="empty-state card-bh p-8 text-center">
        <p class="text-lg mb-2">No users found matching "{data.search}"</p>
        <button class="btn-bh" onclick={clearFilters}>Clear Search</button>
      </div>
    {/if}
  {:else}
    <!-- Product Search Mode -->
    {#if (data.search || data.region || data.city) && data.totalDocs === 0}
      <div class="empty-state card-bh p-8 text-center">
        <p class="text-lg mb-2">No products found matching your filters</p>
        {#if data.search}<p class="label-bh mb-1">Search: "{data.search}"</p>{/if}
        {#if data.region}<p class="label-bh mb-1">Region: "{data.region}"</p>{/if}
        {#if data.city}<p class="label-bh mb-1">City: "{data.city}"</p>{/if}
        <button class="btn-bh mt-4" onclick={clearFilters}>Clear Filters</button>
      </div>
    {/if}

    <!-- Tabs -->
    <div class="tabs-container" id="products-section" role="tablist">
      <button
        class="tab"
        role="tab"
        aria-selected={data.status === 'active'}
        class:active={data.status === 'active'}
        onclick={() => changeTab('active')}
      >
        Active Auctions
      </button>
      <button
        class="tab"
        role="tab"
        aria-selected={data.status === 'ended'}
        class:active={data.status === 'ended'}
        onclick={() => changeTab('ended')}
      >
        Ended Auctions
      </button>
      <button
        class="tab"
        role="tab"
        aria-selected={data.status === 'my-bids'}
        class:active={data.status === 'my-bids'}
        onclick={() => changeTab('my-bids')}
      >
        My Bids
      </button>
      {#if $authStore.user?.role === 'admin'}
        <button
          class="tab tab-admin"
          role="tab"
          aria-selected={data.status === 'hidden'}
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
        {newProductCount} new {newProductCount === 1 ? 'product' : 'products'} listed -- click to refresh
      </button>
    {/if}

    <!-- Products Grid -->
    {#if loading}
      <section class="auction-section" role="tabpanel">
        <div class="products-grid">
          {#each Array(data.limit || 12) as _}
            <div class="product-card card-bh skeleton-card">
              <div class="product-image skeleton-pulse"></div>
              <div class="product-info">
                <div class="skeleton-line skeleton-title skeleton-pulse"></div>
                <div class="skeleton-line skeleton-desc skeleton-pulse"></div>
                <div class="skeleton-line skeleton-desc-short skeleton-pulse"></div>
                <div class="skeleton-spacing"></div>
                <div class="skeleton-line skeleton-label skeleton-pulse"></div>
                <div class="skeleton-line skeleton-price skeleton-pulse"></div>
                <div class="skeleton-footer">
                  <div class="skeleton-badge skeleton-pulse"></div>
                  <div class="skeleton-badge skeleton-timer skeleton-pulse"></div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </section>
    {:else if sortedProducts.length > 0}
      <section class="auction-section" role="tabpanel">
        <div class="products-grid">
          {#each sortedProducts as product}
            <a href="/products/{product.id}?from=browse" class="product-card card-bh" class:ended-card={data.status === 'ended'}>
              <div class="product-image">
                {#if product.images && product.images.length > 0 && product.images[0].image}
                  <img
                    src="{product.images[0].image.url}"
                    alt="{product.images[0].image.alt || product.title}"
                    width="400"
                    height="200"
                    loading="lazy"
                    decoding="async"
                    onload={(e) => e.currentTarget.classList.add('loaded')}
                  />
                {:else}
                  <div class="placeholder-image">
                    <span class="label-bh">No Image</span>
                  </div>
                {/if}
                {#if data.status === 'ended'}
                  <div class="ended-overlay">
                    {product.status === 'sold' ? 'SOLD' : product.status.toUpperCase()}
                  </div>
                {/if}
                {#if $authStore.isAuthenticated && $watchlistStore.loaded}
                  <div class="watchlist-btn">
                    <WatchlistToggle productId={product.id} size="sm" />
                  </div>
                {/if}
              </div>

              <div class="product-info">
                <h3 class="product-title">{product.title}</h3>
                <p class="description">{product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}</p>

                {#if product.region || product.city}
                  <div class="location-info">
                    <svg class="location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span class="text-xs">{product.city}{product.city && product.region ? ', ' : ''}{product.region}</span>
                  </div>
                {/if}

                {#if product.categories && product.categories.length > 0}
                  <div class="category-tags">
                    {#each product.categories.slice(0, 3) as categoryValue}
                      <span class="category-tag badge-bh">{getCategoryLabel(categoryValue)}</span>
                    {/each}
                    {#if product.categories.length > 3}
                      <span class="category-tag category-overflow badge-bh">+{product.categories.length - 3}</span>
                    {/if}
                  </div>
                {/if}

                <div class="pricing">
                  {#if product.currentBid}
                    <div class="current-bid-section">
                      <div class="current-bid-row">
                        <div>
                          <span class="label-bh">{data.status === 'ended' && product.status === 'sold' ? 'Sold For:' : data.status === 'ended' ? 'Final Bid:' : 'Current Bid:'}</span>
                          <span class="price-large current-bid">{formatPrice(product.currentBid, product.seller.currency)}</span>
                        </div>
                        {#if product.currentBid > product.startingPrice}
                          <div class="percent-increase">
                            <svg class="arrow-up-mini" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true">
                              <polyline points="18 15 12 9 6 15"></polyline>
                            </svg>
                            <span class="text-xs">{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%</span>
                          </div>
                        {/if}
                      </div>
                      <div class="starting-price-row">
                        <span class="label-bh" style="font-size:0.65rem">Starting:</span>
                        <span class="price-tiny">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                      </div>
                    </div>
                  {:else}
                    <div>
                      <span class="label-bh">Starting Price:</span>
                      <span class="price-large">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                    </div>
                  {/if}

                  {#if userBids[product.id]}
                    <div class="user-bid-section">
                      <span class="label-bh">Your Bid:</span>
                      <span class="price-large your-bid">{formatPrice(userBids[product.id], product.seller.currency)}</span>
                    </div>
                  {/if}
                </div>

                <div class="auction-info">
                  <div class="status-row">
                    <span class="status badge-bh status-{product.status}">{product.status}</span>
                    {#if $authStore.user && product.seller?.id === $authStore.user.id}
                      <span class="owner-badge badge-bh">Your Listing</span>
                    {/if}
                    {#if $authStore.user?.role === 'admin' && data.status !== 'hidden'}
                      <button
                        class="admin-hide-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); openAdminModal(product); }}
                      >
                        Hide
                      </button>
                    {/if}
                    {#if data.status === 'hidden'}
                      <button
                        class="admin-show-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); openAdminModal(product); }}
                      >
                        Unhide
                      </button>
                    {/if}
                  </div>
                  {#if data.status === 'active' || data.status === 'my-bids'}
                    <div class="countdown-badge countdown-{getUrgencyClass(product.auctionEndDate)}">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span class="text-xs font-mono">{countdowns[product.id] || 'Loading...'}</span>
                    </div>
                  {:else}
                    <div class="countdown-badge countdown-ended">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span class="text-xs font-mono">Ended</span>
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
              class="btn-bh-outline pagination-btn"
              disabled={data.currentPage === 1}
              onclick={() => goToPage(data.currentPage - 1)}
            >
              Prev
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
              class="btn-bh-outline pagination-btn"
              disabled={data.currentPage === data.totalPages}
              onclick={() => goToPage(data.currentPage + 1)}
            >
              Next
            </button>
          </div>
        {/if}
      </section>
    {:else}
      <div class="empty-state card-bh p-8 text-center">
        {#if data.status === 'my-bids'}
          <p class="text-lg mb-2">You do not have any bids yet.</p>
          <p><a href="/products?status=active" class="hero-link font-semibold hover:underline">Browse Active Auctions</a></p>
        {:else if data.status === 'ended'}
          <p class="text-lg mb-2">No Ended Auctions Available</p>
          <p><a href="/products?status=active" class="hero-link font-semibold hover:underline">Browse Active Auctions</a></p>
        {:else}
          <p class="text-lg mb-2">No active auctions available.</p>
          <p><a href="/sell" class="hero-link font-semibold hover:underline">Be the first to list a product!</a></p>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<!-- Admin Hide/Unhide Confirmation Modal -->
{#if adminModalProduct}
  <div class="modal-overlay" onclick={closeAdminModal}>
    <div class="modal-content card-bh" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeAdminModal}>&times;</button>

      <div class="modal-header">
        <h2 class="headline-bh text-xl">{adminModalProduct.active ? 'Hide Item' : 'Unhide Item'}</h2>
      </div>

      <div class="modal-body">
        <p class="font-semibold text-lg mb-3">"{adminModalProduct.title}"</p>
        <p class="text-sm opacity-70 mb-6 leading-relaxed">
          {#if adminModalProduct.active}
            This item will be hidden from all users and moved to the <strong>Hidden Items</strong> tab. The seller will not be notified.
          {:else}
            This item will be restored and visible to all users again under <strong>Active Auctions</strong>.
          {/if}
        </p>

        <div class="modal-actions">
          <button class="btn-bh-outline" onclick={closeAdminModal} disabled={adminModalLoading}>
            Cancel
          </button>
          <button
            class="btn-modal-confirm {adminModalProduct.active ? 'btn-modal-hide' : 'btn-modal-unhide'}"
            onclick={confirmToggleVisibility}
            disabled={adminModalLoading}
          >
            {#if adminModalLoading}
              <span class="modal-spinner"></span>
              Processing...
            {:else}
              {adminModalProduct.active ? 'Hide Item' : 'Unhide Item'}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* ══════════════════════════════════════════════════
     PRODUCTS PAGE — Minimalist Monochrome Design
     Pure black & white, line-based, zero radius
     ══════════════════════════════════════════════════ */

  .products-page {
    padding: 2rem 0;
  }

  .page-header {
    margin-bottom: 2rem;
  }

  /* ── Beta Banner ── */
  .beta-banner {
    background: transparent;
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1rem;
  }

  /* Color inversion for emphasis badges */

  /* ── Hero Section ── */
  .hero-section {
    background: transparent;
    color: var(--color-fg);
  }

  .hero-title {
    color: var(--color-fg);
  }

  .hero-subtitle {
    color: var(--color-fg);
    opacity: 0.6;
  }

  .hero-body {
    color: var(--color-fg);
    opacity: 0.45;
  }

  .hero-features {
    color: var(--color-fg);
    opacity: 0.7;
  }

  .hero-icon-muted {
    color: var(--color-fg);
    opacity: 0.4;
  }

  .hero-emphasis {
    color: var(--color-fg);
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
  }

  .hero-link {
    color: var(--color-fg);
    text-decoration: underline;
    text-underline-offset: 3px;
    transition: opacity 100ms ease-out;
  }

  .hero-link:hover {
    opacity: 0.6;
  }

  /* ── Search & Filters ── */
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
    font-family: var(--font-ui);
    background: var(--color-surface);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: 0;

    cursor: pointer;
    transition: all 100ms ease-out;
  }

  .location-select:focus {
    outline: none;
    border-color: var(--color-fg);
    border-width: 2px;
    background: var(--color-surface-hover);
  }

  .location-select:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .clear-search {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    font-size: 1.25rem;
    color: var(--color-fg);
    opacity: 0.5;
    cursor: pointer;
    padding: 0.5rem;
    line-height: 1;
    transition: opacity 0.2s;
  }

  .clear-search:hover {
    opacity: 1;
  }

  .controls-container {
    margin-top: 1rem;
  }

  .items-per-page {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .ipp-select {
    padding: 0.5rem 2.5rem 0.5rem 0.75rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    background: var(--color-surface);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    border-radius: 0;

    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 1.25rem;
    cursor: pointer;
    appearance: none;
    transition: all 100ms ease-out;
  }

  .ipp-select:focus {
    outline: none;
    border-color: var(--color-fg);
    border-width: 2px;
    background-color: var(--color-surface-hover);
  }

  /* ── Tabs ── */
  .tabs-container {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 2rem;
    border-bottom: 1px solid var(--color-border);
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    background: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    font-weight: 500;
    font-size: 0.95rem;
    color: var(--color-fg);
    opacity: 0.5;
    cursor: pointer;
    transition: all 100ms ease-out;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tab:hover:not(.active) {
    background: var(--color-muted);
    opacity: 0.8;
  }

  .tab.active {
    background: var(--color-fg);
    border-color: var(--color-fg);
    border-bottom-color: transparent;
    color: var(--color-bg);
    opacity: 1;
    font-weight: 700;
  }

  .tab-admin {
    color: var(--color-red);
  }

  .tab-admin.active {
    color: var(--color-red);
    border-color: var(--color-border);
    border-bottom-color: transparent;
  }

  /* ── Search Type Toggle ── */
  .search-type-toggle {
    display: flex;
    gap: 0.25rem;
    margin-bottom: 0.75rem;
    max-width: 600px;
  }

  .search-type-btn {
    flex: 1;
    padding: 0.625rem 1rem;
    font-weight: 500;
    font-size: 0.9rem;
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-fg);
    opacity: 0.5;
    cursor: pointer;
    transition: all 100ms ease-out;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .search-type-btn.active {
    background: var(--color-fg);
    border-color: var(--color-fg);
    color: var(--color-bg);
    opacity: 1;
  }

  .search-type-btn:hover:not(.active) {
    background: var(--color-muted);
    opacity: 0.8;
  }

  /* ── Product Grid ── */
  .auction-section {
    margin-bottom: 3rem;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }

  /* Staggered card entrance animation */
  .products-grid .product-card:not(.skeleton-card) {
    animation: cardEnter 0.15s ease-out both;
  }

  .products-grid .product-card:not(.skeleton-card):nth-child(1) { animation-delay: 0ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(2) { animation-delay: 40ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(3) { animation-delay: 80ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(4) { animation-delay: 120ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(5) { animation-delay: 160ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(6) { animation-delay: 200ms; }
  .products-grid .product-card:not(.skeleton-card):nth-child(n+7) { animation-delay: 240ms; }

  @keyframes cardEnter {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Staggered user card entrance */
  .users-grid .user-card:not(.skeleton-card) {
    animation: cardEnter 0.15s ease-out both;
  }

  .users-grid .user-card:not(.skeleton-card):nth-child(1) { animation-delay: 0ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(2) { animation-delay: 40ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(3) { animation-delay: 80ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(4) { animation-delay: 120ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(5) { animation-delay: 160ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(6) { animation-delay: 200ms; }
  .users-grid .user-card:not(.skeleton-card):nth-child(n+7) { animation-delay: 240ms; }

  /* ── Product Card ── */
  .product-card {
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
  }

  .ended-card {
    opacity: 0.85;
    transition: opacity 0.15s ease-out;
  }

  .ended-card:hover {
    opacity: 1;
  }

  .ended-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);

    color: #fff;
    padding: 0.5rem 1.5rem;
    font-size: 0.85rem;
    font-weight: 800;
    font-family: var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    pointer-events: none;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0;
  }

  .product-image {
    position: relative;
    width: 100%;
    height: 200px;
    overflow: hidden;
    background-color: var(--color-muted);
    border-radius: 0 0 0 0;
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 100ms ease-out;
  }

  .product-card:hover .product-image img {
    transform: scale(1.02);
  }

  .placeholder-image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-muted);
  }

  .watchlist-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    z-index: 5;
  }

  .product-info {
    padding: 1.5rem;
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .product-title {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
    font-family: var(--font-ui);
    font-weight: 700;
    line-height: 1.2;
  }

  .description {
    color: var(--color-fg);
    opacity: 0.5;
    margin-bottom: 0.75rem;
    flex: 1;
    font-family: var(--font-ui);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .location-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.5;
    margin-bottom: 0.75rem;
    padding: 0.375rem 0.5rem;
    background-color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 0;
    width: fit-content;
  }

  .location-icon {
    color: var(--color-fg);
    opacity: 0.4;
    flex-shrink: 0;
  }

  .category-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    margin-bottom: 0.75rem;
  }

  .category-tag {
    display: inline-block;
    background: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.7;
    padding: 0.2rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 500;
    border: 1px solid var(--color-border);
    white-space: nowrap;
    border-radius: 9999px;
  }

  .category-tag.category-overflow {
    background: transparent;
    color: var(--color-fg);
    opacity: 0.4;
    border-color: transparent;
  }

  /* ── Pricing ── */
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
    border: 1px solid var(--color-border);
    border-radius: 0;
    margin-top: 0.5rem;
  }

  .price-large {
    font-weight: 900;
    font-size: 1.4rem;
    display: block;
    font-family: var(--font-ui);
  }

  .price-tiny {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--color-fg);
    opacity: 0.5;
  }

  .current-bid {
    color: var(--color-fg);
  }

  .your-bid {
    color: var(--color-fg);
  }

  .percent-increase {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    background: rgba(16, 185, 129, 0.1);
    color: var(--color-green);
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 0;
  }

  .arrow-up-mini {
    color: var(--color-green);
    flex-shrink: 0;
  }

  /* ── Auction Info Footer ── */
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
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
    border-radius: 9999px;
  }

  .owner-badge {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 500;
    background: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.6;
    border: 1px solid var(--color-border);
    border-radius: 9999px;
  }

  .admin-hide-btn,
  .admin-show-btn {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    color: white;
    border: 1px solid transparent;
    border-radius: 0;
    cursor: pointer;
    transition: all 0.15s ease-out;
  }

  .admin-hide-btn {
    background: var(--color-red);
    border-color: var(--color-red);
  }

  .admin-hide-btn:hover {
    background: transparent;
    color: var(--color-red);
  }

  .admin-show-btn {
    background: var(--color-green);
    border-color: var(--color-green);
  }

  .admin-show-btn:hover {
    background: transparent;
    color: var(--color-green);
  }

  /* ── Status Badges ── */
  .status-active,
  .status-available {
    background: var(--color-fg);
    color: var(--color-bg);
    border: 1px solid var(--color-fg);
  }

  .status-ended {
    background: transparent;
    color: var(--color-fg);
    opacity: 0.5;
    border: 1px solid var(--color-fg);
  }

  .status-sold {
    background: var(--color-fg);
    color: var(--color-bg);
    border: 1px solid var(--color-fg);
  }

  .status-cancelled {
    background: transparent;
    color: var(--color-fg);
    opacity: 0.4;
    border: 1px solid var(--color-border);
  }

  /* ── Countdown Badges ── */
  .countdown-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 700;
    font-family: var(--font-ui);
    transition: all 0.15s ease-out;
    border-radius: 0;
  }

  .countdown-icon {
    flex-shrink: 0;
  }

  /* Normal - More than 24 hours */
  .countdown-normal {
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-fg);
    border: 1px solid rgba(99, 102, 241, 0.2);
  }

  /* Warning - Less than 24 hours */
  .countdown-warning {
    background: rgba(245, 158, 11, 0.1);
    color: var(--color-yellow);
    border: 1px solid rgba(245, 158, 11, 0.2);
  }

  /* Urgent - Less than 12 hours */
  .countdown-urgent {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-red);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  /* Critical - Less than 3 hours */
  .countdown-critical {
    background: rgba(239, 68, 68, 0.2);
    color: var(--color-red);
    border: 1px solid rgba(239, 68, 68, 0.3);
    animation: pulse-critical 1s ease-in-out infinite;
  }

  /* Ended */
  .countdown-ended {
    background: var(--color-muted);
    color: var(--color-fg);
    opacity: 0.5;
    border: 1px solid var(--color-border);
  }

  @keyframes pulse-critical {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }

  /* ── Pagination ── */
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
    font-size: 0.9rem;
  }

  .pagination-numbers {
    display: flex;
    gap: 0.25rem;
  }

  .pagination-number {
    min-width: 2.5rem;
    padding: 0.625rem 0.75rem;
    background-color: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    opacity: 0.5;
    font-weight: 500;
    font-family: var(--font-ui);
    cursor: pointer;
    border-radius: 0;
    transition: all 100ms ease-out;
  }

  .pagination-number:hover:not(.active) {
    background: var(--color-muted);
    opacity: 0.8;
  }

  .pagination-number.active {
    background: var(--color-fg);
    border-color: var(--color-fg);
    color: var(--color-bg);
    opacity: 1;
  }

  /* ── New Products Banner ── */
  .new-products-banner {
    width: 100%;
    padding: 0.75rem 1.5rem;
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-fg);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 0;
    font-weight: 700;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    cursor: pointer;
    text-align: center;
    margin-bottom: 1rem;
    transition: all 100ms ease-out;
    animation: bannerSlideDown 0.15s ease-out;

  }

  .new-products-banner:hover {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.3);
  }

  @keyframes bannerSlideDown {
    from {
      transform: translateY(-100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  /* ── Empty State ── */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
  }

  /* ── User Cards ── */
  .users-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.25rem;
  }

  .user-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    text-decoration: none;
    color: inherit;
  }

  .user-card-avatar {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 9999px !important;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .user-card-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-card-initial {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-fg);
    font-family: var(--font-ui);
  }

  .user-card-info {
    flex: 1;
    min-width: 0;
  }

  .user-card-info h3 {
    margin: 0 0 0.25rem 0;
    font-size: 1.1rem;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-card-role {
    display: inline-block;
    padding: 0.125rem 0.625rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: capitalize;
    border: 1px solid var(--color-border);
    border-radius: 9999px;
  }

  .role-seller {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-red);
    border-color: rgba(239, 68, 68, 0.2);
  }

  .role-buyer {
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-fg);
    border-color: rgba(99, 102, 241, 0.2);
  }

  .user-card-meta {
    flex-shrink: 0;
    text-align: right;
  }

  /* ── Admin Confirmation Modal ── */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);

    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: overlayFadeIn 0.15s ease-out;
    padding: 1rem;
  }

  @keyframes overlayFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal-content {
    max-width: 460px;
    width: 90%;
    position: relative;
    animation: modalSlideUp 0.15s ease-out;
    padding: 0;
  }

  @keyframes modalSlideUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: 1px solid var(--color-border);
    border-radius: 0;
    font-size: 2rem;
    color: var(--color-fg);
    opacity: 0.6;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease-out;
  }

  .modal-close:hover {
    background: var(--color-muted);
    opacity: 1;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
  }

  .btn-modal-confirm {
    flex: 1;
    padding: 0.85rem 1.5rem;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.15s ease-out;
    border: 1px solid transparent;
    border-radius: 0;
  }

  .btn-modal-hide {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-red);
    border-color: rgba(239, 68, 68, 0.3);
  }

  .btn-modal-hide:hover {
    background: rgba(239, 68, 68, 0.25);
  }

  .btn-modal-unhide {
    background: rgba(16, 185, 129, 0.15);
    color: var(--color-green);
    border-color: rgba(16, 185, 129, 0.3);
  }

  .btn-modal-unhide:hover {
    background: rgba(16, 185, 129, 0.25);
  }

  .btn-modal-confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50% !important;
    animation: modalSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  @keyframes modalSpin {
    to { transform: rotate(360deg); }
  }

  /* ── Skeleton Loading ── */
  .skeleton-card {
    pointer-events: none;
  }

  .skeleton-pulse {
    background: var(--color-muted);
    animation: skeleton-shimmer 1.5s ease-in-out infinite;
  }

  .skeleton-card .product-image {
    height: 200px;
  }

  .skeleton-line {
    border-radius: 0;
  }

  .skeleton-title {
    height: 1.25rem;
    width: 75%;
    margin-bottom: 0.75rem;
  }

  .skeleton-desc {
    height: 0.875rem;
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .skeleton-desc-short {
    height: 0.875rem;
    width: 60%;
    margin-bottom: 0.75rem;
  }

  .skeleton-spacing {
    height: 1rem;
  }

  .skeleton-label {
    height: 0.625rem;
    width: 30%;
    margin-bottom: 0.5rem;
  }

  .skeleton-price {
    height: 1.4rem;
    width: 45%;
    margin-bottom: 1rem;
  }

  .skeleton-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
  }

  .skeleton-badge {
    height: 1.75rem;
    width: 5rem;
    border-radius: 9999px;
  }

  .skeleton-timer {
    width: 7rem;
  }

  @keyframes skeleton-shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* User skeleton */
  .user-card.skeleton-card .user-card-avatar {
    width: 56px;
    height: 56px;
    border-radius: 9999px !important;
  }

  .user-card.skeleton-card .user-card-info {
    flex: 1;
  }

  .user-card.skeleton-card .skeleton-title {
    width: 60%;
    margin-bottom: 0.5rem;
  }

  .user-card.skeleton-card .skeleton-desc-short {
    width: 35%;
    height: 1.25rem;
    margin-bottom: 0;
  }

  /* ══════════════════════════════════════════════════
     MOBILE RESPONSIVE
     ══════════════════════════════════════════════════ */
  @media (max-width: 768px) {
    .products-page {
      padding: 1rem 0;
    }

    .page-header {
      margin-bottom: 1rem;
    }

    .search-container {
      max-width: 100%;
    }

    .search-input {
      padding: 0.75rem 2.5rem 0.75rem 0.75rem;
      font-size: 0.95rem;
    }

    .location-filters {
      max-width: 100%;
      gap: 0.5rem;
    }

    .location-select {
      min-width: 0;
      flex: 1 1 calc(50% - 0.25rem);
      padding: 0.625rem 0.75rem;
      font-size: 0.9rem;
    }

    /* Tabs */
    .tabs-container {
      gap: 0;
      margin-bottom: 1rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .tabs-container::-webkit-scrollbar {
      display: none;
    }

    .tab {
      flex: 0 0 auto;
      padding: 0.625rem 0.75rem;
      font-size: 0.8rem;
      white-space: nowrap;
    }

    /* Products grid - single column on mobile */
    .products-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
      padding: 0;
    }

    .product-image {
      height: 200px;
    }

    .product-info {
      padding: 1rem;
    }

    .product-title {
      font-size: 1.1rem;
    }

    .description {
      font-size: 0.9rem;
    }

    .price-large {
      font-size: 1.2rem;
    }

    .auction-info {
      flex-direction: column;
      gap: 0.5rem;
      align-items: flex-start;
    }

    .countdown-badge {
      width: 100%;
      justify-content: center;
      padding: 0.375rem 0.5rem;
      font-size: 0.8rem;
    }

    /* Pagination */
    .pagination {
      flex-wrap: wrap;
      gap: 0.375rem;
      padding: 0.75rem 0;
    }

    .pagination-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
    }

    .pagination-numbers {
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.25rem;
    }

    .pagination-number {
      min-width: 2rem;
      padding: 0.5rem 0.5rem;
      font-size: 0.85rem;
    }

    /* Modal */
    .modal-overlay {
      padding: 0.75rem;
    }

    .modal-content {
      width: 100%;
      max-width: 100%;
    }

    .modal-header {
      padding: 1.5rem 1.25rem 0.75rem;
    }

    .modal-body {
      padding: 0 1.25rem 1.25rem;
    }

    .modal-actions {
      flex-direction: column;
      gap: 0.5rem;
    }

    /* Items per page */
    .items-per-page {
      gap: 0.5rem;
    }

    .new-products-banner {
      font-size: 0.85rem;
      padding: 0.625rem 1rem;
    }

    /* Search type toggle */
    .search-type-toggle {
      max-width: 100%;
    }

    .search-type-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
    }

    /* Users grid */
    .users-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .user-card {
      padding: 1rem;
    }

    .user-card-avatar {
      width: 48px;
      height: 48px;
    }

    .user-card.skeleton-card .user-card-avatar {
      width: 48px;
      height: 48px;
    }
  }

  @media (max-width: 480px) {
    .product-image {
      height: 170px;
    }

    .product-info {
      padding: 0.75rem;
    }

    .location-select {
      flex: 1 1 100%;
    }

    .tab {
      padding: 0.5rem 0.625rem;
      font-size: 0.75rem;
    }

    .pagination-btn {
      padding: 0.375rem 0.5rem;
      font-size: 0.8rem;
    }

    .pagination-number {
      min-width: 1.75rem;
      padding: 0.375rem 0.375rem;
      font-size: 0.8rem;
    }

    .skeleton-card .product-image {
      height: 170px;
    }
  }
</style>
