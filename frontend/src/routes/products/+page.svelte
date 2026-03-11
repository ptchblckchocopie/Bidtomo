<script lang="ts">
  import type { PageData } from './$types';
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authStore } from '$lib/stores/auth';
  import { regions, getCitiesByRegion } from '$lib/data/philippineLocations';
  import { categories } from '$lib/data/categories';
  import { t } from '$lib/stores/locale';
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
      const pad = (n: number) => n < 10 ? `0${n}` : `${n}`;

      if (days > 0) {
        countdowns[product.id] = `${days}d ${pad(hours)}h ${pad(minutes)}m`;
      } else if (hours > 0) {
        countdowns[product.id] = `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
      } else {
        countdowns[product.id] = `${pad(minutes)}m ${pad(seconds)}s`;
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
  // Also hide products whose countdown just ended (client-side) from active view
  let sortedProducts = $derived(
    [...data.products]
      .filter((p: any) => !removedProductIds.includes(p.id))
      .filter((p: any) => {
        if (data.status === 'active' && countdowns[p.id] === 'Ended') return false;
        return true;
      })
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
      // Update every 5s instead of 1s — reduces DOM mutations from 96/sec to 96/5sec
      // Users don't need second-level precision on a grid of cards
      countdownInterval = setInterval(updateCountdowns, 5000);
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
  <meta name="description" content="Browse live auctions on BidMo.to — bid on electronics, collectibles, and more from Filipino sellers. Real-time bidding with countdown timers.">
  <meta property="og:title" content="Browse Products - BidMo.to">
  <meta property="og:description" content="The Filipino auction marketplace. Bid on unique items in real-time.">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="BidMo.to">
</svelte:head>
<!-- Beta Notice Banner -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 mb-0 overflow-hidden relative z-10">
  <div class="bg-bh-red border-b-2 border-black px-3 py-4">
    <div class="max-w-7xl mx-auto text-center">
      <div class="inline-block bg-black/20 text-white px-2 sm:px-3 py-1 border-2 border-black text-xs font-bold uppercase tracking-widest mb-2">
        🚧 {$t('hero.experimental')}
      </div>
      <p class="text-white text-xs sm:text-sm md:text-base leading-snug sm:leading-relaxed mx-auto max-w-5xl px-2 break-words">
        {$t('hero.betaNotice')}
        <strong class="font-bold underline whitespace-nowrap">{$t('hero.noPayments')}</strong> —
        {$t('hero.betaNoticeDetail')}
      </p>
    </div>
  </div>
</div>

<!-- Welcome Hero Section -->
<div class="-mx-4 sm:-mx-6 lg:-mx-8 mb-8">
  <section class="bg-bh-red text-white px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 text-center">
    <div class="max-w-4xl mx-auto">
      <div class="mb-6">
        <img src="/bidmo.to.png" alt="BidMo.to" class="h-20 sm:h-28 lg:h-36 w-auto mx-auto" />
      </div>

      <h1 class="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-3 uppercase tracking-widest">
        {$t('hero.welcomeTo')} <span class="text-white">BidMo.to</span>
      </h1>

      <p class="text-base sm:text-lg lg:text-xl mb-3 opacity-95">
        {$t('hero.tagline')}
      </p>

      <p class="text-sm sm:text-base mb-6 opacity-90 max-w-2xl mx-auto">
        {$t('hero.subtitle')}
      </p>

      <div class="flex flex-wrap gap-4 sm:gap-8 justify-center text-sm sm:text-base">
        <div class="flex items-center gap-2">
          <span class="text-xl">🔍</span>
          <span>{$t('hero.browseAuctions')}</span>
        </div>
        {#if $authStore.isAuthenticated}
          <div class="flex items-center gap-2">
            <span class="text-xl">🔨</span>
            <a href="/sell" class="hover:text-black transition-colors duration-150 ease-out">{$t('hero.listAnItem')}</a>
          </div>
        {/if}
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">{$t('hero.free')}</span>
          <span>{$t('hero.toJoin')}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">{$t('hero.safe')}</span>
          <span>{$t('hero.noPaymentIntegration')}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xl font-bold">{$t('hero.beta')}</span>
          <span>{$t('hero.helpUsGrow')}</span>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="products-page">
  <div class="page-header">
    <h2>{$t('products.browseProducts')}</h2>

    <!-- Search and Filters -->
    <div class="search-filter-container">
      <div class="search-type-toggle">
        <button
          class="search-type-btn"
          class:active={searchTypeInput === 'products'}
          onclick={() => handleSearchTypeChange('products')}
        >
          {$t('products.products')}
        </button>
        <button
          class="search-type-btn"
          class:active={searchTypeInput === 'users'}
          onclick={() => handleSearchTypeChange('users')}
        >
          {$t('products.sellers')}
        </button>
      </div>

      <div class="search-container">
        <input
          type="text"
          bind:value={searchInput}
          oninput={handleSearchInput}
          placeholder={searchTypeInput === 'users' ? $t('products.searchSellers') : $t('products.searchProducts')}
          class="search-input input-bh"
          aria-label={$t('products.searchProducts')}
        />
        {#if searchInput}
          <button class="clear-search" aria-label="Clear search" onclick={() => { searchInput = ''; handleSearchInput(); }}>✕</button>
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
            <option value="">{$t('products.allRegions')}</option>
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
            <option value="">{$t('products.allCities')}</option>
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
            <option value="">{$t('products.allCategories')}</option>
            {#each categories as category}
              <option value={category.value}>{$t('categories.' + category.value)}</option>
            {/each}
          </select>
          {#if searchInput || regionInput || cityInput || categoryInput}
            <button class="btn-clear-filters" onclick={clearFilters}>{$t('products.clearFilters')}</button>
          {/if}
        </div>
      {/if}
    </div>

    {#if (data.search || data.region || data.city || data.category) && data.totalDocs > 0}
      <p class="search-results">{$t('products.foundResults', { count: data.totalDocs })}</p>
    {/if}

    <!-- Items per page selector -->
    <div class="controls-container">
      <div class="items-per-page">
        <label for="items-per-page">{$t('products.itemsPerPage')}</label>
        <select id="items-per-page" value={data.limit} onchange={(e) => changeItemsPerPage(parseInt(e.currentTarget.value))}>
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
            <div class="user-card skeleton-card">
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
            <a href="/users/{user.id}" class="user-card">
              <div class="user-card-avatar">
                {#if user.profilePicture && typeof user.profilePicture === 'object' && user.profilePicture.url}
                  <img src={user.profilePicture.url} alt={user.name} />
                {:else}
                  <span class="user-card-initial">{user.name?.charAt(0)?.toUpperCase() || '?'}</span>
                {/if}
              </div>
              <div class="user-card-info">
                <h3>{user.name}</h3>
                <span class="user-card-role role-{user.role}">{user.role}</span>
              </div>
              <div class="user-card-meta">
                <span class="user-card-date">{$t('products.joined')} {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
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
              ← {$t('products.prev')}
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
              {$t('products.next')} →
            </button>
          </div>
        {/if}
      </section>
    {:else}
      <div class="empty-state">
        <p>{$t('products.noSellersFound')} "{data.search}"</p>
        <button class="btn-clear-search" onclick={clearFilters}>{$t('products.clearSearch')}</button>
      </div>
    {/if}
  {:else}
    <!-- Product Search Mode -->
    {#if (data.search || data.region || data.city) && data.totalDocs === 0}
      <div class="empty-state">
        <p>{$t('products.noProductsFound')}</p>
        {#if data.search}<p class="filter-detail">Search: "{data.search}"</p>{/if}
        {#if data.region}<p class="filter-detail">Region: "{data.region}"</p>{/if}
        {#if data.city}<p class="filter-detail">City: "{data.city}"</p>{/if}
        <button class="btn-clear-search" onclick={clearFilters}>{$t('products.clearFilters')}</button>
      </div>
    {/if}

    <!-- Tabs - Always visible -->
    <div class="tabs-container" id="products-section" role="tablist">
    <button
      class="tab"
      role="tab"
      aria-selected={data.status === 'active'}
      class:active={data.status === 'active'}
      onclick={() => changeTab('active')}
    >
      {$t('products.activeAuctions')}
    </button>
    <button
      class="tab"
      role="tab"
      aria-selected={data.status === 'ended'}
      class:active={data.status === 'ended'}
      onclick={() => changeTab('ended')}
    >
      {$t('products.ended')}
    </button>
    <button
      class="tab"
      role="tab"
      aria-selected={data.status === 'my-bids'}
      class:active={data.status === 'my-bids'}
      onclick={() => changeTab('my-bids')}
    >
      {$t('products.myBids')}
    </button>
    {#if $authStore.user?.role === 'admin'}
      <button
        class="tab tab-admin"
        role="tab"
        aria-selected={data.status === 'hidden'}
        class:active={data.status === 'hidden'}
        onclick={() => changeTab('hidden')}
      >
        {$t('products.hiddenItems')}
      </button>
    {/if}
  </div>

  <!-- New Products Notification Banner -->
  {#if newProductCount > 0}
    <button
      class="new-products-banner"
      onclick={() => { newProductCount = 0; window.location.reload(); }}
    >
      {$t('products.newProductsAvailable', { count: newProductCount })}
    </button>
  {/if}

  <!-- Products Grid -->
  {#if loading}
    <section class="auction-section" role="tabpanel">
      <div class="products-grid">
        {#each Array(data.limit || 12) as _}
          <div class="product-card skeleton-card">
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
            <div class="glow-card relative rounded-2xl border border-[rgba(255,255,255,0.06)] p-1.5">
            <a href="/products/{product.id}?from=browse" class="product-card !border-0" class:ended-card={data.status === 'ended'}>
              <div class="product-image">
                {#if product.images && product.images.length > 0 && product.images[0].image}
                  <img src="{product.images[0].image.url}" alt="{product.images[0].image.alt || product.title}" width="400" height="200" loading="lazy" decoding="async" onload={(e) => e.currentTarget.classList.add('loaded')} />
                {:else}
                  <div class="placeholder-image">
                    <span>{$t('products.noImage')}</span>
                  </div>
                {/if}
                {#if data.status === 'ended'}
                  <div class="ended-overlay">
                    {product.status === 'sold' ? '✓ SOLD' : product.status.toUpperCase()}
                  </div>
                {/if}
                {#if $authStore.isAuthenticated && $watchlistStore.loaded}
                  <div class="watchlist-btn">
                    <WatchlistToggle productId={product.id} size="sm" />
                  </div>
                {/if}
              </div>

              <div class="product-info">
                <h3>{product.title}</h3>
                <p class="description">{product.description.substring(0, 100)}{product.description.length > 100 ? '...' : ''}</p>

                {#if product.region || product.city}
                  <div class="location-info">
                    <svg class="location-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>{product.city}{product.city && product.region ? ', ' : ''}{product.region}</span>
                  </div>
                {/if}

                {#if product.categories && product.categories.length > 0}
                  <div class="category-tags">
                    {#each product.categories.slice(0, 3) as categoryValue}
                      <span class="category-tag">{$t('categories.' + categoryValue)}</span>
                    {/each}
                    {#if product.categories.length > 3}
                      <span class="category-tag category-overflow">+{product.categories.length - 3}</span>
                    {/if}
                  </div>
                {/if}

                <div class="pricing">
                  {#if product.currentBid}
                    <div class="current-bid-section">
                      <span class="label-small">{data.status === 'ended' && product.status === 'sold' ? $t('products.sold') + ':' : data.status === 'ended' ? $t('products.ended') + ':' : $t('products.currentBid') + ':'}</span>
                      <div class="current-bid-row">
                        <span class="price-large current-bid">{formatPrice(product.currentBid, product.seller.currency)}</span>
                        {#if product.currentBid > product.startingPrice}
                          <span class="percent-increase">+{Math.round(((product.currentBid - product.startingPrice) / product.startingPrice) * 100)}%</span>
                        {/if}
                      </div>
                      <div class="starting-price-row">
                        <span class="label-tiny">{$t('products.starting')}:</span>
                        <span class="price-tiny">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                      </div>
                    </div>
                  {:else}
                    <div>
                      <span class="label-small">{$t('products.startingPrice')}:</span>
                      <span class="price-large">{formatPrice(product.startingPrice, product.seller.currency)}</span>
                    </div>
                  {/if}

                  {#if userBids[product.id]}
                    <div class="user-bid-section">
                      <span class="label-small">{$t('products.yourBid')}:</span>
                      <span class="price-large your-bid">{formatPrice(userBids[product.id], product.seller.currency)}</span>
                    </div>
                  {/if}
                </div>

                <div class="auction-info">
                  <div class="status-row">
                    <span class="status status-{product.status}">{product.status === 'available' ? $t('product.available') : product.status === 'sold' ? $t('product.sold') : product.status === 'ended' ? $t('product.ended') : product.status}</span>
                    {#if $authStore.user && product.seller?.id === $authStore.user.id}
                      <span class="owner-badge">{$t('products.yourListing')}</span>
                    {/if}
                    {#if $authStore.user?.role === 'admin' && data.status !== 'hidden'}
                      <button
                        class="admin-hide-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); openAdminModal(product); }}
                      >
                        {$t('products.hide')}
                      </button>
                    {/if}
                    {#if data.status === 'hidden'}
                      <button
                        class="admin-show-btn"
                        onclick={(e) => { e.preventDefault(); e.stopPropagation(); openAdminModal(product); }}
                      >
                        {$t('products.unhide')}
                      </button>
                    {/if}
                  </div>
                  {#if data.status === 'active' || data.status === 'my-bids'}
                    <div class="countdown-badge countdown-{getUrgencyClass(product.auctionEndDate)}">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>{countdowns[product.id] || $t('common.loading')}</span>
                    </div>
                  {:else}
                    <div class="countdown-badge countdown-ended">
                      <svg class="countdown-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>{$t('products.ended')}</span>
                    </div>
                  {/if}
                </div>
              </div>
            </a>
            </div>
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
              ← {$t('products.prev')}
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
              {$t('products.next')} →
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
  {/if}
</div>

<!-- Admin Hide/Unhide Confirmation Modal -->
{#if adminModalProduct}
  <div class="modal-overlay" onclick={closeAdminModal}>
    <div class="modal-content confirm-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeAdminModal}>&times;</button>

      <div class="modal-header">
        <h2>{adminModalProduct.active ? $t('products.hideProduct') : $t('products.showProduct')}</h2>
      </div>

      <div class="modal-body">
        <p class="modal-product-title">"{adminModalProduct.title}"</p>
        <p class="modal-description">
          {#if adminModalProduct.active}
            This item will be hidden from all users and moved to the <strong>Hidden Items</strong> tab. The seller will not be notified.
          {:else}
            This item will be restored and visible to all users again under <strong>Active Auctions</strong>.
          {/if}
        </p>

        <div class="modal-actions">
          <button class="btn-modal-cancel" onclick={closeAdminModal} disabled={adminModalLoading}>
            {$t('products.cancel')}
          </button>
          <button
            class="btn-modal-confirm {adminModalProduct.active ? 'btn-modal-hide' : 'btn-modal-unhide'}"
            onclick={confirmToggleVisibility}
            disabled={adminModalLoading}
          >
            {#if adminModalLoading}
              <span class="modal-spinner"></span>
              {$t('products.processing')}
            {:else}
              {adminModalProduct.active ? $t('products.hideProduct') : $t('products.showProduct')}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .products-page {
    padding: 1rem 0;
  }

  .page-header {
    margin-bottom: 1.25rem;
  }

  .page-header h2 {
    font-size: 1.25rem;
    margin-bottom: 0.75rem;
  }

  .search-filter-container {
    margin-bottom: 0.75rem;
  }

  .search-container {
    position: relative;
    max-width: 600px;
    margin-bottom: 0.75rem;
  }

  .search-input {
    width: 100%;
    padding: 0.65rem 2.5rem 0.65rem 0.85rem;
    font-size: 0.9rem;
  }

  .location-filters {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
    max-width: 600px;
  }

  .location-select {
    flex: 1;
    min-width: 160px;
    padding: 0.5rem 0.75rem;
    font-size: 0.85rem;
    border: 1px solid var(--color-border);
    transition: border-color 0.2s;
    background-color: var(--color-surface);
    cursor: pointer;
  }

  .location-select:focus {
    outline: none;
    border-color: var(--color-fg);
  }

  .location-select:disabled {
    background-color: var(--color-muted);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .btn-clear-filters {
    padding: 0.5rem 1rem;
    background: transparent;
    color: var(--color-muted-fg);
    border: 1px solid var(--color-border);
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease-out, color 0.15s ease-out;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-clear-filters:hover {
    background: var(--color-surface-hover);
    color: var(--color-fg);
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
    transition: color 0.2s;
  }

  .clear-search:hover {
    color: var(--color-muted-fg);
  }

  .search-results {
    color: var(--color-fg);
    opacity: 0.6;
    font-size: 0.95rem;
    margin: 0;
  }

  .btn-clear-search {
    padding: 0.75rem 1.5rem;
    background: var(--color-fg);
    color: var(--color-bg);
    border: 2px solid var(--color-fg);
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease-out, color 0.15s ease-out;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-clear-search:hover {
    background: var(--color-surface-hover);
    color: var(--color-fg);
  }

  .controls-container {
    margin-top: 0.5rem;
  }

  .items-per-page {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .items-per-page label {
    font-size: 0.8rem;
    color: var(--color-muted-fg);
    font-weight: 500;
  }

  .items-per-page select {
    padding: 0.35rem 2rem 0.35rem 0.5rem;
    font-size: 0.8rem;
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 1.25rem;
    cursor: pointer;
    transition: border-color 0.2s;
    appearance: none;
  }

  .items-per-page select:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .items-per-page select:focus {
    outline: none;
    border-color: var(--color-fg);
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
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-weight: 600;
    position: relative;
    font-size: 1rem;
    color: var(--color-muted-fg);
    cursor: pointer;
    transition: background-color 0.15s ease-out,
                border-color 0.15s ease-out,
                color 0.15s ease-out;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .tab:hover:not(.active) {
    background: var(--color-surface-hover);
    color: var(--color-fg);
    border-color: rgba(255, 255, 255, 0.15);
  }

  .tab:active {
    transition-duration: 0.05s;
  }

  .tab.active {
    background: var(--color-fg);
    border-color: var(--color-fg);
    border-bottom: 2px solid var(--color-border);
    color: var(--color-bg);
  }


  .tab-badge {
    background: rgba(255, 255, 255, 0.3);
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 700;
  }

  .tab.active .tab-badge {
    background: rgba(0, 0, 0, 0.2);
    color: var(--color-bg);
  }

  .auction-section {
    margin-bottom: 3rem;
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
    color: var(--color-muted-fg);
    margin-bottom: 0.5rem;
  }

  .empty-state a {
    color: var(--color-blue);
    font-weight: bold;
  }

  .products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 2rem;
  }

  /* CSS-only glow on hover — replaces heavy JS GlowingEffect */
  .products-grid > .glow-card {
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
    display: flex;
    flex-direction: column;
  }
  .products-grid > .glow-card > .product-card {
    flex: 1;
  }
  @media (hover: hover) {
    .products-grid > .glow-card:hover {
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.08), 0 0 40px rgba(59, 130, 246, 0.05);
    }
  }

  /* Staggered card entrance animation */
  .products-grid > .glow-card,
  .products-grid .product-card:not(.skeleton-card) {
    animation: cardEnter 0.15s ease-out both;
  }

  .products-grid > .glow-card:nth-child(1) { animation-delay: 0ms; }
  .products-grid > .glow-card:nth-child(2) { animation-delay: 40ms; }
  .products-grid > .glow-card:nth-child(3) { animation-delay: 80ms; }
  .products-grid > .glow-card:nth-child(4) { animation-delay: 120ms; }
  .products-grid > .glow-card:nth-child(5) { animation-delay: 160ms; }
  .products-grid > .glow-card:nth-child(6) { animation-delay: 200ms; }
  .products-grid > .glow-card:nth-child(n+7) { animation-delay: 240ms; }

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

  .product-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    transition: background-color 0.15s ease-out,
                border-color 0.15s ease-out;
    text-decoration: none;
    color: inherit;
    display: flex;
    flex-direction: column;
  }

  .product-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .product-card:active {
    background-color: var(--color-muted);
    transition-duration: 0.05s;
  }

  .product-image {
    position: relative;
    width: 100%;
    height: 200px;
    aspect-ratio: 2 / 1;
    overflow: hidden;
    background-color: var(--color-muted);
  }

  .product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.15s ease-out;
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
    color: var(--color-muted-fg);
    font-size: 1.2rem;
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

  .product-info h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.25rem;
  }

  .description {
    color: var(--color-muted-fg);
    margin-bottom: 0.75rem;
    flex: 1;
  }

  .location-info {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
    color: var(--color-muted-fg);
    margin-bottom: 0.75rem;
    padding: 0.375rem 0.5rem;
    background-color: var(--color-muted);
    width: fit-content;
  }

  .location-icon {
    color: var(--color-muted-fg);
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
    background: rgba(59, 130, 246, 0.12);
    color: #8b93e0;
    padding: 0.2rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 700;
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: var(--radius-sm);
    white-space: nowrap;
  }

  .category-tag.category-overflow {
    background: transparent;
    color: var(--color-muted-fg);
  }

  .pricing {
    margin-bottom: 1rem;
  }

  .pricing > div {
    margin-bottom: 0.5rem;
  }

  .current-bid-section {
    margin-bottom: 0.75rem;
  }

  .current-bid-row {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .starting-price-row {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    margin-top: 0.15rem;
    opacity: 0.6;
    font-size: 0.75rem;
  }

  .user-bid-section {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(59, 130, 246, 0.08);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: var(--radius-sm);
    margin-top: 0.5rem;
  }

  .label {
    color: var(--color-muted-fg);
    font-size: 0.9rem;
  }

  .label-small {
    color: var(--color-muted-fg);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }

  .label-tiny {
    color: var(--color-muted-fg);
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
    color: var(--color-muted-fg);
  }

  .current-bid {
    color: var(--color-blue);
  }

  .your-bid {
    color: var(--color-blue);
  }

  .percent-increase {
    font-size: 0.7rem;
    font-weight: 700;
    color: #22c55e;
    opacity: 0.85;
    letter-spacing: 0.02em;
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
    background: rgba(59, 130, 246, 0.15);
    color: #8b93e0;
    letter-spacing: 0.5px;
  }


  .admin-hide-btn,
  .admin-show-btn {
    padding: 0.2rem 0.5rem;
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    border: none;
    cursor: pointer;
    letter-spacing: 0.3px;
    background: transparent;
    transition: color 0.15s ease-out, opacity 0.15s ease-out;
    opacity: 0.5;
  }

  .admin-hide-btn:hover,
  .admin-show-btn:hover {
    opacity: 1;
  }

  .admin-hide-btn {
    color: #ef4444;
  }

  .admin-show-btn {
    color: #22c55e;
  }

  .tab-admin {
    color: #dc3545;
  }

  .tab-admin.active {
    border-color: #dc3545;
    color: #dc3545;
  }

  /* Admin Confirmation Modal */
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
    animation: overlayFadeIn 0.15s ease-out;
    padding: 1rem;
    backdrop-filter: blur(2px);
  }

  @keyframes overlayFadeIn {
    from { opacity: 0; backdrop-filter: blur(0); }
    to { opacity: 1; backdrop-filter: blur(2px); }
  }

  .modal-content {
    background-color: var(--color-surface);
    max-width: 460px;
    width: 90%;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    position: relative;
    animation: modalSlideUp 0.15s ease-out;
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
    border: 2px solid var(--color-border);
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
    transition: background-color 0.15s ease-out, opacity 0.15s ease-out, color 0.15s ease-out;
  }

  .modal-close:hover {
    background-color: var(--color-fg);
    color: var(--color-bg);
    opacity: 1;
  }

  .modal-close:active {
    transition-duration: 0.05s;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-fg);
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-product-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-fg);
    margin-bottom: 0.75rem;
  }

  .modal-description {
    font-size: 0.95rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
  }

  .btn-modal-cancel,
  .btn-modal-confirm {
    flex: 1;
    padding: 0.85rem 1.5rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.15s ease-out, color 0.15s ease-out;
    border: 2px solid var(--color-border);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-modal-cancel {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-modal-cancel:hover {
    background-color: var(--color-border);
  }

  .btn-modal-hide {
    background: #dc3545;
    color: white;
  }

  .btn-modal-hide:hover {
    background: var(--color-surface-hover);
    color: #dc3545;
    border-color: #dc3545;
  }

  .btn-modal-unhide {
    background: #198754;
    color: white;
  }

  .btn-modal-unhide:hover {
    background: var(--color-surface-hover);
    color: #198754;
    border-color: #198754;
  }

  .btn-modal-confirm:disabled,
  .btn-modal-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .modal-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: modalSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  @keyframes modalSpin {
    to { transform: rotate(360deg); }
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
    background: var(--color-red);
    color: white;
  }

  .status-cancelled {
    background-color: #9ca3af;
    color: white;
  }





  .countdown-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    border-radius: 2px;
    transition: all 0.15s ease-out;
    white-space: nowrap;
  }

  .countdown-icon {
    flex-shrink: 0;
    width: 13px;
    height: 13px;
  }

  /* Normal - More than 24 hours */
  .countdown-normal {
    background: rgba(59, 130, 246, 0.1);
    color: var(--color-blue);
  }

  /* Warning - Less than 24 hours */
  .countdown-warning {
    background: rgba(234, 179, 8, 0.1);
    color: #eab308;
  }

  /* Urgent - Less than 12 hours */
  .countdown-urgent {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  /* Critical - Less than 3 hours */
  .countdown-critical {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    animation: pulse-critical 1s ease-in-out infinite;
  }

  /* Ended */
  .countdown-ended {
    background: rgba(107, 114, 128, 0.1);
    color: #6b7280;
  }

  @keyframes pulse-critical {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
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
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease-out,
                color 0.15s ease-out;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: var(--radius-sm);
  }

  .pagination-btn:hover:not(:disabled) {
    background-color: var(--color-fg);
    color: var(--color-bg);
  }

  .pagination-btn:active:not(:disabled) {
    transition-duration: 0.05s;
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
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-muted-fg);
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s ease-out,
                border-color 0.15s ease-out,
                color 0.15s ease-out;
    border-radius: var(--radius-sm);
  }

  .pagination-number:hover:not(.active) {
    border-color: rgba(255, 255, 255, 0.2);
    background-color: var(--color-surface-hover);
    color: var(--color-fg);
  }

  .pagination-number:active {
    transition-duration: 0.05s;
  }

  .pagination-number.active {
    background-color: var(--color-fg);
    border-color: var(--color-fg);
    color: var(--color-bg);
  }

  .new-products-banner {
    width: 100%;
    padding: 0.75rem 1.5rem;
    background: var(--color-fg);
    color: var(--color-bg);
    border: 2px solid var(--color-fg);
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
    text-align: center;
    margin-bottom: 1rem;
    transition: background-color 0.15s ease-out, color 0.15s ease-out;
    animation: bannerSlideDown 0.15s ease-out;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .new-products-banner:hover {
    background: white;
    color: var(--color-fg);
  }

  .new-products-banner:active {
    transition-duration: 0.05s;
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

  /* ===== Tablet Responsive ===== */
  @media (max-width: 900px) {
    .tabs-container {
      gap: 0.25rem;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
    }

    .tabs-container::-webkit-scrollbar {
      display: none;
    }

    .tab {
      flex: 0 0 auto;
      padding: 0.625rem 0.875rem;
      font-size: 0.85rem;
    }
  }

  /* ===== Mobile Responsive ===== */
  @media (max-width: 768px) {
    .products-page {
      padding: 1rem 0;
    }

    h1 {
      font-size: 1.75rem;
      margin-bottom: 1rem;
    }

    h2 {
      font-size: 1.5rem;
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

    .btn-clear-filters {
      width: 100%;
      padding: 0.625rem 1rem;
      font-size: 0.9rem;
    }

    /* Tabs */
    .tabs-container {
      gap: 0.25rem;
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

    .tab-badge {
      font-size: 0.65rem;
      padding: 0.1rem 0.375rem;
    }

    /* Products grid - single column on mobile for cleaner look */
    .products-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
      padding: 0;
    }

    .product-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
    }

    .product-image {
      height: 200px;
    }

    .product-info {
      padding: 1rem;
    }

    .product-info h3 {
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
      padding: 0.3rem 0.5rem;
      font-size: 0.7rem;
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

    /* Empty state */
    .empty-state {
      padding: 2rem 1rem;
    }

    .empty-state p {
      font-size: 1rem;
    }

    /* Items per page */
    .items-per-page {
      gap: 0.5rem;
    }

    .items-per-page label {
      font-size: 0.85rem;
    }

    .items-per-page select {
      padding: 0.375rem 2rem 0.375rem 0.5rem;
      font-size: 0.85rem;
    }

    .new-products-banner {
      font-size: 0.85rem;
      padding: 0.625rem 1rem;
    }
  }

  @media (max-width: 480px) {
    h2 {
      font-size: 1.25rem;
    }

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
  }

  /* Skeleton loading */
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
  }

  .skeleton-timer {
    width: 7rem;
  }

  @keyframes skeleton-shimmer {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (max-width: 768px) {
    .skeleton-card .product-image {
      height: 200px;
    }
  }

  @media (max-width: 480px) {
    .skeleton-card .product-image {
      height: 170px;
    }
  }

  /* Search type toggle */
  .search-type-toggle {
    display: flex;
    gap: 0;
    margin-bottom: 0.5rem;
    max-width: 240px;
  }

  .search-type-btn {
    flex: 1;
    padding: 0.4rem 0.75rem;
    font-weight: 700;
    font-size: 0.75rem;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-muted-fg);
    cursor: pointer;
    transition: background-color 0.15s ease-out,
                color 0.15s ease-out,
                border-color 0.15s ease-out;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-radius: var(--radius-md);
  }

  .search-type-btn:first-child {
    border-right: 1px solid var(--color-border);
  }

  .search-type-btn:last-child {
    border-left: 1px solid var(--color-border);
  }

  .search-type-btn.active {
    background: var(--color-fg);
    border-color: var(--color-fg);
    color: var(--color-bg);
  }


  .search-type-btn:hover:not(.active) {
    background: var(--color-muted);
  }

  /* User cards */
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
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    text-decoration: none;
    color: inherit;
    transition: border-color 0.15s ease-out,
                background-color 0.15s ease-out;
  }

  .user-card:hover {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .user-card:active {
    background-color: var(--color-muted);
    transition-duration: 0.05s;
  }

  .user-card-avatar {
    width: 56px;
    height: 56px;
    flex-shrink: 0;
    background: var(--color-muted);
    border: 2px solid var(--color-border);
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
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 2px solid var(--color-border);
  }

  .role-seller {
    background: var(--color-red);
    color: white;
  }

  .role-buyer {
    background: var(--color-blue);
    color: white;
  }

  .user-card-meta {
    flex-shrink: 0;
    text-align: right;
  }

  .user-card-date {
    font-size: 0.8rem;
    color: var(--color-muted-fg);
    white-space: nowrap;
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

  @media (max-width: 768px) {
    .search-type-toggle {
      max-width: 100%;
    }

    .search-type-btn {
      padding: 0.5rem 0.75rem;
      font-size: 0.85rem;
    }

    .users-grid {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .user-card {
      padding: 1rem;
    }

    .user-card:hover {
      border-color: rgba(255, 255, 255, 0.15);
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

  /* ── Dark mode: fix hardcoded light-mode colors ── */



</style>