<script lang="ts">
  import { placeBid, fetchProductBids, updateProduct, checkProductStatus, fetchProduct } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import type { Product } from '$lib/api';

  export let data: PageData;
  export let params: any = undefined; // SvelteKit passes this automatically

  // Dynamic back link based on 'from' parameter
  $: backLink = (() => {
    const from = $page.url.searchParams.get('from');
    switch (from) {
      case 'inbox':
        // When going back to inbox, include the product parameter so the conversation is selected
        return `/inbox?product=${data.product?.id || ''}`;
      case 'browse':
        return '/products';
      default:
        return '/products';
    }
  })();

  $: backLinkText = (() => {
    const from = $page.url.searchParams.get('from');
    switch (from) {
      case 'inbox':
        return 'Back to Inbox';
      case 'browse':
        return 'Back to Products';
      default:
        return 'Back to Products';
    }
  })();

  let bidAmount = 0;

  $: bidInterval = data.product?.bidInterval || 1;
  $: minBid = (data.product?.currentBid || data.product?.startingPrice || 0) + bidInterval;

  // Update bidAmount when minBid changes
  $: if (minBid && bidAmount === 0) {
    bidAmount = minBid;
  }
  let bidding = false;
  let bidError = '';
  let bidSuccess = false;
  let showLoginModal = false;
  let showConfirmBidModal = false;
  let showEditModal = false;
  let showAcceptBidModal = false;
  let bidSectionOpen = false;
  let censorMyName = false;
  let accepting = false;
  let acceptError = '';
  let acceptSuccess = false;

  // Sort bids by amount (highest to lowest)
  $: sortedBids = [...data.bids].sort((a, b) => b.amount - a.amount);

  // Calculate percentage increase from starting price
  $: percentageIncrease = data.product?.currentBid && data.product?.startingPrice
    ? ((data.product.currentBid - data.product.startingPrice) / data.product.startingPrice * 100).toFixed(1)
    : '0.0';

  // Countdown timer
  let timeRemaining = '';
  let countdownInterval: ReturnType<typeof setInterval> | null = null;

  // Check if auction has ended by time (not just status)
  $: hasAuctionEnded = data.product?.auctionEndDate
    ? new Date().getTime() > new Date(data.product.auctionEndDate).getTime()
    : false;

  // Real-time update with polling
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let lastKnownState = {
    updatedAt: data.product?.updatedAt || '',
    latestBidTime: '',
    bidCount: data.bids.length,
    status: data.product?.status || 'active',
    currentBid: data.product?.currentBid
  };
  let isUpdating = false;
  let connectionStatus: 'connected' | 'disconnected' = 'connected';

  // Animation tracking
  let previousBids: any[] = [...data.bids];
  let newBidIds = new Set<string>();
  let priceChanged = false;
  let showConfetti = false;
  let animatingBidId: string | null = null;

  // Prepare chart data - bids sorted by time (oldest first)
  $: chartData = [...data.bids]
    .sort((a, b) => new Date(a.bidTime).getTime() - new Date(b.bidTime).getTime())
    .map((bid, index) => ({
      time: new Date(bid.bidTime),
      price: bid.amount,
      index
    }));

  // Calculate chart dimensions and scales
  $: if (chartData.length > 0) {
    const minPrice = data.product?.startingPrice || Math.min(...chartData.map(d => d.price));
    const maxPrice = Math.max(...chartData.map(d => d.price));
    const priceRange = maxPrice - minPrice || 1;

    chartData.forEach((d: any) => {
      d.x = (d.index / Math.max(chartData.length - 1, 1)) * 100;
      d.y = 100 - ((d.price - minPrice) / priceRange) * 100;
    });
  }

  async function updateCountdown() {
    if (!data.product?.auctionEndDate) return;

    const now = new Date().getTime();
    const end = new Date(data.product.auctionEndDate).getTime();
    const distance = end - now;

    if (distance < 0) {
      timeRemaining = 'Auction Ended';
      if (countdownInterval) clearInterval(countdownInterval);

      // Auto-close auction if it's still active and time has ended
      if ((data.product.status === 'active' || data.product.status === 'available') && isOwner && highestBid) {
        // Automatically mark as sold if there's a winning bid
        try {
          await updateProduct(data.product.id, { status: 'sold' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      } else if ((data.product.status === 'active' || data.product.status === 'available') && isOwner && !highestBid) {
        // Mark as ended if no bids
        try {
          await updateProduct(data.product.id, { status: 'ended' });
          window.location.reload();
        } catch (error) {
          console.error('Error auto-closing auction:', error);
        }
      }

      return;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    if (days > 0) {
      timeRemaining = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    } else if (hours > 0) {
      timeRemaining = `${hours}h ${minutes}m ${seconds}s`;
    } else {
      timeRemaining = `${minutes}m ${seconds}s`;
    }
  }

  $: if (data.product?.auctionEndDate) {
    updateCountdown();
    if (!countdownInterval) {
      countdownInterval = setInterval(updateCountdown, 1000);
    }
  }

  import { onMount, onDestroy } from 'svelte';

  // Function to check for updates and refresh data if needed
  async function checkForUpdates() {
    if (!data.product || isUpdating) return;

    try {
      const status = await checkProductStatus(data.product.id);

      if (!status) return;

      // Check if anything changed
      const hasProductUpdate = status.updatedAt !== lastKnownState.updatedAt;
      const hasBidUpdate = status.latestBidTime !== lastKnownState.latestBidTime;
      const hasBidCountUpdate = status.bidCount !== lastKnownState.bidCount;
      const hasStatusUpdate = status.status !== lastKnownState.status;
      const hasPriceUpdate = status.currentBid !== lastKnownState.currentBid;

      if (hasProductUpdate || hasBidUpdate || hasBidCountUpdate || hasStatusUpdate || hasPriceUpdate) {
        isUpdating = true;

        // Fetch updated product data
        if (hasProductUpdate || hasStatusUpdate || hasPriceUpdate) {
          const updatedProduct = await fetchProduct(data.product.id);
          if (updatedProduct) {
            data.product = updatedProduct;
          }
        }

        // Fetch updated bids and detect changes
        if (hasBidUpdate || hasBidCountUpdate) {
          const updatedBids = await fetchProductBids(data.product.id);

          // Identify new bids for animation
          const previousBidIds = new Set(previousBids.map(b => b.id));
          newBidIds = new Set(
            updatedBids
              .filter(b => !previousBidIds.has(b.id))
              .map(b => b.id)
          );

          // Store previous bids
          previousBids = [...updatedBids];

          data.bids = updatedBids;

          // Trigger animations for new bids
          if (newBidIds.size > 0) {
            setTimeout(() => {
              newBidIds = new Set();
            }, 3000);
          }
        }

        // Detect price change and trigger confetti
        if (hasPriceUpdate) {
          priceChanged = true;
          showConfetti = true;

          setTimeout(() => {
            priceChanged = false;
          }, 1000);

          setTimeout(() => {
            showConfetti = false;
          }, 3000);
        }

        // Update last known state
        lastKnownState = {
          updatedAt: status.updatedAt,
          latestBidTime: status.latestBidTime || '',
          bidCount: status.bidCount,
          status: status.status,
          currentBid: status.currentBid
        };

        // Save to localStorage
        if (data.product) {
          localStorage.setItem(`product_${data.product.id}_state`, JSON.stringify(lastKnownState));
        }

        // Trigger reactivity
        data = { ...data };

        isUpdating = false;
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      isUpdating = false;
    }
  }

  // Force immediate update check (useful after placing a bid)
  async function forceUpdateCheck() {
    await checkForUpdates();
  }


  onMount(() => {
    // Load last known state from localStorage if available
    const savedState = localStorage.getItem(`product_${data.product?.id}_state`);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        lastKnownState = parsed;
      } catch (e) {
        console.error('Error parsing saved state:', e);
      }
    }

    // Polling every 3 seconds for real-time updates
    pollingInterval = setInterval(() => {
      checkForUpdates();
    }, 3000);

    // Initial check
    checkForUpdates();

    // Handle visibility change - stop polling when tab is not visible
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, stop all intervals to save resources
        if (pollingInterval) {
          clearInterval(pollingInterval);
          pollingInterval = null;
        }
        if (countdownInterval) {
          clearInterval(countdownInterval);
          countdownInterval = null;
        }
      } else {
        // Tab is visible again, restart intervals
        if (!pollingInterval) {
          pollingInterval = setInterval(() => {
            checkForUpdates();
          }, 3000);
          checkForUpdates(); // Immediate update when returning
        }
        if (!countdownInterval && data.product?.auctionEndDate) {
          updateCountdown(); // Immediate update
          countdownInterval = setInterval(updateCountdown, 1000);
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
    if (pollingInterval) clearInterval(pollingInterval);
  });

  function formatPrice(price: number, currency: string = 'PHP'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  }

  // Get the seller's currency for this product
  $: sellerCurrency = data.product?.seller?.currency || 'PHP';

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function incrementBid() {
    bidAmount = bidAmount + bidInterval;
  }

  function decrementBid() {
    const newAmount = bidAmount - bidInterval;
    if (newAmount >= minBid) {
      bidAmount = newAmount;
    }
  }

  function validateBidAmount() {
    if (!bidAmount || bidAmount < minBid) {
      bidAmount = minBid;
      bidError = `Bid amount adjusted to minimum: ${formatPrice(minBid, sellerCurrency)}`;
      setTimeout(() => bidError = '', 3000);
      return;
    }

    // Check if bid is divisible by interval
    const currentHighest = data.product?.currentBid || data.product?.startingPrice || 0;
    const difference = bidAmount - currentHighest;

    if (difference % bidInterval !== 0) {
      // Round up to the nearest valid increment
      const remainder = difference % bidInterval;
      const adjustment = bidInterval - remainder;
      bidAmount = bidAmount + adjustment;
      bidError = `Bid amount must be in increments of ${formatPrice(bidInterval, sellerCurrency)}. Adjusted to ${formatPrice(bidAmount, sellerCurrency)}`;
      setTimeout(() => bidError = '', 3000);
    }
  }

  function handlePlaceBid() {
    if (!data.product) return;

    // Check if user is logged in
    if (!$authStore.isAuthenticated) {
      showLoginModal = true;
      return;
    }

    // Validate bid amount
    const currentHighest = data.product.currentBid || data.product.startingPrice;
    const minimumBid = currentHighest + bidInterval;

    if (bidAmount < minimumBid) {
      bidError = `Your bid must be at least ${formatPrice(minimumBid, sellerCurrency)} (current highest: ${formatPrice(currentHighest, sellerCurrency)})`;
      return;
    }

    // Show confirmation modal
    bidError = '';
    showConfirmBidModal = true;
  }

  async function confirmPlaceBid() {
    if (!data.product) return;

    showConfirmBidModal = false;
    bidding = true;
    bidError = '';
    bidSuccess = false;

    try {
      const result = await placeBid(data.product.id, bidAmount, censorMyName);

      if (result) {
        bidSuccess = true;
        bidError = '';

        // Trigger price animation immediately
        priceChanged = true;
        showConfetti = true;

        // Reload bids
        const updatedBids = await fetchProductBids(data.product.id);

        // Mark the new bid for animation
        const previousBidIds = new Set(data.bids.map(b => b.id));
        newBidIds = new Set(
          updatedBids
            .filter(b => !previousBidIds.has(b.id))
            .map(b => b.id)
        );

        data.bids = updatedBids;

        // Update product current bid
        if (data.product) {
          data.product.currentBid = bidAmount;
        }
        // Reset bid amount to new minimum
        bidAmount = bidAmount + bidInterval;

        // Clear animations after delay
        setTimeout(() => {
          priceChanged = false;
        }, 1000);

        setTimeout(() => {
          showConfetti = false;
        }, 3000);

        setTimeout(() => {
          newBidIds = new Set();
        }, 3000);

        // Force immediate update check to get latest data
        setTimeout(() => {
          forceUpdateCheck();
        }, 500);

        // Auto-close success message after 5 seconds
        setTimeout(() => {
          bidSuccess = false;
        }, 5000);
      } else {
        bidError = 'Failed to place bid. Please try again.';
      }
    } catch (error) {
      console.error('Error in confirmPlaceBid:', error);
      bidError = 'An error occurred while placing your bid.';
    } finally {
      bidding = false;
    }
  }

  function cancelBid() {
    showConfirmBidModal = false;
    censorMyName = false;
  }

  function closeSuccessAlert() {
    bidSuccess = false;
  }

  // Function to censor a name (show first letter + asterisks)
  function censorName(name: string): string {
    return name
      .split(' ')
      .map(word => {
        if (word.length === 0) return '';
        const firstLetter = word.charAt(0).toUpperCase();
        const asterisks = '*'.repeat(word.length - 1);
        return firstLetter + asterisks;
      })
      .join(' ');
  }

  // Get display name for a bidder
  function getBidderName(bid: any): string {
    const bidderName = typeof bid.bidder === 'object' ? bid.bidder.name : 'Anonymous';
    return bid.censorName ? censorName(bidderName) : bidderName;
  }

  function closeModal() {
    showLoginModal = false;
  }

  // Check if current user is the seller
  $: isOwner = $authStore.user?.id && data.product?.seller?.id &&
               $authStore.user.id === data.product.seller.id;

  // Get highest bid
  $: highestBid = sortedBids.length > 0 ? sortedBids[0] : null;

  // Check if current user is the highest bidder
  $: isHighestBidder = $authStore.user?.id && highestBid &&
                       (typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder) === $authStore.user.id;

  function openEditModal() {
    if (!data.product) return;
    showEditModal = true;
  }

  function closeEditModal() {
    showEditModal = false;
  }

  function handleEditSuccess(updatedProduct: Product) {
    // Update the product data directly without page reload
    if (data.product) {
      data.product = {
        ...updatedProduct,
        // Preserve seller info
        seller: data.product.seller
      };

      // Update min bid if needed
      minBid = (data.product.currentBid || data.product.startingPrice || 0) + bidInterval;
      if (bidAmount < minBid) {
        bidAmount = minBid;
      }
    }

    setTimeout(() => {
      closeEditModal();
    }, 1500);
  }

  function openAcceptBidModal() {
    showAcceptBidModal = true;
    acceptError = '';
    acceptSuccess = false;
  }

  function closeAcceptBidModal() {
    showAcceptBidModal = false;
  }

  async function confirmAcceptBid() {
    if (!data.product || !highestBid) return;

    accepting = true;
    acceptError = '';
    acceptSuccess = false;

    try {
      // Update product status to 'sold'
      const result = await updateProduct(data.product.id, {
        status: 'sold'
      });

      if (result) {
        acceptSuccess = true;
        setTimeout(() => {
          // Refresh the page to show updated status
          window.location.reload();
        }, 1500);
      } else {
        console.error('Failed to accept bid - no result returned');
        acceptError = 'Failed to accept bid. Please try again.';
      }
    } catch (error) {
      console.error('Error accepting bid:', error);
      acceptError = 'An error occurred while accepting the bid: ' + (error instanceof Error ? error.message : String(error));
    } finally {
      accepting = false;
    }
  }

</script>

<svelte:head>
  <title>{data.product?.title || 'Product'} - BidMo.to</title>

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content={`https://bidmo.to/products/${data.product?.id || ''}`} />
  <meta property="og:title" content={data.product?.title || 'Product'} />
  <meta property="og:description" content={data.product?.description || 'Check out this product on BidMo.to'} />
  {#if data.product?.images && data.product.images.length > 0 && data.product.images[0].image}
    <meta property="og:image" content={data.product.images[0].image.url} />
  {/if}

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content={`https://bidmo.to/products/${data.product?.id || ''}`} />
  <meta property="twitter:title" content={data.product?.title || 'Product'} />
  <meta property="twitter:description" content={data.product?.description || 'Check out this product on BidMo.to'} />
  {#if data.product?.images && data.product.images.length > 0 && data.product.images[0].image}
    <meta property="twitter:image" content={data.product.images[0].image.url} />
  {/if}
</svelte:head>

{#if !data.product}
  <div class="error">
    <h1>Product Not Found</h1>
    <p>The product you're looking for doesn't exist.</p>
    <a href={backLink}>{backLinkText}</a>
  </div>
{:else}
  <div class="product-detail">
    <div class="product-header">
      <a href={backLink} class="back-link">&larr; {backLinkText}</a>
      {#if isOwner}
        <button class="edit-product-btn" on:click={openEditModal}>
          ✏️ Edit Product
        </button>
      {/if}
    </div>

    <div class="product-content">
      <div class="product-gallery">
        <div class="title-container">
          <h1>{data.product.title}</h1>
          <div
            class="live-indicator"
            class:updating={isUpdating}
            class:connected={connectionStatus === 'connected'}
            title="Real-time updates active (polling every 3 seconds)"
          >
            <span class="live-dot"></span>
            <span class="live-text">LIVE</span>
          </div>
        </div>

        <div class="status-badge status-{data.product.status}">
          {data.product.status}
        </div>

        <ImageSlider images={data.product.images || []} productTitle={data.product.title} />

        <div class="description-section">
          <h3>Description</h3>
          <p>{data.product.description}</p>
        </div>

        <!-- Price Analytics Graph -->
        {#if sortedBids.length > 0 && chartData.length > 0}
          <div class="price-analytics">
            <h3>📊 Price Analytics Over Time</h3>
            <div class="chart-container">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="price-chart">
                <!-- Gradient definition -->
                <defs>
                  <linearGradient id="price-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#dc2626;stop-opacity:0.5" />
                    <stop offset="100%" style="stop-color:#dc2626;stop-opacity:0" />
                  </linearGradient>
                </defs>

                <!-- Grid lines -->
                <line x1="0" y1="0" x2="100" y2="0" class="grid-line" />
                <line x1="0" y1="25" x2="100" y2="25" class="grid-line" />
                <line x1="0" y1="50" x2="100" y2="50" class="grid-line" />
                <line x1="0" y1="75" x2="100" y2="75" class="grid-line" />
                <line x1="0" y1="100" x2="100" y2="100" class="grid-line" />

                <!-- Area under the line -->
                <path
                  d="M 0,100 {chartData.map(d => `L ${d.x},${d.y}`).join(' ')} L 100,100 Z"
                  class="price-area"
                />

                <!-- Price line -->
                <polyline
                  points={chartData.map(d => `${d.x},${d.y}`).join(' ')}
                  class="price-line"
                />

                <!-- Data points -->
                {#each chartData as point, i}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="1.5"
                    class="data-point"
                    class:first-point={i === 0}
                    class:last-point={i === chartData.length - 1}
                  />
                {/each}
              </svg>

              <div class="chart-labels">
                <div class="label-left">
                  <div class="label-title">Starting</div>
                  <div class="label-value">{formatPrice(data.product?.startingPrice || chartData[0]?.price || 0, sellerCurrency)}</div>
                </div>
                <div class="label-center">
                  <div class="label-title">{chartData.length} Bid{chartData.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="label-right">
                  <div class="label-title">Current</div>
                  <div class="label-value">{formatPrice(chartData[chartData.length - 1]?.price || 0, sellerCurrency)}</div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <div class="seller-info">
          <h3>Seller Information</h3>
          <p><strong>Name:</strong> {data.product.seller?.name || 'Unknown'}</p>
        </div>
      </div>

      <div class="product-details">
        {#if !data.product.active}
          <div class="inactive-warning">
            <span class="warning-icon">⚠️</span>
            <span>This product is currently inactive and hidden from Browse Products</span>
          </div>
        {/if}

        {#if !isOwner && (!hasAuctionEnded || data.product.status === 'sold')}
          <div class="price-info" class:sold-info={data.product.status === 'sold'}>
            {#if showConfetti}
              <div class="confetti-container">
                {#each Array(50) as _, i}
                  <div class="confetti" style="--delay: {i * 0.02}s; --x: {Math.random() * 100}%; --rotation: {Math.random() * 360}deg; --color: {['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff6348', '#1dd1a1'][i % 6]}"></div>
                {/each}
              </div>
            {/if}

            {#if (data.product.status === 'active' || data.product.status === 'available') && data.product.status !== 'sold' && !hasAuctionEnded}
              <div class="countdown-timer-badge">
                <span class="countdown-label">Ends in:</span>
                <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
              </div>
            {/if}

            {#if data.product.status === 'sold'}
              <div class="highest-bid-container">
                <div class="sold-badge">✓ SOLD</div>
                <div class="bid-with-percentage">
                  <div class="highest-bid-amount" class:price-animate={priceChanged}>{formatPrice(data.product.currentBid || data.product.startingPrice, sellerCurrency)}</div>
                  {#if data.product.currentBid && data.product.currentBid > data.product.startingPrice}
                    <div class="percentage-increase">
                      <svg class="arrow-up-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="percentage-text">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                {#if highestBid}
                  <div class="sold-to-info">Sold to: {getBidderName(highestBid)}</div>
                {/if}
                <div class="starting-price-small">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {:else if data.product.currentBid && !hasAuctionEnded && data.product.status !== 'ended'}
              <div class="highest-bid-container">
                <div class="highest-bid-header">
                  <div class="highest-bid-label" class:label-pulse={priceChanged}>CURRENT HIGHEST BID</div>
                </div>
                <div class="bid-with-percentage">
                  <div class="highest-bid-amount" class:price-animate={priceChanged}>{formatPrice(data.product.currentBid, sellerCurrency)}</div>
                  {#if data.product.currentBid && data.product.currentBid > data.product.startingPrice}
                    <div class="percentage-increase">
                      <svg class="arrow-up-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="percentage-text">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="starting-price-small">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {:else if !hasAuctionEnded && data.product.status !== 'ended'}
              <div class="highest-bid-container">
                <div class="highest-bid-header">
                  <div class="highest-bid-label">STARTING BID</div>
                </div>
                <div class="highest-bid-amount">{formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                <div class="starting-price-small">No bids yet - be the first!</div>
              </div>
            {/if}
          </div>
        {/if}

        {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
          {#if isOwner}
            <!-- Owner view - Accept Bid section -->
            <div class="bid-section owner-section">
              <div class="bid-section-header">
                <h3>Your Listing</h3>
                <div class="countdown-timer-inline">
                  <span class="countdown-label">Ends in:</span>
                  <span class="countdown-time">{timeRemaining || 'Loading...'}</span>
                </div>
              </div>

              {#if highestBid}
                <div class="highest-bid-info">
                  <p class="info-text">Current Highest Bid:</p>
                  <p class="bid-amount-large">{formatPrice(highestBid.amount, sellerCurrency)}</p>
                  <p class="bidder-info">by {getBidderName(highestBid)}</p>
                </div>

                <button class="accept-bid-btn" on:click={openAcceptBidModal}>
                  ✓ Accept Bid & Close Auction
                </button>
              {:else}
                <div class="info-message">
                  <p>No bids yet. Waiting for bidders...</p>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Bidder view - Place Bid section -->
            <div class="bid-section">
              <div class="bid-section-header">
                <h3>Place Your Bid</h3>
              </div>

              {#if !$authStore.isAuthenticated}
                <div class="info-message">
                  <p>🔒 You must be logged in to place a bid</p>
                </div>
              {/if}

              {#if bidError}
                <div class="error-message">
                  {bidError}
                </div>
              {/if}

              <div class="bid-form">
                <div class="bid-input-group">
                  <label>Your Bid Amount</label>
                  <div class="bid-row">
                    <div class="bid-control">
                      <button
                        class="bid-arrow-btn"
                        on:click={decrementBid}
                        disabled={bidding || bidAmount <= minBid}
                        type="button"
                        aria-label="Decrease bid"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                      <input
                        type="number"
                        class="bid-amount-input"
                        bind:value={bidAmount}
                        on:blur={validateBidAmount}
                        min={minBid}
                        step={bidInterval}
                        disabled={bidding}
                      />
                      <button
                        class="bid-arrow-btn"
                        on:click={incrementBid}
                        disabled={bidding}
                        type="button"
                        aria-label="Increase bid"
                      >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="18 15 12 9 6 15"></polyline>
                        </svg>
                      </button>
                    </div>
                    <button class="place-bid-btn" on:click={handlePlaceBid} disabled={bidding}>
                      {bidding ? 'Placing Bid...' : 'Place Bid'}
                    </button>
                  </div>
                  <p class="bid-hint">
                    Minimum bid: {formatPrice(minBid, sellerCurrency)} • Increment: {formatPrice(bidInterval, sellerCurrency)}
                  </p>
                </div>
              </div>
            </div>
          {/if}
        {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
          <!-- Auction has ended - show results -->
          <div class="auction-ended-section">
            <div class="ended-header">
              <h3>🏁 Auction Ended</h3>
            </div>
            {#if highestBid}
              <div class="winner-info">
                <div class="winner-label">Winning Bid:</div>
                <div class="winner-amount-with-increase">
                  <div class="winner-amount">{formatPrice(highestBid.amount, sellerCurrency)}</div>
                  {#if highestBid.amount > data.product.startingPrice}
                    <div class="winner-percentage-increase">
                      <svg class="arrow-up-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="percentage-text">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="winner-bidder">Winner: {getBidderName(highestBid)}</div>
                <div class="starting-price-note">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {:else}
              <div class="no-winner-info">
                <div class="no-winner-icon">📭</div>
                <div class="no-winner-text">No Winning Bid</div>
                <div class="no-winner-desc">This auction ended without any bids.</div>
                <div class="starting-price-note">Starting price was: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {/if}
          </div>
        {/if}

        {#if isHighestBidder && !isOwner}
          {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
            <!-- Active auction - currently highest bidder -->
            <div class="highest-bidder-alert">
              <span class="alert-icon">👑</span>
              <span class="alert-text">You are currently the highest bidder!</span>
            </div>
          {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
            <!-- Auction ended - winner alert -->
            <div class="winner-alert">
              <div class="winner-alert-header">
                <span class="alert-icon">🎉</span>
                <span class="alert-text">Congratulations! You won this auction!</span>
              </div>
              <p class="winner-alert-message">Please contact the seller to arrange payment and delivery.</p>
              <a href="/inbox?product={data.product.id}" class="winner-message-btn">
                💬 Message Seller
              </a>
            </div>
          {/if}
        {/if}

        <!-- Contact Section for Seller -->
        {#if $authStore.isAuthenticated && isOwner && highestBid && data.product.status === 'sold'}
          <!-- Sellers can contact buyer only after accepting the bid -->
          <div class="contact-section">
            <a href="/inbox?product={data.product.id}" class="contact-btn">
              💬 Contact Buyer
            </a>
          </div>
        {/if}

        {#if sortedBids.length > 0}
          <div class="bid-history">
            <h3>Bid History</h3>
            <div class="bid-history-list">
              {#each sortedBids.slice(0, 10) as bid, index (bid.id)}
                <div
                  class="bid-history-item"
                  class:rank-1={index === 0}
                  class:new-bid={newBidIds.has(bid.id)}
                  style="--rank: {index + 1}; --delay: {index * 0.05}s"
                >
                  {#if newBidIds.has(bid.id)}
                    <div class="new-bid-indicator">NEW!</div>
                  {/if}
                  <div class="bid-rank">#{index + 1}</div>
                  <div class="bid-info">
                    <div class="bid-amount">{formatPrice(bid.amount, sellerCurrency)}</div>
                    <div class="bid-details">
                      <span class="bidder-name">{getBidderName(bid)}</span>
                      <span class="bid-time">{formatDate(bid.bidTime)}</span>
                    </div>
                  </div>
                  {#if index === 0}
                    <div class="highest-badge">
                      👑 HIGHEST BID
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Confirm Bid Modal -->
{#if showConfirmBidModal && data.product}
  <div class="modal-overlay" on:click={cancelBid}>
    <div class="modal-content confirm-modal" on:click|stopPropagation>
      <button class="modal-close" on:click={cancelBid}>&times;</button>

      <div class="modal-header">
        <h2>Confirm Your Bid</h2>
      </div>

      <div class="modal-body">
        <div class="confirm-details">
          <p class="product-title">{data.product.title}</p>

          <div class="bid-confirmation">
            <div class="confirm-row">
              <span class="label">Your Bid:</span>
              <span class="value bid-value">{formatPrice(bidAmount, sellerCurrency)}</span>
            </div>

            {#if data.product.currentBid}
              <div class="confirm-row">
                <span class="label">Current Highest:</span>
                <span class="value">{formatPrice(data.product.currentBid, sellerCurrency)}</span>
              </div>
            {:else}
              <div class="confirm-row">
                <span class="label">Starting Price:</span>
                <span class="value">{formatPrice(data.product.startingPrice, sellerCurrency)}</span>
              </div>
            {/if}
          </div>

          <p class="confirm-message">
            Are you sure you want to place this bid? This action cannot be undone.
          </p>

          <div class="privacy-toggle">
            <label class="toggle-label">
              <input type="checkbox" bind:checked={censorMyName} />
              <span class="toggle-text">
                🔒 Hide my full name (show only initials)
              </span>
            </label>
            <p class="toggle-hint">
              {censorMyName ? `Your name will appear as: ${censorName($authStore.user?.name || 'Your Name')}` : 'Your full name will be visible in bid history'}
            </p>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" on:click={cancelBid}>
            Cancel
          </button>
          <button class="btn-confirm-bid" on:click={confirmPlaceBid}>
            Confirm Bid
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Accept Bid Modal -->
{#if showAcceptBidModal && highestBid}
  <div class="modal-overlay">
    <div class="modal-content confirm-modal">
      <button class="modal-close" on:click={closeAcceptBidModal}>&times;</button>

      <div class="modal-header">
        <h2>Accept Bid & Close Auction</h2>
      </div>

      <div class="modal-body">
        {#if acceptSuccess}
          <div class="success-message">
            Bid accepted! Auction closed. Refreshing...
          </div>
        {/if}

        {#if acceptError}
          <div class="error-message">
            {acceptError}
          </div>
        {/if}

        <div class="confirm-details">
          <p class="product-title">{data.product?.title}</p>

          <div class="bid-confirmation accept-confirmation">
            <div class="confirm-row">
              <span class="label">Winning Bid:</span>
              <span class="value bid-value">{formatPrice(highestBid.amount, sellerCurrency)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Winner:</span>
              <span class="value">{getBidderName(highestBid)}</span>
            </div>

            <div class="confirm-row">
              <span class="label">Bid Time:</span>
              <span class="value">{formatDate(highestBid.bidTime)}</span>
            </div>
          </div>

          <p class="confirm-message warning-message">
            ⚠️ Are you sure you want to accept this bid? This will close the auction and mark the item as SOLD. This action cannot be undone.
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel-bid" on:click={closeAcceptBidModal} disabled={accepting}>
            Cancel
          </button>
          <button class="btn-accept-bid" on:click={confirmAcceptBid} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Bid & Close'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Success Alert Modal -->
{#if bidSuccess}
  <div class="success-alert-overlay" on:click={closeSuccessAlert}>
    <div class="success-alert-content" on:click|stopPropagation>
      <button class="success-alert-close" on:click={closeSuccessAlert} aria-label="Close">
        &times;
      </button>

      <div class="success-alert-icon">
        <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      </div>

      <h2>Bid Placed Successfully!</h2>
      <p>You are now the highest bidder.</p>

      <div class="success-alert-progress"></div>
    </div>
  </div>
{/if}

<!-- Login Modal -->
{#if showLoginModal}
  <div class="modal-overlay" on:click={closeModal}>
    <div class="modal-content" on:click|stopPropagation>
      <button class="modal-close" on:click={closeModal}>&times;</button>

      <div class="modal-header">
        <h2>🔒 Login Required</h2>
      </div>

      <div class="modal-body">
        <p>You need to be logged in to place a bid on this product.</p>

        <div class="modal-actions">
          <a href="/login?redirect=/products/{data.product?.id}" class="btn-login">
            Login
          </a>
          <a href="/register?redirect=/products/{data.product?.id}" class="btn-register">
            Create Account
          </a>
        </div>

        <p class="modal-note">
          Don't have an account? Register now to start bidding!
        </p>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Product Modal -->
{#if showEditModal}
  <div class="modal-overlay">
    <div class="modal-content edit-modal">
      <button class="modal-close" on:click={closeEditModal}>&times;</button>

      <div class="modal-header">
        <h2>Edit Product</h2>
      </div>

      <div class="modal-body">
        <ProductForm
          mode="edit"
          product={data.product}
          onSuccess={handleEditSuccess}
          onCancel={closeEditModal}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .error {
    text-align: center;
    padding: 4rem 2rem;
  }

  .error a {
    color: #0066cc;
    text-decoration: none;
  }

  .product-detail {
    max-width: 1200px;
    margin: 0 auto;
  }

  .product-header {
    margin-bottom: 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .edit-product-btn {
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .edit-product-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .back-link {
    color: #0066cc;
    text-decoration: none;
    font-size: 1.1rem;
  }

  .back-link:hover {
    text-decoration: underline;
  }

  .product-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  @media (max-width: 768px) {
    .product-content {
      grid-template-columns: 1fr;
    }

    /* Make modals scrollable on mobile */
    .modal-overlay {
      align-items: flex-start;
      padding: 0.5rem;
    }

    .modal-content {
      width: 100%;
      max-height: calc(100vh - 1rem);
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .edit-modal {
      max-width: 100%;
    }

    .modal-header {
      padding: 1.5rem 1rem 1rem 1rem;
    }

    .modal-header h2 {
      font-size: 1.5rem;
    }

    .modal-body {
      padding: 0 1rem 1rem 1rem;
    }

    .modal-close {
      top: 0.5rem;
      right: 0.5rem;
    }

    /* Stack bid input and button vertically on mobile */
    .bid-row {
      flex-direction: column;
      gap: 0.75rem;
    }

    .bid-control {
      width: 100%;
    }

    .place-bid-btn {
      width: 100%;
      padding: 1rem 2rem;
      font-size: 1.05rem;
    }

    /* Optimize bid section for mobile */
    .bid-section {
      padding: 1rem;
    }

    .bid-section-header h3 {
      font-size: 1.25rem;
    }

    /* Countdown timer adjustments */
    .countdown-timer-badge {
      position: absolute;
      top: 0;
      right: 0;
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
      z-index: 10;
    }

    .countdown-timer-badge .countdown-time {
      font-size: 1rem;
    }

    .countdown-timer-inline {
      padding: 0.5rem 1rem;
    }

    .countdown-timer-inline .countdown-time {
      font-size: 1.125rem;
    }

    /* Bid input adjustments */
    .bid-amount-input {
      font-size: 1.5rem !important;
      min-height: 56px;
    }

    .bid-control {
      min-height: 56px;
    }

    .place-bid-btn {
      min-height: 56px;
    }

    /* Make arrow buttons larger for touch */
    .bid-arrow-btn {
      width: 44px;
      height: 44px;
      min-width: 44px;
    }

    /* Optimize highest bid section for mobile */
    .highest-bid-container {
      padding: 1rem;
      width: 100%;
    }

    .highest-bid-label {
      font-size: 0.8rem;
    }

    .highest-bid-amount {
      font-size: 2rem;
    }

    .percentage-increase {
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
    }

    .percentage-increase .arrow-up-icon {
      width: 14px;
      height: 14px;
    }

    .bid-with-percentage {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    /* Mobile typography adjustments */
    .product-gallery h1 {
      font-size: 1.75rem;
    }

    .product-description h2 {
      font-size: 1.25rem;
    }

    /* Optimize button spacing on mobile */
    .back-link {
      font-size: 0.9rem;
      padding: 0.625rem 1rem;
    }

    /* Ensure price-info container is responsive */
    .price-info {
      padding: 1.25rem;
      min-height: 180px;
    }
  }

  .product-gallery h1 {
    font-size: 2.5rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: #333;
  }

  .status-badge {
    display: inline-block;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    text-transform: uppercase;
    margin-bottom: 1.5rem;
  }

  .status-active {
    background-color: #10b981;
    color: white;
  }

  .status-ended {
    background-color: #ef4444;
    color: white;
  }

  .bid-section-header-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0;
  }

  .bid-section-header-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    transition: opacity 0.2s;
  }

  .bid-section-header-btn:hover {
    opacity: 0.8;
  }

  .bid-section-header-btn h3 {
    margin: 0;
    color: #1f2937;
    font-size: 1.5rem;
    text-align: left;
  }

  .accordion-arrow {
    transition: transform 0.3s ease;
    color: #ef4444;
  }

  .accordion-arrow.open {
    transform: rotate(180deg);
  }

  .countdown-timer-inline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    padding: 0.75rem 1.25rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);
  }

  .countdown-timer-inline .countdown-label {
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-inline .countdown-time {
    color: white;
    font-size: 1.5rem;
    font-weight: 900;
    font-family: 'Courier New', monospace;
    letter-spacing: 1.5px;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
  }

  .price-info {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 2rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
    text-align: center;
    box-shadow: 0 8px 24px rgba(102, 126, 234, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    position: relative;
  }

  .highest-bid-container {
    color: white;
    position: relative;
    width: 100%;
  }

  .highest-bid-header {
    display: flex;
    justify-content: flex-start;
    align-items: center;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
    gap: 0;
  }

  .highest-bid-label {
    font-size: 0.9rem;
    font-weight: 700;
    letter-spacing: 2px;
    opacity: 0.95;
    width: 100%;
    margin-bottom: 0.5rem;
  }

  .countdown-timer-badge {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    padding: 0.75rem 1.25rem;
    border-radius: 0 12px 0 12px;
    font-size: 0.875rem;
    font-weight: 700;
    border: none;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    margin: 0;
    z-index: 10;
  }

  .countdown-timer-badge .countdown-label {
    color: rgba(255, 255, 255, 0.95);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-badge .countdown-time {
    color: #ffffff;
    font-weight: 900;
    letter-spacing: 1px;
    font-family: 'Courier New', monospace;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .bid-with-percentage {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .highest-bid-amount {
    font-size: 3.5rem;
    font-weight: 900;
    line-height: 1;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    margin-bottom: 0;
  }

  .percentage-increase {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 2px solid #047857;
    border-radius: 50px;
    animation: percentageBounce 2s ease-in-out infinite, percentageGlow 2s ease-in-out infinite;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .arrow-up-icon {
    color: white;
    animation: arrowBounce 1s ease-in-out infinite;
    flex-shrink: 0;
  }

  .percentage-text {
    font-size: 1.25rem;
    font-weight: 900;
    color: white;
    letter-spacing: 0.5px;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  @keyframes percentageBounce {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
  }

  @keyframes percentageGlow {
    0%, 100% {
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
      border-color: #047857;
    }
    50% {
      box-shadow: 0 6px 24px rgba(16, 185, 129, 0.7);
      border-color: #10b981;
    }
  }

  @keyframes arrowBounce {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-4px);
    }
  }

  .starting-price-small {
    font-size: 0.95rem;
    opacity: 0.9;
    font-weight: 500;
  }

  /* Inactive Warning Banner */
  .inactive-warning {
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    animation: warningPulse 2s ease-in-out infinite;
  }

  .warning-icon {
    font-size: 1.5rem;
    animation: warningBounce 1s ease-in-out infinite;
  }

  @keyframes warningPulse {
    0%, 100% {
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    }
    50% {
      box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5);
    }
  }

  @keyframes warningBounce {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  /* Sold Info Styles */
  .sold-info {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
    box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4) !important;
  }

  .sold-badge {
    font-size: 1.2rem;
    font-weight: 900;
    letter-spacing: 3px;
    margin-bottom: 0.75rem;
    color: white;
    background-color: rgba(255, 255, 255, 0.2);
    padding: 0.5rem 1.5rem;
    border-radius: 50px;
    display: inline-block;
  }

  .sold-to-info {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 0.75rem;
    color: white;
    opacity: 0.95;
  }

  /* Highest Bidder Alert */
  .highest-bidder-alert {
    background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    border: 3px solid #d97706;
    border-radius: 12px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
    animation: alertPulse 2s ease-in-out infinite;
  }

  @keyframes alertPulse {
    0%, 100% {
      box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 6px 24px rgba(245, 158, 11, 0.6);
      transform: scale(1.02);
    }
  }

  .alert-icon {
    font-size: 2rem;
    animation: crownBounce 1.5s ease-in-out infinite;
  }

  @keyframes crownBounce {
    0%, 100% {
      transform: translateY(0) rotate(-10deg);
    }
    50% {
      transform: translateY(-5px) rotate(10deg);
    }
  }

  .alert-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: #78350f;
    letter-spacing: 0.5px;
  }

  /* Winner Alert */
  .winner-alert {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    border: 3px solid #047857;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
    animation: winnerPulse 2s ease-in-out infinite;
  }

  @keyframes winnerPulse {
    0%, 100% {
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.4);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 6px 28px rgba(16, 185, 129, 0.6);
      transform: scale(1.01);
    }
  }

  .winner-alert-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .winner-alert-header .alert-icon {
    font-size: 2.5rem;
    animation: celebrationBounce 1s ease-in-out infinite;
  }

  @keyframes celebrationBounce {
    0%, 100% {
      transform: scale(1) rotate(0deg);
    }
    25% {
      transform: scale(1.1) rotate(-10deg);
    }
    75% {
      transform: scale(1.1) rotate(10deg);
    }
  }

  .winner-alert-header .alert-text {
    font-size: 1.5rem;
    font-weight: 800;
    color: white;
    letter-spacing: 0.5px;
  }

  .winner-alert-message {
    color: #f0fdf4;
    font-size: 1rem;
    margin-bottom: 1rem;
    line-height: 1.5;
  }

  .winner-message-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: white;
    color: #059669;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 700;
    font-size: 1.125rem;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .winner-message-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    background: #f0fdf4;
  }

  .bid-section {
    background-color: #e7f3ff;
    padding: 1.5rem;
    border-radius: 8px;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    transition: all 0.3s ease;
  }

  .auction-ended-section {
    background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
    padding: 2rem;
    border-radius: 12px;
    margin-bottom: 2rem;
    text-align: center;
    border: 2px solid #d1d5db;
  }

  .ended-header h3 {
    font-size: 1.5rem;
    color: #374151;
    margin-bottom: 1.5rem;
  }

  .winner-info {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .winner-label {
    font-size: 0.875rem;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  .winner-amount-with-increase {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .winner-amount {
    font-size: 2.5rem;
    font-weight: 700;
    color: #10b981;
  }

  .winner-percentage-increase {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .winner-percentage-increase .arrow-up-icon {
    width: 16px;
    height: 16px;
    stroke-width: 3;
  }

  .winner-bidder {
    font-size: 1.125rem;
    color: #374151;
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .starting-price-note {
    font-size: 0.875rem;
    color: #6b7280;
    margin-top: 0.5rem;
  }

  .no-winner-info {
    padding: 1.5rem;
  }

  .no-winner-icon {
    font-size: 4rem;
    margin-bottom: 1rem;
  }

  .no-winner-text {
    font-size: 1.5rem;
    font-weight: 700;
    color: #ef4444;
    margin-bottom: 0.5rem;
  }

  .no-winner-desc {
    font-size: 1rem;
    color: #6b7280;
  }

  .contact-section {
    margin-bottom: 2rem;
  }

  .contact-btn {
    display: block;
    width: 100%;
    padding: 1rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    text-align: center;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .contact-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .bid-form {
    margin-top: 1rem;
    animation: slideDown 0.3s ease-out;
    transform-origin: top;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 500px;
    }
  }

  .bid-input-group {
    width: 100%;
  }

  .bid-row {
    display: flex;
    gap: 1rem;
    align-items: stretch;
  }

  .bid-input-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
  }

  .bid-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: white;
    border: 2px solid #667eea;
    border-radius: 8px;
    padding: 0.5rem;
    flex: 1;
    min-height: 64px;
  }

  .bid-arrow-btn {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    flex-shrink: 0;
  }

  .bid-arrow-btn:hover:not(:disabled) {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.4);
  }

  .bid-arrow-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .bid-arrow-btn:disabled {
    background: #e5e7eb;
    cursor: not-allowed;
    opacity: 0.5;
  }

  .bid-arrow-btn svg {
    pointer-events: none;
  }

  .bid-amount-display {
    flex: 1;
    text-align: center;
    font-size: 1.75rem;
    font-weight: 700;
    color: #667eea;
    padding: 0.5rem;
  }

  .bid-amount-input {
    flex: 1;
    text-align: center;
    font-size: 1.75rem;
    font-weight: 700;
    color: #667eea;
    padding: 0.5rem;
    border: none;
    background: transparent;
    outline: none;
    width: 100%;
  }

  .bid-amount-input:focus {
    color: #4c63d2;
    background: rgba(102, 126, 234, 0.05);
    border-radius: 4px;
  }

  .bid-amount-input::-webkit-inner-spin-button,
  .bid-amount-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .bid-amount-input[type=number] {
    -moz-appearance: textfield;
  }

  .bid-hint {
    margin-top: 0.5rem;
    margin-bottom: 0;
    font-size: 0.9rem;
    color: #666;
    font-weight: 500;
  }

  .place-bid-btn {
    padding: 0 2.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    white-space: nowrap;
    min-height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .place-bid-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .place-bid-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
  }

  .success-message {
    background-color: #10b981;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    animation: slideDown 0.3s ease-out;
  }

  .error-message {
    background-color: #ef4444;
    color: white;
    padding: 1rem;
    border-radius: 4px;
    margin-bottom: 1rem;
    animation: slideDown 0.3s ease-out;
  }

  .info-message {
    background-color: #3b82f6;
    color: white;
    padding: 1rem;
    border-radius: 6px;
    margin-bottom: 1rem;
    text-align: center;
    animation: slideDown 0.3s ease-out;
  }

  .info-message p {
    margin: 0;
    font-weight: 500;
  }

  .description-section,
  .seller-info {
    margin-bottom: 2rem;
  }

  .description-section h3,
  .seller-info h3 {
    margin-bottom: 1rem;
  }

  /* Price Analytics */
  .price-analytics {
    margin-bottom: 2rem;
  }

  .price-analytics h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: #333;
  }

  .chart-container {
    padding: 1.5rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .price-chart {
    width: 100%;
    height: 200px;
    margin-bottom: 1rem;
  }

  .grid-line {
    stroke: #e5e7eb;
    stroke-width: 0.2;
  }

  .price-area {
    fill: url(#price-gradient);
    opacity: 0.2;
  }

  .price-line {
    fill: none;
    stroke: #dc2626;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .data-point {
    fill: #dc2626;
    stroke: white;
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .data-point.first-point {
    fill: #10b981;
  }

  .data-point.last-point {
    fill: #f59e0b;
    r: 2;
  }

  .chart-labels {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 1rem;
    padding: 1rem;
    background: white;
    border-radius: 8px;
    border: 2px solid #f0f0f0;
  }

  .label-left,
  .label-center,
  .label-right {
    text-align: center;
  }

  .label-left {
    text-align: left;
  }

  .label-right {
    text-align: right;
  }

  .label-title {
    font-size: 0.75rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .label-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #dc2626;
  }

  .label-left .label-value {
    color: #10b981;
  }

  .label-right .label-value {
    color: #f59e0b;
  }

  .label-center .label-title {
    color: #667eea;
    font-size: 0.9rem;
  }

  .bid-history {
    margin-top: 1.5rem;
    margin-bottom: 2rem;
  }

  .bid-history h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: #333;
  }

  .bid-history-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .bid-history-item {
    --scale: calc(1 - (min(var(--rank), 4) - 1) * 0.06);
    display: flex;
    align-items: center;
    gap: calc(1rem * var(--scale));
    padding: calc(1rem * var(--scale));
    background-color: #f9fafb;
    border-radius: 8px;
    border: 2px solid #e5e7eb;
    transition: all 0.2s;
  }

  .bid-history-item:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.15);
  }

  /* Gold styling for #1 ranked bid */
  .bid-history-item.rank-1 {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 3px solid #f59e0b;
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    position: relative;
  }

  .bid-history-item.rank-1:hover {
    border-color: #d97706;
    box-shadow: 0 6px 16px rgba(245, 158, 11, 0.4);
  }

  .bid-rank {
    font-size: calc(1rem * var(--scale));
    font-weight: 700;
    color: #667eea;
    min-width: calc(35px * var(--scale));
  }

  .bid-history-item.rank-1 .bid-rank {
    color: #f59e0b;
    font-size: calc(1.2rem * var(--scale));
  }

  .bid-info {
    flex: 1;
  }

  .bid-amount {
    font-size: calc(1.3rem * var(--scale));
    font-weight: 700;
    color: #333;
    margin-bottom: calc(0.25rem * var(--scale));
  }

  .bid-details {
    display: flex;
    gap: 1rem;
    font-size: calc(0.9rem * var(--scale));
    color: #666;
  }

  .bidder-name {
    font-weight: 600;
  }

  .bid-time {
    opacity: 0.8;
  }

  .bid-history-item.rank-1 .bid-amount {
    color: #f59e0b;
    font-weight: 900;
  }

  .bid-history-item.rank-1 .bidder-name {
    color: #92400e;
  }

  .highest-badge {
    position: absolute;
    top: -0.75rem;
    right: 1rem;
    background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    color: white;
    padding: 0.375rem 0.875rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
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
    overflow-y: auto;
    padding: 1rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    background-color: white;
    border-radius: 12px;
    max-width: 500px;
    width: 90%;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    position: relative;
    animation: slideUp 0.3s ease-out;
    margin: auto;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 2rem;
    color: #999;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background-color: #f0f0f0;
    color: #333;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.75rem;
    color: #333;
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-body > p {
    font-size: 1.1rem;
    color: #666;
    margin-bottom: 2rem;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .btn-login,
  .btn-register {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .btn-login {
    background-color: #0066cc;
    color: white;
  }

  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 102, 204, 0.4);
  }

  .btn-register {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-register:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .modal-note {
    font-size: 0.9rem;
    color: #999;
    margin: 0;
  }

  /* Confirm Bid Modal */
  .confirm-modal {
    max-width: 450px;
  }

  .confirm-details {
    text-align: center;
  }

  .product-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #333;
    margin: 0 0 1.5rem 0;
    padding-bottom: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .bid-confirmation {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 1.5rem;
    border-radius: 12px;
    margin-bottom: 1.5rem;
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    color: white;
  }

  .confirm-row:last-child {
    margin-bottom: 0;
  }

  .confirm-row .label {
    font-size: 0.95rem;
    opacity: 0.9;
  }

  .confirm-row .value {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .confirm-row .bid-value {
    font-size: 1.75rem;
    font-weight: 900;
  }

  .confirm-message {
    font-size: 1rem;
    color: #666;
    margin: 0 0 1.5rem 0;
    line-height: 1.6;
  }

  .privacy-toggle {
    background-color: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .toggle-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    user-select: none;
  }

  .toggle-label input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: #dc2626;
  }

  .toggle-text {
    font-size: 1rem;
    font-weight: 600;
    color: #333;
  }

  .toggle-hint {
    margin: 0.75rem 0 0 0;
    padding-left: 2rem;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  .btn-cancel-bid,
  .btn-confirm-bid {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
  }

  .btn-cancel-bid {
    background-color: #e5e7eb;
    color: #333;
  }

  .btn-cancel-bid:hover {
    background-color: #d1d5db;
  }

  .btn-confirm-bid {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .btn-confirm-bid:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  /* Edit Modal Styles */
  .edit-modal {
    max-width: 600px;
  }

  .edit-form {
    text-align: left;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 600;
    color: #333;
    font-size: 0.95rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 100px;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-weight: 500;
  }

  .checkbox-label input[type="checkbox"] {
    width: auto;
    cursor: pointer;
    margin: 0;
  }

  .checkbox-label span {
    flex: 1;
  }

  .field-hint {
    margin: 0.5rem 0 0 0;
    font-size: 0.875rem;
    color: #666;
    font-style: italic;
  }

  .btn-cancel-edit,
  .btn-save-edit {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
  }

  .btn-cancel-edit {
    background-color: #e5e7eb;
    color: #333;
  }

  .btn-cancel-edit:hover:not(:disabled) {
    background-color: #d1d5db;
  }

  .btn-save-edit {
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
  }

  .btn-save-edit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .btn-cancel-edit:disabled,
  .btn-save-edit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Owner Section Styles */
  .owner-section {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border: 2px solid #f59e0b;
  }

  .highest-bid-info {
    text-align: center;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .info-text {
    font-size: 0.95rem;
    color: #92400e;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .bid-amount-large {
    font-size: 2.5rem;
    font-weight: 900;
    color: #f59e0b;
    margin: 0.5rem 0;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .bidder-info {
    font-size: 1rem;
    color: #92400e;
    margin: 0.5rem 0 0 0;
  }

  .accept-bid-btn {
    width: 100%;
    padding: 1.25rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-top: 1rem;
  }

  .accept-bid-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  /* Accept Bid Modal Styles */
  .accept-confirmation {
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  }

  .warning-message {
    background-color: #fef3c7;
    border: 2px solid #f59e0b;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1.5rem;
    color: #92400e;
    font-weight: 600;
  }

  .btn-accept-bid {
    flex: 1;
    padding: 1rem 2rem;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    cursor: pointer;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
  }

  .btn-accept-bid:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
  }

  .btn-accept-bid:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Duration Selector Styles - Tabs */
  .duration-tabs {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background-color: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: #666;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: -2px;
  }

  .tab-btn:hover:not(:disabled) {
    color: #dc2626;
  }

  .tab-btn.active {
    color: #dc2626;
    border-bottom-color: #dc2626;
  }

  .tab-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tab-content {
    margin-top: 1.5rem;
  }

  .tab-pane {
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .duration-buttons {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .duration-btn {
    padding: 0.75rem 1.25rem;
    background-color: white;
    border: 2px solid #dc2626;
    color: #dc2626;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .duration-btn:hover:not(:disabled) {
    background-color: #dc2626;
    color: white;
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(220, 38, 38, 0.3);
  }

  .duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .custom-duration-inputs {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .duration-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .duration-input {
    width: 80px;
    padding: 0.625rem;
    font-size: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-family: inherit;
  }

  .duration-input:focus {
    outline: none;
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .duration-unit {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }

  .apply-duration-btn {
    padding: 0.625rem 1.5rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .apply-duration-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .apply-duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Success Alert Styles */
  .success-alert-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .success-alert-content {
    background: white;
    border-radius: 24px;
    padding: 3rem;
    max-width: 500px;
    width: 90%;
    text-align: center;
    position: relative;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    animation: slideUp 0.4s ease-out;
  }

  @keyframes slideUp {
    from {
      transform: translateY(50px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .success-alert-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: none;
    font-size: 2.5rem;
    color: #999;
    cursor: pointer;
    line-height: 1;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .success-alert-close:hover {
    background-color: #f0f0f0;
    color: #333;
  }

  .success-alert-icon {
    display: flex;
    justify-content: center;
    align-items: center;
    margin: 0 auto 1.5rem;
    color: #10b981;
    animation: checkmark 0.6s ease-out;
  }

  .success-alert-icon svg {
    display: block;
  }

  @keyframes checkmark {
    0% {
      transform: scale(0) rotate(-45deg);
      opacity: 0;
    }
    50% {
      transform: scale(1.2) rotate(0deg);
    }
    100% {
      transform: scale(1) rotate(0deg);
      opacity: 1;
    }
  }

  .success-alert-content h2 {
    font-size: 2rem;
    margin: 0 0 1rem 0;
    color: #1f2937;
    font-weight: 700;
  }

  .success-alert-content p {
    font-size: 1.25rem;
    color: #6b7280;
    margin: 0 0 2rem 0;
  }

  .success-alert-progress {
    height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
    margin-top: 2rem;
  }

  .success-alert-progress::after {
    content: '';
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #10b981, #059669);
    animation: progress 5s linear;
  }

  @keyframes progress {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  /* Live Update Indicator */
  .title-container {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .title-container h1 {
    margin: 0;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.625rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 700;
    transition: all 0.3s;
  }

  /* Connected state - Green (always active with polling) */
  .live-indicator.connected {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #059669;
  }

  .live-indicator.connected .live-dot {
    background: #10b981;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  /* Updating state - Blue (when actively fetching data) */
  .live-indicator.updating {
    background: rgba(59, 130, 246, 0.1);
    border-color: rgba(59, 130, 246, 0.3);
    color: #2563eb;
  }

  .live-indicator.updating .live-dot {
    background: #3b82f6;
    animation: pulse-dot 0.5s ease-in-out infinite;
  }

  .live-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .live-text {
    letter-spacing: 0.05em;
  }

  @keyframes pulse-dot {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  /* Confetti Animation */
  .confetti-container {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
    z-index: 100;
  }

  .confetti {
    position: absolute;
    top: -10px;
    left: var(--x);
    width: 10px;
    height: 10px;
    background: var(--color);
    opacity: 0;
    animation: confettiFall 3s ease-out var(--delay) forwards;
    transform: rotate(var(--rotation));
  }

  @keyframes confettiFall {
    0% {
      opacity: 1;
      top: -10px;
      transform: rotate(var(--rotation)) translateY(0);
    }
    100% {
      opacity: 0;
      top: 100%;
      transform: rotate(calc(var(--rotation) + 360deg)) translateY(100px);
    }
  }

  /* Price Change Animation */
  .price-animate {
    animation: priceChange 0.8s ease-out;
  }

  @keyframes priceChange {
    0% {
      transform: scale(1);
    }
    25% {
      transform: scale(1.3);
      color: #10b981;
    }
    50% {
      transform: scale(0.95);
    }
    75% {
      transform: scale(1.1);
    }
    100% {
      transform: scale(1);
    }
  }

  /* Label Pulse Animation */
  .label-pulse {
    animation: labelPulse 0.6s ease-out;
  }

  @keyframes labelPulse {
    0%, 100% {
      background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      transform: scale(1);
    }
    50% {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      transform: scale(1.05);
      box-shadow: 0 6px 20px rgba(16, 185, 129, 0.6);
    }
  }

  /* New Bid Highlight Animation */
  .bid-history-item {
    position: relative;
    animation: slideIn var(--delay) ease-out;
  }

  .bid-history-item.new-bid {
    animation: newBidHighlight 2s ease-out;
    position: relative;
    overflow: hidden;
  }

  .new-bid-indicator {
    position: absolute;
    top: 8px;
    right: 8px;
    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    color: white;
    padding: 0.25rem 0.625rem;
    border-radius: 12px;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    animation: newBadgePulse 1s ease-in-out infinite;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);
    z-index: 10;
  }

  @keyframes newBidHighlight {
    0% {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      transform: translateX(-100%) scale(0.95);
      opacity: 0;
    }
    15% {
      transform: translateX(0) scale(1.02);
      opacity: 1;
    }
    30% {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4);
    }
    50% {
      background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
    }
    75% {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    100% {
      background: white;
      transform: translateX(0) scale(1);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
  }

  @keyframes newBadgePulse {
    0%, 100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.1);
    }
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Price Info Container */
  .price-info {
    position: relative;
    overflow: visible;
  }

  /* Image Upload Styles */
  .image-upload-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .image-upload-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 2rem;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: white;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    border: none;
    font-size: 1rem;
  }

  .image-upload-btn:hover:not(.disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
  }

  .image-upload-btn.disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-icon {
    font-size: 1.5rem;
  }

  .image-preview-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }

  .image-preview-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid #e5e7eb;
    background: #f9fafb;
  }

  .image-preview-item img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .remove-image-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    width: 32px;
    height: 32px;
    background: rgba(220, 38, 38, 0.9);
    color: white;
    border: none;
    border-radius: 50%;
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    font-weight: bold;
    line-height: 1;
    z-index: 2;
  }

  .remove-image-btn:hover:not(:disabled) {
    background: #991b1b;
    transform: scale(1.1);
  }

  .remove-image-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .image-number {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .image-type {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    background: rgba(16, 185, 129, 0.9);
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  @media (max-width: 768px) {
    .image-preview-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }
</style>
