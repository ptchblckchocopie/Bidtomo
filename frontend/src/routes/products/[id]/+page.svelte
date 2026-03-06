<script lang="ts">
  import { placeBid, fetchProductBids, updateProduct, checkProductStatus, fetchProduct, fetchUserRatings, calculateUserRatingStats, fetchUserProducts, reportProduct, type UserRatingStats } from '$lib/api';
  import { authStore } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import ProductForm from '$lib/components/ProductForm.svelte';
  import ImageSlider from '$lib/components/ImageSlider.svelte';
  import StarRating from '$lib/components/StarRating.svelte';
  import type { Product } from '$lib/api';
  import { getProductSSE, disconnectProductSSE, queueBid as queueBidToRedis, type SSEEvent, type BidEvent, type ProductVisibilityEvent } from '$lib/sse';
  import { trackProductView } from '$lib/analytics';
  import { watchlistStore } from '$lib/stores/watchlist';
  import WatchlistToggle from '$lib/components/WatchlistToggle.svelte';
  import { getCategoryLabel } from '$lib/data/categories';
  import { onMount, onDestroy } from 'svelte';

  let { data } = $props<{ data: PageData }>();

  // Dynamic back link based on 'from' parameter
  let backLink = $derived.by(() => {
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
  });

  let backLinkText = $derived.by(() => {
    const from = $page.url.searchParams.get('from');
    switch (from) {
      case 'inbox':
        return 'Back to Inbox';
      case 'browse':
        return 'Back to Products';
      default:
        return 'Back to Products';
    }
  });

  // Admin hide/unhide modal
  let adminModalOpen = $state(false);
  let adminModalLoading = $state(false);

  function openAdminModal() {
    adminModalOpen = true;
  }

  function closeAdminModal() {
    adminModalOpen = false;
    adminModalLoading = false;
  }

  async function confirmToggleVisibility() {
    adminModalLoading = true;
    try {
      const result = await updateProduct(String(data.product.id), { active: !data.product.active });
      if (result) data.product.active = !data.product.active;
    } finally {
      closeAdminModal();
    }
  }

  // Report modal
  let showReportModal = $state(false);
  let reportReason = $state('');
  let reportDescription = $state('');
  let submittingReport = $state(false);
  let reportError = $state('');
  let reportSuccess = $state(false);

  function openReportModal() {
    reportReason = '';
    reportDescription = '';
    reportError = '';
    reportSuccess = false;
    showReportModal = true;
  }

  function closeReportModal() {
    showReportModal = false;
  }

  async function submitReport() {
    if (!reportReason) {
      reportError = 'Please select a reason';
      return;
    }
    submittingReport = true;
    reportError = '';
    try {
      await reportProduct(String(data.product.id), reportReason, reportDescription || undefined);
      reportSuccess = true;
    } catch (error: any) {
      reportError = error.message || 'Failed to submit report';
    } finally {
      submittingReport = false;
    }
  }

  let bidAmount = $state(0);

  let bidInterval = $derived(data.product?.bidInterval || 1);
  let minBid = $derived((data.product?.currentBid || data.product?.startingPrice || 0) + bidInterval);

  // Update bidAmount when minBid changes
  $effect(() => {
    if (minBid && bidAmount === 0) {
      bidAmount = minBid;
    }
  });
  let bidding = $state(false);
  let bidError = $state('');
  let bidSuccess = $state(false);
  let showLoginModal = $state(false);
  let showConfirmBidModal = $state(false);
  let showEditModal = $state(false);
  let showAcceptBidModal = $state(false);
  let bidSectionOpen = $state(false);
  let censorMyName = $state(true);
  // Save censor name preference to localStorage when it changes
  $effect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('bid_censor_name', String(censorMyName));
    }
  });
  let accepting = $state(false);
  let acceptError = $state('');
  let acceptSuccess = $state(false);

  // Seller rating data
  let sellerRatingStats: UserRatingStats | null = $state(null);
  let sellerCompletedSales = $state(0);
  let loadingSellerData = $state(true);

  // Sort bids by amount (highest to lowest)
  let sortedBids = $derived([...data.bids].sort((a, b) => b.amount - a.amount));

  // Calculate percentage increase from starting price
  let percentageIncrease = $derived(data.product?.currentBid && data.product?.startingPrice
    ? ((data.product.currentBid - data.product.startingPrice) / data.product.startingPrice * 100).toFixed(1)
    : '0.0');

  // Countdown timer
  let timeRemaining = $state('');
  let countdownInterval: ReturnType<typeof setInterval> | null = $state(null);

  // Check if auction has ended by time (not just status)
  // Updated by updateCountdown() every second — not $derived because new Date() doesn't trigger reactivity
  let hasAuctionEnded = $state(data.product?.auctionEndDate
    ? new Date().getTime() > new Date(data.product.auctionEndDate).getTime()
    : false);

  // SSE cleanup
  let sseUnsubscribe: (() => void) | null = null;

  // Real-time update with polling
  let pollingInterval: ReturnType<typeof setInterval> | null = $state(null);
  let lastKnownState = $state({
    updatedAt: data.product?.updatedAt || '',
    latestBidTime: '',
    bidCount: data.bids.length,
    status: data.product?.status || 'active',
    currentBid: data.product?.currentBid
  });
  let isUpdating = $state(false);
  let connectionStatus: 'connected' | 'disconnected' = $state('connected');

  // Animation tracking
  let previousBids: any[] = $state([...data.bids]);
  let newBidIds = $state(new Set<string>());
  let priceChanged = $state(false);
  let showConfetti = $state(false);
  let animatingBidId: string | null = $state(null);

  // Outbid tracking
  let wasOutbid = $state(false);
  let wasHighestBidder = $state(false);
  let outbidAnimating = $state(false);
  let currentBidderMessage = $state('');

  // Random messages for highest bidder
  const highestBidderMessages = [
    "You're currently the highest bidder! 🎯",
    "Leading the pack! Keep your eyes on the prize! 👀",
    "You're in the lead! Stay sharp! ⚡",
    "Top bidder alert! You're winning! 🏆",
    "You're ahead of the competition! 🚀",
    "Currently in first place! Nice move! 💪",
    "You've taken the lead! Hold on tight! 🎢",
    "Winning bid is yours... for now! 😎",
    "You're the one to beat! 🥇",
    "Sitting at the top! Great bid! ⭐",
    "You're dominating this auction! 🔥",
    "Front runner status achieved! 🏃‍♂️"
  ];

  // Random messages for when user gets outbid
  const outbidMessages = [
    "Oh no! Someone just outbid you! 😱",
    "Uh oh! You've been outbid! Time to strike back! ⚔️",
    "Plot twist! Another bidder took the lead! 😮",
    "You've been dethroned! Will you reclaim your spot? 👑",
    "Someone swooped in! Don't let them win! 🦅",
    "Outbid alert! The competition is heating up! 🔥",
    "They snatched the lead! Fight back! 💥",
    "You lost the top spot! Bid again to reclaim it! 🎯",
    "A challenger appeared and took the lead! ⚡",
    "Oops! Someone wants this more than you... or do they? 🤔",
    "The tables have turned! Your move! ♟️",
    "Knocked off the throne! Time for revenge? 😤"
  ];

  // Get random message
  function getRandomMessage(messages: string[]): string {
    return messages[Math.floor(Math.random() * messages.length)];
  }

  // Check if current user is the seller
  let isOwner = $derived($authStore.user?.id && data.product?.seller?.id &&
               $authStore.user.id === data.product.seller.id);

  // Get highest bid
  let highestBid = $derived(sortedBids.length > 0 ? sortedBids[0] : null);

  // Check if current user is the highest bidder
  let isHighestBidder = $derived($authStore.user?.id && highestBid &&
                       (typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder) === $authStore.user.id);

  // Update bidder message when status changes
  $effect(() => {
    const currentUserId = $authStore.user?.id;
    const currentHighestBidderId = highestBid ?
      (typeof highestBid.bidder === 'object' ? highestBid.bidder.id : highestBid.bidder) : null;

    const isCurrentlyHighest = currentUserId && currentHighestBidderId === currentUserId;

    // Check if user was outbid (but NOT if they just placed a successful bid themselves)
    if (wasHighestBidder && !isCurrentlyHighest && currentUserId && !bidSuccess && !bidding) {
      wasOutbid = true;
      outbidAnimating = true;
      currentBidderMessage = getRandomMessage(outbidMessages);
      // Reset animation after it plays
      setTimeout(() => {
        outbidAnimating = false;
      }, 500);
      // Auto-close the outbid alert after 5 seconds
      setTimeout(() => {
        wasOutbid = false;
      }, 5000);
    } else if (isCurrentlyHighest && !wasHighestBidder) {
      // User just became highest bidder
      wasOutbid = false;
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    } else if (isCurrentlyHighest && wasHighestBidder && bidSuccess) {
      // User outbid themselves - still highest bidder, update message
      wasOutbid = false;
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    } else if (isCurrentlyHighest && !currentBidderMessage) {
      // Initial load as highest bidder
      currentBidderMessage = getRandomMessage(highestBidderMessages);
    }

    wasHighestBidder = !!isCurrentlyHighest;
  });

  // Prepare chart data - bids sorted by time (oldest first), with x/y coordinates
  let chartData = $derived.by(() => {
    const points = [...data.bids]
      .sort((a, b) => new Date(a.bidTime).getTime() - new Date(b.bidTime).getTime())
      .map((bid, index) => ({
        time: new Date(bid.bidTime),
        price: bid.amount,
        index,
        x: 0,
        y: 0
      }));

    if (points.length > 0) {
      const minPrice = data.product?.startingPrice || Math.min(...points.map(d => d.price));
      const maxPrice = Math.max(...points.map(d => d.price));
      const priceRange = maxPrice - minPrice || 1;

      points.forEach((d) => {
        d.x = (d.index / Math.max(points.length - 1, 1)) * 100;
        d.y = 100 - ((d.price - minPrice) / priceRange) * 100;
      });
    }

    return points;
  });

  // Get the seller's currency for this product
  let sellerCurrency = $derived(data.product?.seller?.currency || 'PHP');

  async function updateCountdown() {
    if (!data.product?.auctionEndDate) return;

    const now = new Date().getTime();
    const end = new Date(data.product.auctionEndDate).getTime();
    const distance = end - now;

    if (distance < 0) {
      timeRemaining = 'Auction Ended';
      hasAuctionEnded = true;
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

  $effect(() => {
    if (data.product?.auctionEndDate) {
      updateCountdown();
      if (!countdownInterval) {
        countdownInterval = setInterval(updateCountdown, 1000);
      }
    }
  });

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

  // Load seller rating data
  async function loadSellerData(sellerId: string) {
    try {
      loadingSellerData = true;

      // Fetch ratings received by seller
      const ratings = await fetchUserRatings(sellerId, 'received');
      sellerRatingStats = calculateUserRatingStats(ratings);

      // Fetch completed sales count
      const soldProducts = await fetchUserProducts(sellerId, { status: 'sold' });
      sellerCompletedSales = soldProducts.totalDocs;
    } catch (error) {
      console.error('Error loading seller data:', error);
    } finally {
      loadingSellerData = false;
    }
  }

  onMount(() => {
    // Track product view
    if (data.product?.id) {
      trackProductView(data.product.id, data.product.title);
    }

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

    // Load censor name preference from localStorage
    const savedCensorPref = localStorage.getItem('bid_censor_name');
    if (savedCensorPref !== null) {
      censorMyName = savedCensorPref === 'true';
    }

    // Fetch seller rating data
    if (data.product?.seller?.id) {
      loadSellerData(data.product.seller.id);
    }

    // Connect to SSE for real-time updates
    if (data.product?.id) {
      const sseClient = getProductSSE(String(data.product.id));
      sseClient.connect();

      // Subscribe to bid events
      const unsubscribe = sseClient.subscribe(async (event: SSEEvent) => {
        if (event.type === 'bid' && (event as BidEvent).success) {
          const bidEvent = event as BidEvent;

          // Update product current bid
          if (data.product && bidEvent.amount) {
            const newAmount = bidEvent.amount;
            const previousBid = data.product.currentBid || data.product.startingPrice;

            // Check if this confirms one of our optimistic bids
            const isOwnOptimisticConfirmation = bidEvent.bidderId && data.bids.some((b: any) =>
              String(b.id).startsWith('optimistic-') && b.amount === newAmount &&
              String(bidEvent.bidderId) === String(b.bidder?.id)
            );

            if (newAmount > previousBid || isOwnOptimisticConfirmation) {

              if (!isOwnOptimisticConfirmation) {
                priceChanged = true;
              }
              data.product.currentBid = newAmount;

              // Create new bid object from SSE data (no need to fetch!)
              if (bidEvent.bidId && bidEvent.bidderId) {
                const newBid = {
                  id: String(bidEvent.bidId),
                  amount: bidEvent.amount,
                  bidTime: bidEvent.bidTime || new Date().toISOString(),
                  censorName: bidEvent.censorName || false,
                  bidder: {
                    id: String(bidEvent.bidderId),
                    name: bidEvent.bidderName || 'Anonymous',
                    email: '',
                  },
                  product: data.product.id,
                };

                // Remove any optimistic bid with the same amount from the same user
                const filteredBids = data.bids.filter((b: any) => {
                  if (!String(b.id).startsWith('optimistic-')) return true;
                  // Remove optimistic bid if this real bid matches (same user + same amount)
                  return !(String(bidEvent.bidderId) === String(b.bidder?.id) && bidEvent.amount === b.amount);
                });

                // Only add if not already present (by real id)
                if (!filteredBids.some((b: any) => b.id === String(bidEvent.bidId))) {
                  newBidIds = new Set([String(bidEvent.bidId)]);
                  data.bids = [newBid as any, ...filteredBids];
                } else {
                  data.bids = filteredBids;
                }
              }

              // Update bid amount if it's below the new minimum
              // (minBid is $derived and will auto-update, but we need to adjust bidAmount)
              const newMinBid = (data.product.currentBid || data.product.startingPrice || 0) + bidInterval;
              if (bidAmount < newMinBid) {
                bidAmount = newMinBid;
              }

              // Clear animations after delay
              setTimeout(() => {
                priceChanged = false;
                newBidIds = new Set();
              }, 3000);

              // Trigger reactivity
              data = { ...data };
            }
          }
        } else if (event.type === 'accepted') {
          // Smoothly update UI when bid is accepted
          if (data.product && event.success) {
            data.product.status = 'sold';

            // Close accept bid modal if open
            showAcceptBidModal = false;
            acceptSuccess = true;

            // Trigger reactivity
            data = { ...data };

            // Show success feedback without refresh
            setTimeout(() => {
              acceptSuccess = false;
            }, 3000);
          }
        } else if (event.type === 'product_visibility') {
          const visEvent = event as ProductVisibilityEvent;
          if (data.product) {
            data.product.active = visEvent.active;
            data = { ...data };
          }
        }
      });

      // Store unsubscribe for cleanup
      sseUnsubscribe = unsubscribe;
    }

    // Fallback polling every 10 seconds (reduced frequency since we have SSE)
    pollingInterval = setInterval(() => {
      checkForUpdates();
    }, 10000);

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
          checkForUpdates(); // Immediate update when returning
          pollingInterval = setInterval(() => {
            checkForUpdates();
          }, 10000); // Use same 10 second interval as initial
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

    // Disconnect from SSE
    if (data.product?.id) {
      disconnectProductSSE(String(data.product.id));
    }
    if (sseUnsubscribe) {
      sseUnsubscribe();
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

    const submittedAmount = bidAmount;
    const currentUser = $authStore.user;

    // Save state before optimistic update so we can restore on failure
    const previousCurrentBid = data.product.currentBid;
    const previousBids = [...data.bids];
    const previousBidAmount = bidAmount;

    // Optimistic update: show the bid immediately in the UI
    const optimisticBidId = `optimistic-${Date.now()}`;
    let optimisticBid: any = null;
    if (currentUser) {
      optimisticBid = {
        id: optimisticBidId,
        amount: submittedAmount,
        bidTime: new Date().toISOString(),
        censorName: censorMyName,
        bidder: {
          id: String(currentUser.id),
          name: currentUser.name || currentUser.email || 'You',
          email: currentUser.email || '',
        },
        product: data.product.id,
      };

      // Update UI immediately
      data.product.currentBid = submittedAmount;
      newBidIds = new Set([optimisticBidId]);
      data.bids = [optimisticBid, ...data.bids];
      priceChanged = true;
      showConfetti = true;
      bidSuccess = true;

      // Advance bid amount to next minimum
      bidAmount = submittedAmount + bidInterval;

      // Trigger reactivity
      data = { ...data };
    }

    try {
      // Fire the actual request
      const queueResult = await queueBidToRedis(data.product.id, submittedAmount, censorMyName);

      if (queueResult.success) {
        bidError = '';

        // If bid was processed directly (fallback), replace optimistic bid with real data
        if (queueResult.fallback || queueResult.bidId) {
          const updatedBids = await fetchProductBids(data.product.id);
          const previousBidIdSet = new Set(data.bids.filter((b: any) => b.id !== optimisticBidId).map((b: any) => b.id));
          newBidIds = new Set(
            updatedBids
              .filter((b: any) => !previousBidIdSet.has(b.id))
              .map((b: any) => b.id)
          );
          data.bids = updatedBids;
          if (data.product) {
            data.product.currentBid = submittedAmount;
          }
        }
        // else: bid was queued — SSE will deliver the real bid and the
        // onmessage handler will replace/supplement the optimistic entry

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

        // Auto-close success message after 5 seconds
        setTimeout(() => {
          bidSuccess = false;
        }, 5000);
      } else {
        // Bid failed — roll back to saved state
        if (optimisticBid && data.product) {
          data.bids = previousBids;
          data.product.currentBid = previousCurrentBid;
          priceChanged = false;
          showConfetti = false;
          bidSuccess = false;
          bidAmount = previousBidAmount;
          data = { ...data };
        }
        bidError = queueResult.error || 'Failed to place bid. Please try again.';
      }
    } catch (error) {
      console.error('Error in confirmPlaceBid:', error);
      // Roll back to saved state
      if (optimisticBid && data.product) {
        data.bids = previousBids;
        data.product.currentBid = previousCurrentBid;
        priceChanged = false;
        showConfetti = false;
        bidSuccess = false;
        bidAmount = previousBidAmount;
        data = { ...data };
      }
      bidError = 'An error occurred while placing your bid.';
    } finally {
      bidding = false;
    }
  }

  function cancelBid() {
    showConfirmBidModal = false;
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

      // minBid is $derived and will auto-update; adjust bidAmount if needed
      const newMinBid = (data.product.currentBid || data.product.startingPrice || 0) + bidInterval;
      if (bidAmount < newMinBid) {
        bidAmount = newMinBid;
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
      // Queue accept bid through Redis to prevent race conditions
      const token = localStorage.getItem('auth_token');
      if (!token) {
        acceptError = 'You must be logged in to accept a bid.';
        accepting = false;
        return;
      }

      const response = await fetch('/api/bridge/bid/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `JWT ${token}`
        },
        body: JSON.stringify({
          productId: data.product.id
        })
      });

      const result = await response.json().catch(() => ({ success: false, error: `Server error (${response.status})` }));

      if (!response.ok) {
        acceptError = result.error || `Failed to accept bid (${response.status})`;
        accepting = false;
        return;
      }

      if (result.success) {
        // SSE will handle the UI update smoothly when the accept is processed
        // Close the modal - SSE event will update the status
        showAcceptBidModal = false;
        // acceptSuccess will be set by SSE event when processed
      } else {
        console.error('Failed to accept bid:', result.error);
        acceptError = result.error || 'Failed to accept bid. Please try again.';
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
  <div class="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-8">
    <h1 class="headline-bh text-4xl">Product Not Found</h1>
    <p class="text-[var(--color-fg)] opacity-70">The product you're looking for doesn't exist.</p>
    <a href={backLink} class="btn-bh">{backLinkText}</a>
  </div>
{:else}
  <!-- Main wrapper -->
  <div class="max-w-[1280px] mx-auto px-4 py-6 lg:px-8 lg:py-10">

    <!-- Top bar: back link + action buttons -->
    <div class="flex flex-wrap items-center gap-3 mb-6 border-b border-[var(--color-border)] pb-4">
      <a href={backLink} class="label-bh hover:text-[var(--color-fg)] transition-colors">&larr; {backLinkText}</a>
      <div class="flex-1"></div>
      {#if isOwner}
        <button class="btn-bh-outline text-xs px-3 py-1.5" onclick={openEditModal}>Edit Product</button>
      {/if}
      {#if $authStore.user?.role === 'admin'}
        <button
          class="text-xs px-3 py-1.5 font-semibold border border-[var(--color-border)] cursor-pointer {data.product.active ? 'bg-[var(--color-fg)] text-white' : 'bg-[var(--color-bg)] text-white'}"
          onclick={openAdminModal}
        >
          {data.product.active ? 'Hide Product' : 'Show Product'}
        </button>
      {/if}
      {#if $authStore.isAuthenticated && !isOwner}
        <button class="btn-bh-outline text-xs px-3 py-1.5" onclick={openReportModal}>Report</button>
      {/if}
    </div>

    <!-- 8col / 4col newspaper grid -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-0">

      <!-- LEFT COLUMN: Gallery + Description + Analytics + Seller (8 cols) -->
      <div class="lg:col-span-8 lg:pr-8">

        <!-- Title row -->
        <div class="flex flex-wrap items-center gap-3 mb-4">
          <h1 class="headline-bh text-3xl lg:text-5xl flex-1 min-w-0">{data.product.title}</h1>
          {#if $authStore.isAuthenticated && $watchlistStore.loaded}
            <WatchlistToggle productId={data.product.id} size="lg" />
          {/if}
          <div
            class="live-indicator flex items-center gap-1.5 px-2 py-1 border border-[var(--color-border)]"
            class:updating={isUpdating}
            class:connected={connectionStatus === 'connected'}
            title="Real-time updates active (SSE + fallback polling)"
          >
            <span class="live-dot w-2 h-2 {isUpdating ? 'bg-[var(--color-fg)] animate-pulse' : 'bg-[var(--color-fg)] animate-pulse'}"></span>
            <span class="label-bh text-[0.65rem]">LIVE</span>
          </div>
        </div>

        <!-- Status badge -->
        <div class="mb-4">
          <span class="badge-bh bg-[var(--color-fg)] text-white px-3 py-1">
            {data.product.status}
          </span>
        </div>

        <!-- Image gallery -->
        <div class="mb-6 newsprint-img">
          <ImageSlider images={data.product.images || []} productTitle={data.product.title} />
        </div>

        <!-- Description -->
        <div class="mb-8">
          <h3 class="label-bh mb-3 text-sm">Description</h3>
          <div class="border-t border-[var(--color-border)] pt-4">
            <p class="text-[var(--color-fg)] leading-relaxed">{data.product.description}</p>
          </div>
        </div>

        <!-- Price Analytics Graph -->
        {#if sortedBids.length > 0 && chartData.length > 0}
          <div class="mb-8">
            <h3 class="label-bh mb-3 text-sm">Price Analytics</h3>
            <div class="card-bh p-4 lg:p-6 hover:transform-none">
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="w-full h-[200px] mb-4">
                <defs>
                  <linearGradient id="price-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:var(--color-fg);stop-opacity:0.15" />
                    <stop offset="100%" style="stop-color:var(--color-fg);stop-opacity:0" />
                  </linearGradient>
                </defs>
                <line x1="0" y1="0" x2="100" y2="0" class="grid-line" />
                <line x1="0" y1="25" x2="100" y2="25" class="grid-line" />
                <line x1="0" y1="50" x2="100" y2="50" class="grid-line" />
                <line x1="0" y1="75" x2="100" y2="75" class="grid-line" />
                <line x1="0" y1="100" x2="100" y2="100" class="grid-line" />
                <path
                  d="M 0,100 {chartData.map(d => `L ${d.x},${d.y}`).join(' ')} L 100,100 Z"
                  class="price-area"
                />
                <polyline
                  points={chartData.map(d => `${d.x},${d.y}`).join(' ')}
                  class="price-line"
                />
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
              <div class="flex justify-between items-start pt-4 border-t border-[var(--color-border)]">
                <div class="text-left">
                  <div class="label-bh mb-1">Starting</div>
                  <div class="font-mono text-sm font-bold text-[var(--color-fg)]">{formatPrice(data.product?.startingPrice || chartData[0]?.price || 0, sellerCurrency)}</div>
                </div>
                <div class="text-center">
                  <div class="label-bh">{chartData.length} Bid{chartData.length !== 1 ? 's' : ''}</div>
                </div>
                <div class="text-right">
                  <div class="label-bh mb-1">Current</div>
                  <div class="font-mono text-sm font-bold text-[var(--color-fg)]">{formatPrice(chartData[chartData.length - 1]?.price || 0, sellerCurrency)}</div>
                </div>
              </div>
            </div>
          </div>
        {/if}

        <!-- Seller Information -->
        <div class="mb-8">
          <h3 class="label-bh mb-3 text-sm">Seller Information</h3>
          <div class="card-bh p-5 hover:transform-none">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-12 h-12 bg-[var(--color-fg)] flex items-center justify-center text-white font-semibold text-lg border border-[var(--color-border)] overflow-hidden flex-shrink-0">
                {#if data.product.seller?.profilePicture && typeof data.product.seller.profilePicture === 'object' && data.product.seller.profilePicture.url}
                  <img src={data.product.seller.profilePicture.url} alt={data.product.seller.name} class="w-full h-full object-cover" />
                {:else}
                  {data.product.seller?.name?.charAt(0)?.toUpperCase() || '?'}
                {/if}
              </div>
              <div class="flex flex-col gap-0.5">
                <a href="/users/{data.product.seller?.id}" class="font-semibold text-[var(--color-fg)] hover:text-[var(--color-fg)] transition-colors text-base no-underline">
                  {data.product.seller?.name || 'Unknown'}
                </a>
                {#if data.product.seller?.createdAt}
                  <span class="label-bh text-[0.7rem]">Member since {new Date(data.product.seller.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                {/if}
              </div>
            </div>
            <div class="flex items-center gap-4 py-3 border-t border-b border-[var(--color-border)] mb-4">
              {#if loadingSellerData}
                <div class="label-bh py-2">Loading...</div>
              {:else}
                <div class="flex flex-col items-center gap-1">
                  <span class="label-bh text-[0.65rem] text-[var(--color-fg)]">Seller</span>
                  <div class="flex items-center gap-1">
                    <StarRating rating={sellerRatingStats?.asSeller?.averageRating || 0} size="small" />
                    <span class="font-semibold text-sm text-[var(--color-fg)]">{(sellerRatingStats?.asSeller?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="label-bh text-[0.65rem]">{sellerRatingStats?.asSeller?.totalRatings || 0} rating{(sellerRatingStats?.asSeller?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="w-px h-10 bg-[var(--color-border)]"></div>
                <div class="flex flex-col items-center gap-1">
                  <span class="label-bh text-[0.65rem] text-[var(--color-fg)]">Buyer</span>
                  <div class="flex items-center gap-1">
                    <StarRating rating={sellerRatingStats?.asBuyer?.averageRating || 0} size="small" />
                    <span class="font-semibold text-sm text-[var(--color-fg)]">{(sellerRatingStats?.asBuyer?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="label-bh text-[0.65rem]">{sellerRatingStats?.asBuyer?.totalRatings || 0} rating{(sellerRatingStats?.asBuyer?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="w-px h-10 bg-[var(--color-border)]"></div>
                <div class="flex flex-col items-center gap-1">
                  <span class="font-semibold text-lg text-[var(--color-fg)]">{sellerCompletedSales}</span>
                  <span class="label-bh text-[0.65rem]">sale{sellerCompletedSales !== 1 ? 's' : ''}</span>
                </div>
              {/if}
            </div>
            {#if data.product.region || data.product.city}
              <div class="flex items-center gap-1.5 text-sm text-[var(--color-fg)] opacity-70 mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{data.product.city}{data.product.city && data.product.region ? ', ' : ''}{data.product.region}</span>
              </div>
            {/if}
            {#if data.product.categories && data.product.categories.length > 0}
              <div class="flex flex-wrap gap-2 mb-4">
                {#each data.product.categories as categoryValue}
                  <a href="/products?category={categoryValue}" class="badge-bh bg-[var(--color-fg)] text-white px-2.5 py-0.5 no-underline hover:bg-[var(--color-fg)] hover:text-white transition-colors">
                    {getCategoryLabel(categoryValue)}
                  </a>
                {/each}
              </div>
            {/if}
            <a href="/users/{data.product.seller?.id}" class="btn-bh-outline w-full text-center block text-sm py-2">View Profile</a>
          </div>
        </div>
      </div>

      <!-- RIGHT COLUMN: Bid sidebar (4 cols) -->
      <div class="lg:col-span-4 lg:border-l lg:border-[var(--color-border)] lg:pl-8">

        {#if !data.product.active}
          <div class="bg-[var(--color-fg)] text-white p-4 mb-4 flex items-center gap-3 font-semibold border border-[var(--color-border)]">
            <span class="text-xl">!</span>
            <span class="text-sm">This product is currently inactive and hidden from Browse Products</span>
          </div>
        {/if}

        {#if !isOwner && !hasAuctionEnded && data.product.status !== 'sold'}
          <div class="bid-price-card border border-[var(--color-border)] p-6 mb-4 relative">
            {#if showConfetti}
              <div class="confetti-container absolute inset-0 pointer-events-none overflow-hidden z-10">
                {#each Array(50) as _, i}
                  <div class="confetti" style="--delay: {i * 0.02}s; --x: {Math.random() * 100}%; --rotation: {Math.random() * 360}deg; --color: {['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff6348', '#1dd1a1'][i % 6]}"></div>
                {/each}
              </div>
            {/if}

            {#if (data.product.status === 'active' || data.product.status === 'available') && data.product.status !== 'sold' && !hasAuctionEnded}
              <div class="flex items-center gap-2 mb-4">
                <span class="label-bh">Ends in</span>
                <span class="font-mono text-sm font-bold text-[var(--color-fg)]">{timeRemaining || 'Loading...'}</span>
              </div>
            {/if}

            {#if data.product.currentBid && !hasAuctionEnded && data.product.status !== 'ended' && data.product.status !== 'sold'}
              <div class:expanded={bidSectionOpen && !isOwner}>
                <div class="label-bh mb-2" class:label-pulse={priceChanged}>CURRENT HIGHEST BID</div>
                <div class="flex items-end gap-3 flex-wrap mb-2">
                  <div class="font-mono text-4xl lg:text-5xl font-black text-[var(--color-fg)] leading-none" class:price-animate={priceChanged}>{formatPrice(data.product.currentBid, sellerCurrency)}</div>
                  {#if data.product.currentBid && data.product.currentBid > data.product.startingPrice}
                    <div class="badge-bh bg-[var(--color-fg)] text-white flex items-center gap-1 px-2 py-1">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="font-mono text-xs font-bold">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="label-bh mb-4">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                {#if !isOwner}
                  <button class="btn-bh-red w-full py-3 text-sm" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span>{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ml-2 transition-transform {bidSectionOpen ? 'rotate-180' : ''}">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                {/if}
              </div>
            {:else if !hasAuctionEnded && data.product.status !== 'ended'}
              <div class:expanded={bidSectionOpen && !isOwner}>
                <div class="label-bh mb-2">STARTING BID</div>
                <div class="font-mono text-4xl lg:text-5xl font-black text-[var(--color-fg)] leading-none mb-2">{formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                <div class="label-bh mb-4">No bids yet - be the first!</div>
                {#if !isOwner}
                  <button class="btn-bh-red w-full py-3 text-sm" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span>{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ml-2 transition-transform {bidSectionOpen ? 'rotate-180' : ''}">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
          {#if isOwner}
            <div class="card-bh p-5 mb-6 hover:transform-none">
              <div class="flex items-center justify-between mb-4">
                <h3 class="label-bh text-sm">Your Listing</h3>
                <div class="flex items-center gap-2 bg-[var(--color-fg)] text-white px-3 py-1.5 border border-[var(--color-border)]">
                  <span class="label-bh text-white text-[0.6rem]">Ends in</span>
                  <span class="font-mono text-xs font-bold">{timeRemaining || 'Loading...'}</span>
                </div>
              </div>
              {#if highestBid}
                <div class="text-center py-4">
                  <p class="label-bh mb-2">Current Highest Bid</p>
                  <p class="font-mono text-3xl font-black text-[var(--color-fg)] mb-1">{formatPrice(highestBid.amount, sellerCurrency)}</p>
                  <p class="text-sm text-[var(--color-fg)] opacity-70">by {getBidderName(highestBid)}</p>
                </div>
                <button class="btn-bh-red w-full py-3 text-sm" onclick={openAcceptBidModal}>
                  Accept Bid & Close Auction
                </button>
              {:else}
                <div class="text-center py-6">
                  <p class="text-[var(--color-fg)] opacity-60 text-sm">No bids yet. Waiting for bidders...</p>
                </div>
              {/if}
            </div>
          {:else}
            <div class="overflow-hidden transition-all duration-100 {bidSectionOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}">
              <div class="card-bh p-5 mb-4 hover:transform-none">
                <h3 class="label-bh text-sm mb-4">Place Your Bid</h3>
                {#if !$authStore.isAuthenticated}
                  <div class="bg-[var(--color-fg)] text-white p-3 mb-4 text-center text-sm font-medium border border-[var(--color-border)]">
                    <p class="m-0">You must be logged in to place a bid</p>
                  </div>
                {/if}
                {#if bidError}
                  <div class="bg-[var(--color-fg)] text-white p-3 mb-4 text-sm font-medium border border-[var(--color-border)]">
                    {bidError}
                  </div>
                {/if}
                <div class="mt-2">
                  <div class="w-full">
                    <label class="label-bh block mb-2">Your Bid Amount</label>
                    <div class="flex flex-col sm:flex-row gap-3">
                      <div class="flex items-center gap-1 border border-[var(--color-border)] p-1 flex-1 min-h-[56px] bg-[var(--color-surface)]">
                        <button
                          class="w-11 h-11 flex items-center justify-center bg-[var(--color-fg)] text-white flex-shrink-0 cursor-pointer border-none transition-colors hover:bg-[var(--color-fg)] disabled:opacity-50 disabled:cursor-not-allowed"
                          onclick={decrementBid}
                          disabled={bidding || bidAmount <= minBid}
                          type="button"
                          aria-label="Decrease bid"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </button>
                        <input
                          type="number"
                          class="bid-amount-input flex-1 text-center font-mono text-xl font-bold text-[var(--color-fg)] border-none bg-transparent outline-none min-w-0 py-1"
                          bind:value={bidAmount}
                          onblur={validateBidAmount}
                          min={minBid}
                          step={bidInterval}
                          disabled={bidding}
                        />
                        <button
                          class="w-11 h-11 flex items-center justify-center bg-[var(--color-fg)] text-white flex-shrink-0 cursor-pointer border-none transition-colors hover:bg-[var(--color-fg)] disabled:opacity-50 disabled:cursor-not-allowed"
                          onclick={incrementBid}
                          disabled={bidding}
                          type="button"
                          aria-label="Increase bid"
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"></polyline>
                          </svg>
                        </button>
                      </div>
                      <button class="btn-bh-red min-h-[56px] px-6 text-sm whitespace-nowrap" onclick={handlePlaceBid} disabled={bidding}>
                        {bidding ? 'Placing Bid...' : 'Place Bid'}
                      </button>
                    </div>
                    <p class="label-bh mt-2 text-[0.7rem]">
                      Minimum bid: {formatPrice(minBid, sellerCurrency)} | Increment: {formatPrice(bidInterval, sellerCurrency)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          {/if}
        {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
          <div class="card-bh p-6 mb-6 text-center hover:transform-none">
            <h3 class="label-bh text-sm mb-4">Auction Ended</h3>
            {#if highestBid}
              <div class="border border-[var(--color-border)] p-4">
                <div class="label-bh mb-2">Winning Bid</div>
                <div class="flex flex-col items-center gap-2 mb-3">
                  <div class="font-mono text-3xl font-black text-[var(--color-fg)]">{formatPrice(highestBid.amount, sellerCurrency)}</div>
                  {#if highestBid.amount > data.product.startingPrice}
                    <div class="badge-bh bg-[var(--color-fg)] text-white flex items-center gap-1 px-2 py-0.5">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 15 12 9 6 15"></polyline>
                      </svg>
                      <span class="font-mono text-xs font-bold">{percentageIncrease}%</span>
                    </div>
                  {/if}
                </div>
                <div class="text-sm text-[var(--color-fg)] font-medium mb-1">Winner: {getBidderName(highestBid)}</div>
                <div class="label-bh text-[0.65rem]">Starting price: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {:else}
              <div class="py-4">
                <div class="text-4xl mb-3">---</div>
                <div class="font-semibold text-[var(--color-fg)] text-lg mb-1">No Winning Bid</div>
                <div class="text-sm text-[var(--color-fg)] opacity-60 mb-2">This auction ended without any bids.</div>
                <div class="label-bh text-[0.65rem]">Starting price was: {formatPrice(data.product.startingPrice, sellerCurrency)}</div>
              </div>
            {/if}
          </div>
        {/if}

        {#if (isHighestBidder || wasOutbid) && !isOwner}
          {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
            {#if isHighestBidder}
              <div class="bg-[var(--color-fg)] text-white p-4 mb-4 flex items-center gap-3 border border-[var(--color-border)] animate-in-fade" class:animate-in={!wasOutbid}>
                <span class="text-2xl">*</span>
                <span class="text-sm font-semibold">{currentBidderMessage || "You're currently the highest bidder!"}</span>
              </div>
            {:else if wasOutbid}
              <div class="bg-[var(--color-fg)] text-white p-4 mb-4 flex items-center gap-3 border border-[var(--color-border)]" class:shake={outbidAnimating}>
                <span class="text-2xl">!</span>
                <span class="text-sm font-semibold">{currentBidderMessage}</span>
              </div>
            {/if}
          {:else if hasAuctionEnded || data.product.status === 'ended' || data.product.status === 'sold'}
            <div class="bg-[var(--color-fg)] text-white p-5 mb-4 border border-[var(--color-border)]">
              <div class="flex items-center gap-3 mb-3">
                <span class="text-2xl">*</span>
                <span class="text-lg font-bold">Congratulations! You won this auction!</span>
              </div>
              <p class="text-sm opacity-90 mb-4">Please contact the seller to arrange payment and delivery.</p>
              <a href="/inbox?product={data.product.id}" class="btn-bh-red w-full text-center block text-sm py-2.5 no-underline">
                Message Seller
              </a>
            </div>
          {/if}
        {/if}

        {#if $authStore.isAuthenticated && isOwner && highestBid && data.product.status === 'sold'}
          <div class="mb-4">
            <a href="/inbox?product={data.product.id}" class="btn-bh-red w-full text-center block text-sm py-3 no-underline">
              Contact Buyer
            </a>
          </div>
        {/if}

        {#if sortedBids.length > 0}
          <div class="mt-6 mb-6">
            <h3 class="label-bh text-sm mb-3">Bid History</h3>
            <div class="flex flex-col gap-2">
              {#each sortedBids.slice(0, 10) as bid, index (bid.id)}
                <div
                  class="bid-history-item flex items-center gap-3 p-3 border relative transition-all duration-100 {index === 0 ? 'bg-[var(--color-fg)] text-white border border-[var(--color-fg)]' : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[var(--color-fg)]'}"
                  class:new-bid={newBidIds.has(bid.id)}
                  style="--rank: {index + 1}; --delay: {index * 0.05}s"
                >
                  {#if newBidIds.has(bid.id)}
                    <div class="absolute top-1.5 right-1.5 badge-bh bg-[var(--color-fg)] text-white text-[0.6rem] px-1.5 py-0.5 z-10">NEW!</div>
                  {/if}
                  <div class="font-mono text-sm font-bold {index === 0 ? 'text-white' : 'text-[var(--color-fg)] opacity-50'} min-w-[28px]">#{index + 1}</div>
                  <div class="flex-1 min-w-0">
                    <div class="font-mono text-sm font-bold {index === 0 ? 'text-white' : 'text-[var(--color-fg)]'}">{formatPrice(bid.amount, sellerCurrency)}</div>
                    <div class="flex gap-2 text-xs {index === 0 ? 'text-white/70' : 'text-[var(--color-fg)] opacity-50'}">
                      <span class="font-semibold">{getBidderName(bid)}</span>
                      <span>{formatDate(bid.bidTime)}</span>
                    </div>
                  </div>
                  {#if index === 0}
                    <div class="badge-bh bg-[var(--color-fg)] text-white text-[0.6rem] px-2 py-0.5 absolute -top-2.5 right-3">HIGHEST BID</div>
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
  <div class="modal-overlay" onclick={cancelBid}>
    <div class="modal-content card-bh p-0" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={cancelBid}>&times;</button>
      <div class="p-6 pb-2 text-center">
        <h2 class="headline-bh text-2xl">Confirm Your Bid</h2>
      </div>
      <div class="px-6 pb-6 text-center">
        <div>
          <p class="font-semibold text-lg text-[var(--color-fg)] mb-4 pb-3 border-b border-[var(--color-border)]">{data.product.title}</p>
          <div class="bg-[var(--color-fg)] p-4 mb-4 border border-[var(--color-border)]">
            <div class="flex justify-between items-center mb-2 text-white">
              <span class="label-bh text-white/70">Your Bid</span>
              <span class="font-mono text-2xl font-black">{formatPrice(bidAmount, sellerCurrency)}</span>
            </div>
            {#if data.product.currentBid}
              <div class="flex justify-between items-center text-white">
                <span class="label-bh text-white/70">Current Highest</span>
                <span class="font-mono text-lg font-bold">{formatPrice(data.product.currentBid, sellerCurrency)}</span>
              </div>
            {:else}
              <div class="flex justify-between items-center text-white">
                <span class="label-bh text-white/70">Starting Price</span>
                <span class="font-mono text-lg font-bold">{formatPrice(data.product.startingPrice, sellerCurrency)}</span>
              </div>
            {/if}
          </div>
          <p class="text-sm text-[var(--color-fg)] opacity-60 mb-4 leading-relaxed">
            Are you sure you want to place this bid? This action cannot be undone.
          </p>
          <div class="bg-[var(--color-surface)] border border-[var(--color-border)] p-3 mb-4 text-left">
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" bind:checked={censorMyName} class="w-5 h-5 accent-[var(--color-fg)]" />
              <span class="text-sm font-semibold text-[var(--color-fg)]">
                Hide my full name (show only initials)
              </span>
            </label>
            <p class="text-xs text-[var(--color-fg)] opacity-50 mt-2 pl-8 italic">
              {censorMyName ? `Your name will appear as: ${censorName($authStore.user?.name || 'Your Name')}` : 'Your full name will be visible in bid history'}
            </p>
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn-bh flex-1 py-3" onclick={cancelBid}>Cancel</button>
          <button class="btn-bh-red flex-1 py-3" onclick={confirmPlaceBid}>Confirm Bid</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Accept Bid Modal -->
{#if showAcceptBidModal && highestBid}
  <div class="modal-overlay">
    <div class="modal-content card-bh p-0">
      <button class="modal-close" onclick={closeAcceptBidModal}>&times;</button>
      <div class="p-6 pb-2 text-center">
        <h2 class="headline-bh text-2xl">Accept Bid & Close Auction</h2>
      </div>
      <div class="px-6 pb-6 text-center">
        {#if acceptSuccess}
          <div class="bg-[var(--color-fg)] text-white p-3 mb-4 text-sm font-semibold border border-[var(--color-border)]">
            Bid accepted! Auction closed. Refreshing...
          </div>
        {/if}
        {#if acceptError}
          <div class="bg-[var(--color-fg)] text-white p-3 mb-4 text-sm font-medium border border-[var(--color-border)]">
            {acceptError}
          </div>
        {/if}
        <div>
          <p class="font-semibold text-lg text-[var(--color-fg)] mb-4 pb-3 border-b border-[var(--color-border)]">{data.product?.title}</p>
          <div class="bg-[var(--color-fg)] p-4 mb-4 border border-[var(--color-border)]">
            <div class="flex justify-between items-center mb-2 text-white">
              <span class="label-bh text-white/70">Winning Bid</span>
              <span class="font-mono text-2xl font-black">{formatPrice(highestBid.amount, sellerCurrency)}</span>
            </div>
            <div class="flex justify-between items-center mb-2 text-white">
              <span class="label-bh text-white/70">Winner</span>
              <span class="font-semibold">{getBidderName(highestBid)}</span>
            </div>
            <div class="flex justify-between items-center text-white">
              <span class="label-bh text-white/70">Bid Time</span>
              <span class="text-sm">{formatDate(highestBid.bidTime)}</span>
            </div>
          </div>
          <div class="bg-[var(--color-fg)] text-white p-3 mb-4 text-sm font-semibold border border-[var(--color-border)]">
            Are you sure you want to accept this bid? This will close the auction and mark the item as SOLD. This action cannot be undone.
          </div>
        </div>
        <div class="flex gap-3">
          <button class="btn-bh flex-1 py-3" onclick={closeAcceptBidModal} disabled={accepting}>Cancel</button>
          <button class="btn-bh-red flex-1 py-3" onclick={confirmAcceptBid} disabled={accepting}>
            {accepting ? 'Accepting...' : 'Accept Bid & Close'}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Success Toast -->
{#if bidSuccess}
  <div class="success-toast">
    <div class="toast-confetti">
      {#each Array(20) as _, i}
        <div class="toast-confetti-piece" style="--i: {i}; --x: {Math.random() * 100}%; --delay: {Math.random() * 0.5}s; --color: {['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff6348', '#1dd1a1', '#667eea', '#f368e0'][i % 8]}"></div>
      {/each}
    </div>
    <div class="flex items-center gap-3 p-4 relative">
      <div class="w-10 h-10 bg-white/25 flex items-center justify-center flex-shrink-0 text-white border border-[var(--color-border)]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="flex flex-col gap-0.5 flex-1">
        <span class="font-bold text-sm text-white">Bid Placed Successfully!</span>
        <span class="text-xs text-white/80">You're now the highest bidder</span>
      </div>
      <button class="w-7 h-7 flex items-center justify-center bg-white/20 text-white border-none cursor-pointer" onclick={closeSuccessAlert} aria-label="Close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
    <div class="toast-progress"></div>
  </div>
{/if}

<!-- Login Modal -->
{#if showLoginModal}
  <div class="modal-overlay" onclick={closeModal}>
    <div class="modal-content card-bh p-0" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeModal}>&times;</button>
      <div class="p-6 pb-2 text-center">
        <h2 class="headline-bh text-2xl">Login Required</h2>
      </div>
      <div class="px-6 pb-6 text-center">
        <p class="text-sm text-[var(--color-fg)] opacity-60 mb-6">You need to be logged in to place a bid on this product.</p>
        <div class="flex gap-3 mb-4">
          <a href="/login?redirect=/products/{data.product?.id}" class="btn-bh flex-1 py-3 text-center no-underline">Login</a>
          <a href="/register?redirect=/products/{data.product?.id}" class="btn-bh-red flex-1 py-3 text-center no-underline">Create Account</a>
        </div>
        <p class="label-bh text-[0.7rem]">Don't have an account? Register now to start bidding!</p>
      </div>
    </div>
  </div>
{/if}

<!-- Edit Product Modal -->
{#if showEditModal}
  <div class="modal-overlay">
    <div class="modal-content card-bh p-0 max-w-[600px]">
      <button class="modal-close" onclick={closeEditModal}>&times;</button>
      <div class="p-6 pb-2 text-center">
        <h2 class="headline-bh text-2xl">Edit Product</h2>
      </div>
      <div class="px-6 pb-6">
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

<!-- Admin Hide/Unhide Confirmation Modal -->
{#if adminModalOpen}
  <div class="modal-overlay" onclick={closeAdminModal}>
    <div class="modal-content card-bh p-0 max-w-[460px]" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeAdminModal}>&times;</button>
      <div class="p-6 pb-2 text-center">
        <h2 class="headline-bh text-xl">{data.product.active ? 'Hide Product' : 'Unhide Product'}</h2>
      </div>
      <div class="px-6 pb-6 text-center">
        <p class="font-semibold text-[var(--color-fg)] mb-2">"{data.product.title}"</p>
        <p class="text-sm text-[var(--color-fg)] opacity-60 mb-6 leading-relaxed">
          {#if data.product.active}
            This item will be hidden from all users and moved to the <strong>Hidden Items</strong> tab. The seller will not be notified.
          {:else}
            This item will be restored and visible to all users again under <strong>Active Auctions</strong>.
          {/if}
        </p>
        <div class="flex gap-3">
          <button class="btn-bh flex-1 py-3" onclick={closeAdminModal} disabled={adminModalLoading}>Cancel</button>
          <button
            class="btn-bh-red flex-1 py-3 {data.product.active ? '' : '!bg-[var(--color-bg)] !border-[var(--color-green)]'}"
            onclick={confirmToggleVisibility}
            disabled={adminModalLoading}
          >
            {#if adminModalLoading}
              <span class="admin-spinner"></span>
              Processing...
            {:else}
              {data.product.active ? 'Hide Product' : 'Unhide Product'}
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<!-- Report Product Modal -->
{#if showReportModal}
  <div class="modal-overlay" onclick={closeReportModal}>
    <div class="modal-content card-bh p-0 max-w-[480px]" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeReportModal}>&times;</button>
      <div class="p-6 pb-2">
        <h2 class="headline-bh text-xl">Report Product</h2>
      </div>
      <div class="px-6 pb-6">
        {#if reportSuccess}
          <div class="text-center py-4">
            <p class="text-sm text-[var(--color-fg)] opacity-60 mb-4">Thank you for your report. Our team will review it shortly.</p>
            <button class="btn-bh-red px-6 py-2" onclick={closeReportModal}>Done</button>
          </div>
        {:else}
          <p class="italic text-sm text-[var(--color-fg)] opacity-50 mb-4">"{data.product.title}"</p>
          <label class="label-bh block mb-1.5" for="report-reason">Reason</label>
          <select id="report-reason" class="input-bh mb-4" bind:value={reportReason}>
            <option value="" disabled>Select a reason...</option>
            <option value="spam">Spam</option>
            <option value="inappropriate">Inappropriate Content</option>
            <option value="scam">Scam</option>
            <option value="counterfeit">Counterfeit</option>
            <option value="other">Other</option>
          </select>
          <label class="label-bh block mb-1.5" for="report-description">Details (optional)</label>
          <textarea
            id="report-description"
            class="input-bh mb-4 resize-y min-h-[100px]"
            bind:value={reportDescription}
            placeholder="Provide additional details..."
            maxlength="1000"
            rows="4"
          ></textarea>
          {#if reportError}
            <p class="text-[var(--color-red)] text-sm font-semibold mb-3">{reportError}</p>
          {/if}
          <div class="flex gap-3 justify-end">
            <button class="btn-bh px-4 py-2" onclick={closeReportModal} disabled={submittingReport}>Cancel</button>
            <button class="btn-bh-red px-4 py-2" onclick={submitReport} disabled={submittingReport}>
              {#if submittingReport}
                Submitting...
              {:else}
                Submit Report
              {/if}
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ══════════════════════════════════════════════════
     PRODUCT DETAIL — Dual Design System Styles
     Light: Newsprint  |  Dark: Linear/Modern
     ══════════════════════════════════════════════════ */

  /* (responsive layout handled by Tailwind utility classes in template) */

  /* SVG chart styles */
  .grid-line {
    stroke: var(--color-border);
    stroke-width: 0.2;
  }
  .price-area {
    fill: url(#price-gradient);
    opacity: 0.2;
  }
  .price-line {
    fill: none;
    stroke: var(--color-fg);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .data-point {
    fill: var(--color-fg);
    stroke: var(--color-bg);
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }
  .data-point.first-point {
    fill: var(--color-fg);
  }
  .data-point.last-point {
    fill: var(--color-fg);
    r: 2;
  }

  /* Modal overlay */
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
    animation: fadeIn 100ms ease-out;
    overflow-y: auto;
    padding: 1rem;
  }
  /* dark mode handled by CSS variables */

  .modal-content {
    max-width: 500px;
    width: 90%;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    position: relative;
    animation: slideUp 100ms ease-out;
    margin: auto;
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: 1px solid var(--color-border);
    font-size: 1.5rem;
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
    transition: all 100ms ease-out;
    z-index: 10;
    border-radius: 0;
  }
  .modal-close:hover {
    opacity: 1;
    background: var(--color-surface);
  }

  /* Confetti animation */
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

  /* Success Toast */
  .success-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10000;
    background: var(--color-fg);
    border: 1px solid var(--color-border);
    overflow: hidden;
    animation: toastSlideIn 100ms ease-out;
    min-width: 320px;
    max-width: 400px;
    border-radius: 0;
  }

  .toast-confetti {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  }
  .toast-confetti-piece {
    position: absolute;
    width: 8px;
    height: 8px;
    background: var(--color);
    left: var(--x);
    top: -10px;
    animation: confettiFall 2s ease-out var(--delay) forwards;
    opacity: 0;
  }
  .toast-confetti-piece:nth-child(odd) {
    width: 6px;
    height: 6px;
  }

  .toast-progress {
    height: 3px;
    background: rgba(255, 255, 255, 0.2);
  }
  .toast-progress::after {
    content: '';
    display: block;
    height: 100%;
    background: rgba(255, 255, 255, 0.7);
    animation: toastProgress 5s linear forwards;
  }

  /* Price animation */
  .price-animate {
    animation: priceChange 0.8s ease-out;
  }
  .label-pulse {
    animation: labelPulse 0.6s ease-out;
  }

  /* Bid history new-bid highlight */
  .bid-history-item.new-bid {
    animation: newBidHighlight 2s ease-out;
  }

  /* Animate in fade */
  .animate-in-fade {
    animation: swissFadeIn 100ms ease-out;
  }

  /* Shake for outbid */
  .shake {
    animation: shakeAlert 0.5s ease-in-out;
  }

  /* Admin spinner */
  .admin-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50% !important;
    animation: adminSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  /* Number input: hide spinners */
  .bid-amount-input::-webkit-inner-spin-button,
  .bid-amount-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  .bid-amount-input[type=number] {
    -moz-appearance: textfield;
  }

  /* Mobile modal adjustments */
  @media (max-width: 768px) {
    .modal-overlay {
      align-items: flex-start;
      padding: 0.5rem;
    }
    .modal-content {
      width: 100%;
      max-height: calc(100vh - 1rem);
      margin-top: 0.5rem;
    }
    .success-toast {
      top: 1rem;
      right: 1rem;
      left: 1rem;
      min-width: auto;
      max-width: none;
    }
  }

  /* -- Keyframes -- */
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes slideUp {
    from { transform: translateY(50px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  @keyframes toastSlideIn {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes toastProgress {
    from { width: 100%; }
    to { width: 0%; }
  }
  @keyframes confettiFall {
    0% { opacity: 1; top: -10px; transform: rotate(var(--rotation)) translateY(0); }
    100% { opacity: 0; top: 100%; transform: rotate(calc(var(--rotation) + 360deg)) translateY(100px); }
  }
  @keyframes priceChange {
    0% { opacity: 0.5; }
    100% { opacity: 1; }
  }
  @keyframes labelPulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
  @keyframes newBidHighlight {
    0% { background: var(--color-fg); opacity: 0; }
    20% { opacity: 1; }
    100% { opacity: 1; }
  }
  @keyframes swissFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes shakeAlert {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-4px); }
    40% { transform: translateX(4px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
  }
  @keyframes adminSpin {
    to { transform: rotate(360deg); }
  }

</style>
