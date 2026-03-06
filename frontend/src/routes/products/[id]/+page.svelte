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
      (window as any).__sseUnsubscribe = unsubscribe;
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
    if ((window as any).__sseUnsubscribe) {
      (window as any).__sseUnsubscribe();
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

      const result = await response.json();

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
  <div class="error">
    <h1>Product Not Found</h1>
    <p>The product you're looking for doesn't exist.</p>
    <a href={backLink}>{backLinkText}</a>
  </div>
{:else}
  <div class="product-detail">
    <div class="product-header">
      <a href={backLink} class="back-link">&larr; {backLinkText}</a>
    </div>

    <div class="product-content">
      <div class="product-gallery">
        <div class="title-container">
          <h1>{data.product.title}</h1>
          <div class="title-badges">
            <div class="status-badge status-{data.product.status}">
              {data.product.status}
            </div>
            {#if $authStore.isAuthenticated && $watchlistStore.loaded}
              <WatchlistToggle productId={data.product.id} size="lg" />
            {/if}
            <div
              class="live-indicator"
              class:updating={isUpdating}
              class:connected={connectionStatus === 'connected'}
              title="Real-time updates active (SSE + fallback polling)"
            >
              <span class="live-dot"></span>
              <span class="live-text">LIVE</span>
            </div>
          </div>
        </div>

        {#if isOwner || $authStore.user?.role === 'admin' || ($authStore.isAuthenticated && !isOwner)}
          <div class="product-actions">
            {#if isOwner}
              <button class="action-btn action-edit" onclick={openEditModal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit
              </button>
            {/if}
            {#if $authStore.user?.role === 'admin'}
              <button
                class="action-btn {data.product.active ? 'action-hide' : 'action-show'}"
                onclick={openAdminModal}
              >
                {#if data.product.active}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  Hide
                {:else}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Show
                {/if}
              </button>
            {/if}
            {#if $authStore.isAuthenticated && !isOwner}
              <button class="action-btn action-report" onclick={openReportModal}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
                Report
              </button>
            {/if}
          </div>
        {/if}

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
                    <stop offset="0%" style="stop-color:#FF3000;stop-opacity:0.5" />
                    <stop offset="100%" style="stop-color:#FF3000;stop-opacity:0" />
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
          <div class="seller-card">
            <div class="seller-header">
              <div class="seller-avatar">
                {#if data.product.seller?.profilePicture && typeof data.product.seller.profilePicture === 'object' && data.product.seller.profilePicture.url}
                  <img src={data.product.seller.profilePicture.url} alt={data.product.seller.name} class="seller-avatar-img" />
                {:else}
                  {data.product.seller?.name?.charAt(0)?.toUpperCase() || '?'}
                {/if}
              </div>
              <div class="seller-details">
                <a href="/users/{data.product.seller?.id}" class="seller-name">
                  {data.product.seller?.name || 'Unknown'}
                </a>
                {#if data.product.seller?.createdAt}
                  <span class="member-since">Member since {new Date(data.product.seller.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                {/if}
              </div>
            </div>

            <div class="seller-stats">
              {#if loadingSellerData}
                <div class="loading-stats">Loading...</div>
              {:else}
                <div class="stat-item">
                  <span class="stat-title">Seller</span>
                  <div class="stat-rating">
                    <StarRating rating={sellerRatingStats?.asSeller?.averageRating || 0} size="small" />
                    <span class="stat-value">{(sellerRatingStats?.asSeller?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="stat-label">{sellerRatingStats?.asSeller?.totalRatings || 0} rating{(sellerRatingStats?.asSeller?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                  <span class="stat-title">Buyer</span>
                  <div class="stat-rating">
                    <StarRating rating={sellerRatingStats?.asBuyer?.averageRating || 0} size="small" />
                    <span class="stat-value">{(sellerRatingStats?.asBuyer?.averageRating || 0).toFixed(1)}</span>
                  </div>
                  <span class="stat-label">{sellerRatingStats?.asBuyer?.totalRatings || 0} rating{(sellerRatingStats?.asBuyer?.totalRatings || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div class="stat-divider"></div>
                <div class="stat-item">
                  <span class="stat-value">{sellerCompletedSales}</span>
                  <span class="stat-label">sale{sellerCompletedSales !== 1 ? 's' : ''}</span>
                </div>
              {/if}
            </div>

            {#if data.product.region || data.product.city}
              <div class="seller-location">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>{data.product.city}{data.product.city && data.product.region ? ', ' : ''}{data.product.region}</span>
              </div>
            {/if}

            {#if data.product.categories && data.product.categories.length > 0}
              <div class="category-badges">
                {#each data.product.categories as categoryValue}
                  <a href="/products?category={categoryValue}" class="category-badge">
                    {getCategoryLabel(categoryValue)}
                  </a>
                {/each}
              </div>
            {/if}

            <a href="/users/{data.product.seller?.id}" class="view-profile-btn">View Profile</a>
          </div>
        </div>
      </div>

      <div class="product-details">
        {#if !data.product.active}
          <div class="inactive-warning">
            <span class="warning-icon">⚠️</span>
            <span>This product is currently inactive and hidden from Browse Products</span>
          </div>
        {/if}

        {#if !isOwner && !hasAuctionEnded && data.product.status !== 'sold'}
          <div class="price-info">
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

            {#if data.product.currentBid && !hasAuctionEnded && data.product.status !== 'ended' && data.product.status !== 'sold'}
              <div class="highest-bid-container" class:expanded={bidSectionOpen && !isOwner}>
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
                {#if !isOwner}
                  <button class="bid-toggle-pill" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span class="pill-text">{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class:chevron-up={bidSectionOpen}>
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </button>
                {/if}
              </div>
            {:else if !hasAuctionEnded && data.product.status !== 'ended'}
              <div class="highest-bid-container" class:expanded={bidSectionOpen && !isOwner}>
                <div class="highest-bid-header">
                  <div class="highest-bid-label">STARTING BID</div>
                </div>
                <div class="highest-bid-amount">{formatPrice(data.product.startingPrice, sellerCurrency)}</div>
                <div class="starting-price-small">No bids yet - be the first!</div>
                {#if !isOwner}
                  <button class="bid-toggle-pill" onclick={() => bidSectionOpen = !bidSectionOpen} aria-label={bidSectionOpen ? 'Hide bid form' : 'Show bid form'}>
                    <span class="pill-text">{bidSectionOpen ? 'Close' : 'Place Bid'}</span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class:chevron-up={bidSectionOpen}>
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

                <button class="accept-bid-btn" onclick={openAcceptBidModal}>
                  ✓ Accept Bid & Close Auction
                </button>
              {:else}
                <div class="info-message">
                  <p>No bids yet. Waiting for bidders...</p>
                </div>
              {/if}
            </div>
          {:else}
            <!-- Bidder view - Place Bid section (collapsible) -->
            <div class="bid-section" class:bid-section-open={bidSectionOpen} class:bid-section-closed={!bidSectionOpen}>
              <div class="bid-section-content">
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
                          onclick={decrementBid}
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
                          onblur={validateBidAmount}
                          min={minBid}
                          step={bidInterval}
                          disabled={bidding}
                        />
                        <button
                          class="bid-arrow-btn"
                          onclick={incrementBid}
                          disabled={bidding}
                          type="button"
                          aria-label="Increase bid"
                        >
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="18 15 12 9 6 15"></polyline>
                          </svg>
                        </button>
                      </div>
                      <button class="place-bid-btn" onclick={handlePlaceBid} disabled={bidding}>
                        {bidding ? 'Placing Bid...' : 'Place Bid'}
                      </button>
                    </div>
                    <p class="bid-hint">
                      Minimum bid: {formatPrice(minBid, sellerCurrency)} • Increment: {formatPrice(bidInterval, sellerCurrency)}
                    </p>
                  </div>
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

        {#if (isHighestBidder || wasOutbid) && !isOwner}
          {#if (data.product.status === 'active' || data.product.status === 'available') && !hasAuctionEnded}
            <!-- Active auction - bidder status alert -->
            {#if isHighestBidder}
              <div class="highest-bidder-alert" class:animate-in={!wasOutbid}>
                <span class="alert-icon">👑</span>
                <span class="alert-text">{currentBidderMessage || "You're currently the highest bidder!"}</span>
              </div>
            {:else if wasOutbid}
              <div class="outbid-alert" class:shake={outbidAnimating}>
                <span class="alert-icon">😰</span>
                <span class="alert-text">{currentBidderMessage}</span>
              </div>
            {/if}
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
  <div class="modal-overlay" onclick={cancelBid}>
    <div class="modal-content confirm-modal" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={cancelBid}>&times;</button>

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
          <button class="btn-cancel-bid" onclick={cancelBid}>
            Cancel
          </button>
          <button class="btn-confirm-bid" onclick={confirmPlaceBid}>
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
      <button class="modal-close" onclick={closeAcceptBidModal}>&times;</button>

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
          <button class="btn-cancel-bid" onclick={closeAcceptBidModal} disabled={accepting}>
            Cancel
          </button>
          <button class="btn-accept-bid" onclick={confirmAcceptBid} disabled={accepting}>
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
    <div class="toast-content">
      <div class="toast-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <div class="toast-text">
        <span class="toast-title">Bid Placed Successfully!</span>
        <span class="toast-subtitle">You're now the highest bidder</span>
      </div>
      <button class="toast-close" onclick={closeSuccessAlert} aria-label="Close">
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
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="modal-close" onclick={closeModal}>&times;</button>

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
      <button class="modal-close" onclick={closeEditModal}>&times;</button>

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

<!-- Admin Hide/Unhide Confirmation Modal -->
{#if adminModalOpen}
  <div class="admin-modal-overlay" onclick={closeAdminModal}>
    <div class="admin-modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="admin-modal-close" onclick={closeAdminModal}>&times;</button>

      <div class="admin-modal-header">
        <h2>{data.product.active ? 'Hide Product' : 'Unhide Product'}</h2>
      </div>

      <div class="admin-modal-body">
        <p class="admin-modal-product-title">"{data.product.title}"</p>
        <p class="admin-modal-description">
          {#if data.product.active}
            This item will be hidden from all users and moved to the <strong>Hidden Items</strong> tab. The seller will not be notified.
          {:else}
            This item will be restored and visible to all users again under <strong>Active Auctions</strong>.
          {/if}
        </p>

        <div class="admin-modal-actions">
          <button class="btn-admin-cancel" onclick={closeAdminModal} disabled={adminModalLoading}>
            Cancel
          </button>
          <button
            class="btn-admin-confirm {data.product.active ? 'btn-admin-hide' : 'btn-admin-unhide'}"
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
  <div class="report-modal-overlay" onclick={closeReportModal}>
    <div class="report-modal-content" onclick={(e) => e.stopPropagation()}>
      <button class="report-modal-close" onclick={closeReportModal}>&times;</button>

      <div class="report-modal-header">
        <h2>Report Product</h2>
      </div>

      <div class="report-modal-body">
        {#if reportSuccess}
          <div class="report-success">
            <p>Thank you for your report. Our team will review it shortly.</p>
            <button class="btn-report-done" onclick={closeReportModal}>Done</button>
          </div>
        {:else}
          <p class="report-modal-product-title">"{data.product.title}"</p>

          <label class="report-label" for="report-reason">Reason</label>
          <select id="report-reason" class="report-select" bind:value={reportReason}>
            <option value="" disabled>Select a reason...</option>
            <option value="spam">Spam</option>
            <option value="inappropriate">Inappropriate Content</option>
            <option value="scam">Scam</option>
            <option value="counterfeit">Counterfeit</option>
            <option value="other">Other</option>
          </select>

          <label class="report-label" for="report-description">Details (optional)</label>
          <textarea
            id="report-description"
            class="report-textarea"
            bind:value={reportDescription}
            placeholder="Provide additional details..."
            maxlength="1000"
            rows="4"
          ></textarea>

          {#if reportError}
            <p class="report-error">{reportError}</p>
          {/if}

          <div class="report-modal-actions">
            <button class="btn-report-cancel" onclick={closeReportModal} disabled={submittingReport}>
              Cancel
            </button>
            <button class="btn-report-submit" onclick={submitReport} disabled={submittingReport}>
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
  .error {
    text-align: center;
    padding: 4rem 2rem;
  }

  .error a {
    color: var(--color-blue);
    text-decoration: none;
  }

  .product-detail {
    max-width: 1200px;
    margin: 0 auto;
    border: 1px solid var(--color-border);
    box-shadow: none;
    padding: 2rem;
    border-radius: var(--radius-lg);
  }

  .product-header {
    margin-bottom: 0.75rem;
    display: flex;
    align-items: center;
  }

  .back-link {
    color: var(--color-fg);
    text-decoration: none;
    font-size: 0.9rem;
    opacity: 0.5;
    transition: opacity 150ms ease;
  }

  .back-link:hover {
    opacity: 1;
  }

  .product-actions {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
    flex-wrap: wrap;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-fg);
    opacity: 0.65;
    transition: all 150ms ease;
    border-radius: var(--radius-sm);
  }

  .action-btn:hover {
    opacity: 1;
  }

  .action-btn svg {
    flex-shrink: 0;
  }

  .action-edit:hover {
    border-color: var(--color-blue);
    color: var(--color-blue);
  }

  .action-hide:hover {
    border-color: #dc2626;
    color: #dc2626;
  }

  .action-show:hover {
    border-color: #16a34a;
    color: #16a34a;
  }

  .action-report:hover {
    border-color: #f59e0b;
    color: #f59e0b;
  }

  .product-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3rem;
    margin-bottom: 3rem;
  }

  /* Tablet breakpoint for bid controls */
  @media (max-width: 1024px) {
    .bid-amount-input {
      font-size: clamp(1.1rem, 3.5vw, 1.5rem) !important;
    }

    .bid-arrow-btn {
      width: 40px;
      height: 40px;
    }

    .bid-arrow-btn svg {
      width: 20px;
      height: 20px;
    }

    .bid-control {
      padding: 0.375rem;
      gap: 0.375rem;
    }
  }

  @media (max-width: 768px) {
    .product-detail {
      padding: 0.75rem 0;
      border: none !important;
      box-shadow: none !important;
      max-width: none;
      margin-left: -1rem;
      margin-right: -1rem;
      padding-left: 1rem;
      padding-right: 1rem;
    }

    .product-header {
      margin-bottom: 0.4rem;
    }

    .back-link {
      font-size: 0.85rem;
    }

    .product-actions {
      margin-bottom: 0.75rem;
    }

    .product-content {
      grid-template-columns: 1fr;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .title-container {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.4rem;
      margin-bottom: 0.5rem;
    }

    .title-container h1 {
      font-size: 1.3rem;
      width: 100%;
    }

    .title-badges {
      padding-top: 0;
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

    .bid-section-closed:not(.owner-section) {
      padding: 0 1rem;
    }

    .bid-section-open:not(.owner-section) {
      padding: 1rem;
    }

    .bid-section-header h3 {
      font-size: 1.25rem;
    }

    .bid-toggle-pill {
      padding: 0.5rem 1rem;
      margin-top: 0.5rem;
      font-size: 0.85rem;
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
      font-size: 1.3rem;
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
      padding: 1rem;
      min-height: auto;
    }

    .status-badge {
      padding: 0.3rem 0.75rem;
      font-size: 0.8rem;
      margin-bottom: 0.75rem;
    }

    .description-section,
    .seller-info {
      margin-bottom: 1rem;
    }

    .description-section h3,
    .seller-info h3 {
      margin-bottom: 0.5rem;
      font-size: 1rem;
    }
  }

  .product-gallery h1 {
    font-size: 2.5rem;
    margin-top: 0;
    margin-bottom: 1rem;
    color: var(--color-fg);
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.6rem;
    font-weight: 700;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    margin: 0;
  }

  .status-active {
    background-color: var(--color-blue);
    color: white;
  }

  .status-ended {
    background-color: var(--color-red);
    color: white;
  }

  .status-sold {
    background-color: var(--color-red);
    color: white;
  }

  .status-available {
    background-color: var(--color-blue);
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
    transition: opacity 150ms ease-out;
  }

  .bid-section-header-btn:hover {
    opacity: 0.8;
  }

  .bid-section-header-btn h3 {
    margin: 0;
    color: var(--color-fg);
    font-size: 1.5rem;
    text-align: left;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .accordion-arrow {
    transition: transform 150ms ease-out;
    color: var(--color-red);
  }

  .accordion-arrow.open {
    transform: rotate(180deg);
  }

  .countdown-timer-inline {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(239, 68, 68, 0.15);
    padding: 0.75rem 1.25rem;
    border: 1px solid var(--color-red);
    border-radius: var(--radius-md);
  }

  .countdown-timer-inline .countdown-label {
    color: var(--color-red);
    font-size: 0.875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-inline .countdown-time {
    color: var(--color-fg);
    font-size: 1.5rem;
    font-weight: 900;
    font-family: 'Courier New', monospace;
    letter-spacing: 1.5px;
  }

  .price-info {
    background: var(--color-surface);
    padding: 2rem;
    margin-bottom: 1.5rem;
    text-align: center;
    border: 1px solid var(--color-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 220px;
    position: relative;
    border-radius: var(--radius-lg);
  }

  .highest-bid-container {
    color: var(--color-fg);
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
    color: var(--color-muted-fg);
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
    background: rgba(239, 68, 68, 0.15);
    padding: 0.75rem 1.25rem;
    font-size: 0.875rem;
    font-weight: 700;
    border: 1px solid var(--color-red);
    margin: 0;
    z-index: 10;
    border-radius: var(--radius-sm);
  }

  .countdown-timer-badge .countdown-label {
    color: var(--color-red);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .countdown-timer-badge .countdown-time {
    color: var(--color-fg);
    font-weight: 900;
    letter-spacing: 1px;
    font-family: 'Courier New', monospace;
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
    color: var(--color-fg);
    margin-bottom: 0;
  }

  .percentage-increase {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 1rem;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
  }

  .arrow-up-icon {
    color: var(--color-accent);
    flex-shrink: 0;
  }

  .percentage-text {
    font-size: 1.25rem;
    font-weight: 900;
    color: var(--color-accent);
    letter-spacing: 0.5px;
  }

  /* Removed: percentageBounce, percentageGlow, arrowBounce — Swiss flat style */

  .starting-price-small {
    font-size: 0.95rem;
    color: var(--color-muted-fg);
    font-weight: 500;
  }

  /* Inactive Warning Banner */
  .inactive-warning {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-fg);
    padding: 1rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-weight: 600;
    border: 1px solid var(--color-red);
    border-radius: var(--radius-lg);
  }

  .warning-icon {
    font-size: 1.5rem;
  }

  /* Sold Info Styles */
  .sold-info {
    background: var(--color-surface) !important;
    border-color: var(--color-blue) !important;
  }

  .sold-badge {
    font-size: 1.2rem;
    font-weight: 900;
    letter-spacing: 3px;
    margin-bottom: 0.75rem;
    color: var(--color-blue);
    background-color: rgba(59, 130, 246, 0.15);
    padding: 0.5rem 1.5rem;
    display: inline-block;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-sm);
  }

  .sold-to-info {
    font-size: 1.1rem;
    font-weight: 600;
    margin-top: 0.75rem;
    color: var(--color-muted-fg);
  }

  /* Highest Bidder Alert */
  .highest-bidder-alert {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid var(--color-accent);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    color: var(--color-fg);
    border-radius: var(--radius-lg);
  }

  .alert-icon {
    font-size: 2rem;
  }

  .alert-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-fg);
    letter-spacing: 0.5px;
  }

  /* Animate in effect for highest bidder — Swiss: simple fade */
  .highest-bidder-alert.animate-in {
    animation: swissFadeIn 150ms ease-out;
  }

  @keyframes swissFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  /* Outbid Alert */
  .outbid-alert {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--color-red);
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    border-radius: var(--radius-lg);
  }

  .outbid-alert .alert-icon {
    font-size: 2rem;
  }

  .outbid-alert .alert-text {
    color: var(--color-fg);
    flex: 1;
  }

  .outbid-alert.shake {
    animation: shakeAlert 0.5s ease-in-out;
  }

  /* Removed: outbidPulse, shakeAlert, panicShake — Swiss flat style */

  /* Winner Alert */
  .winner-alert {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid var(--color-blue);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border-radius: var(--radius-lg);
  }

  .winner-alert-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .winner-alert-header .alert-icon {
    font-size: 2.5rem;
  }

  .winner-alert-header .alert-text {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--color-fg);
    letter-spacing: 0.5px;
  }

  .winner-alert-message {
    color: var(--color-muted-fg);
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
    background: var(--color-blue);
    color: white;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.125rem;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
  }

  .winner-message-btn:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .bid-section {
    background-color: var(--color-muted);
    padding: 1.5rem;
    margin-bottom: 2rem;
    display: flex;
    flex-direction: column;
    transition: all 150ms ease-out;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  /* Collapsible bid section styles */
  .bid-section:not(.owner-section) {
    overflow: hidden;
    transition: max-height 150ms ease-out, opacity 150ms ease-out, padding 150ms ease-out, margin 150ms ease-out;
    margin-top: -8px;
  }

  .bid-section-closed:not(.owner-section) {
    max-height: 0;
    opacity: 0;
    padding: 0 1.5rem;
    margin-bottom: 0;
    pointer-events: none;
  }

  .bid-section-open:not(.owner-section) {
    max-height: 500px;
    opacity: 1;
    padding: 1.5rem;
  }

  .bid-section-content {
    display: flex;
    flex-direction: column;
  }

  /* Pill toggle button */
  .bid-toggle-pill {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 0.5rem;
    width: auto;
    margin: 0.75rem auto 0;
    padding: 0.625rem 1.25rem;
    background: var(--color-blue);
    border: 1px solid var(--color-border);
    cursor: pointer;
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
    transition: background 150ms ease-out, color 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .bid-toggle-pill:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .bid-toggle-pill:active {
    opacity: 0.9;
  }

  .bid-toggle-pill .pill-text {
    letter-spacing: 0.02em;
  }

  .bid-toggle-pill svg {
    transition: transform 150ms ease-out;
  }

  .bid-toggle-pill svg.chevron-up {
    transform: rotate(180deg);
  }

  /* Expanded highest-bid-container styling */
  .highest-bid-container.expanded {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    margin-bottom: 0;
  }

  .auction-ended-section {
    background: var(--color-muted);
    padding: 2rem;
    margin-bottom: 2rem;
    text-align: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .ended-header h3 {
    font-size: 1.5rem;
    color: var(--color-fg);
    margin-bottom: 1.5rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .winner-info {
    background: var(--color-surface);
    padding: 1.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .winner-label {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
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
    color: var(--color-blue);
  }

  .winner-percentage-increase {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--color-blue);
    color: white;
    padding: 0.375rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 600;
    border: 1px solid var(--color-border);
  }

  .winner-percentage-increase .arrow-up-icon {
    width: 16px;
    height: 16px;
    stroke-width: 3;
  }

  .winner-bidder {
    font-size: 1.125rem;
    color: var(--color-fg);
    font-weight: 500;
    margin-bottom: 0.5rem;
  }

  .starting-price-note {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
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
    color: var(--color-red);
    margin-bottom: 0.5rem;
  }

  .no-winner-desc {
    font-size: 1rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .contact-section {
    margin-bottom: 2rem;
  }

  .contact-btn {
    display: block;
    width: 100%;
    padding: 1rem;
    background: var(--color-red);
    color: white;
    text-align: center;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .contact-btn:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .bid-form {
    margin-top: 1rem;
    animation: slideDown 150ms ease-out;
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
    color: var(--color-fg);
  }

  .bid-control {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    padding: 0.5rem;
    flex: 1;
    min-height: 64px;
    min-width: 0;
    overflow: hidden;
    border-radius: var(--radius-md);
  }

  .bid-arrow-btn {
    background: var(--color-blue);
    color: white;
    border: 1px solid var(--color-border);
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 150ms ease-out;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
  }

  .bid-arrow-btn:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .bid-arrow-btn:active:not(:disabled) {
    opacity: 0.8;
  }

  .bid-arrow-btn:disabled {
    background: var(--color-muted);
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
    color: var(--color-blue);
    padding: 0.5rem;
  }

  .bid-amount-input {
    flex: 1;
    text-align: center;
    font-size: clamp(1.25rem, 4vw, 1.75rem);
    font-weight: 700;
    color: var(--color-blue);
    padding: 0.25rem;
    border: none;
    background: transparent;
    outline: none;
    width: 100%;
    min-width: 0;
  }

  .bid-amount-input:focus {
    color: var(--color-blue);
    background: var(--color-muted);
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
    color: var(--color-fg);
    opacity: 0.7;
    font-weight: 500;
  }

  .place-bid-btn {
    padding: 0 2.5rem;
    font-size: 1.1rem;
    font-weight: 700;
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    white-space: nowrap;
    min-height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-md);
  }

  .place-bid-btn:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .place-bid-btn:disabled {
    background: var(--color-muted);
    color: var(--color-fg);
    cursor: not-allowed;
    transform: none;
  }

  .success-message {
    background-color: rgba(59, 130, 246, 0.1);
    color: var(--color-fg);
    padding: 1rem;
    margin-bottom: 1rem;
    animation: slideDown 150ms ease-out;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
  }

  .error-message {
    background-color: rgba(239, 68, 68, 0.1);
    color: var(--color-fg);
    padding: 1rem;
    margin-bottom: 1rem;
    animation: slideDown 150ms ease-out;
    border: 1px solid var(--color-red);
    border-radius: var(--radius-md);
  }

  .info-message {
    background-color: rgba(59, 130, 246, 0.1);
    color: var(--color-fg);
    padding: 1rem;
    margin-bottom: 1rem;
    text-align: center;
    animation: slideDown 150ms ease-out;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
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
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Seller Card Styles */
  .seller-card {
    background: var(--color-muted);
    padding: 1.25rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .seller-header {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    margin-bottom: 1rem;
  }

  .seller-avatar {
    width: 48px;
    height: 48px;
    background: var(--color-blue);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: 600;
    font-size: 1.25rem;
    border: 1px solid var(--color-border);
    overflow: hidden;
    flex-shrink: 0;
  }

  .seller-avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .seller-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .seller-name {
    font-weight: 600;
    color: var(--color-fg);
    text-decoration: none;
    font-size: 1.1rem;
  }

  .seller-name:hover {
    color: var(--color-blue);
  }

  .member-since {
    font-size: 0.8rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .seller-stats {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.875rem 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
    margin-bottom: 1rem;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .stat-rating {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .stat-value {
    font-weight: 600;
    font-size: 1.1rem;
    color: var(--color-fg);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .stat-title {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--color-blue);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-divider {
    width: 2px;
    height: 40px;
    background: var(--color-border);
  }

  .loading-stats {
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    padding: 0.5rem 0;
  }

  .seller-location {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.85rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1rem;
  }

  .seller-location svg {
    color: var(--color-red);
  }

  .category-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .category-badge {
    display: inline-block;
    background: var(--color-blue, #2563eb);
    color: white;
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    font-weight: 700;
    border: 1px solid var(--color-blue, #2563eb);
    text-decoration: none;
    transition: all 150ms ease-out;
  }

  .category-badge:hover {
    background: var(--color-red);
    border-color: var(--color-red);
  }

  .view-profile-btn {
    display: block;
    width: 100%;
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    text-align: center;
    color: var(--color-fg);
    font-weight: 500;
    text-decoration: none;
    transition: all 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .view-profile-btn:hover {
    background: var(--color-blue);
    border-color: var(--color-border);
    color: white;
  }

  /* Price Analytics */
  .price-analytics {
    margin-bottom: 2rem;
  }

  .price-analytics h3 {
    margin-top: 0;
    margin-bottom: 1rem;
    font-size: 1.3rem;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .chart-container {
    padding: 1.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .price-chart {
    width: 100%;
    height: 200px;
    margin-bottom: 1rem;
  }

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
    stroke: var(--color-red);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }

  .data-point {
    fill: var(--color-red);
    stroke: var(--color-surface);
    stroke-width: 0.5;
    vector-effect: non-scaling-stroke;
  }

  .data-point.first-point {
    fill: var(--color-blue);
  }

  .data-point.last-point {
    fill: var(--color-red);
    r: 2;
  }

  .chart-labels {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
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
    color: var(--color-fg);
    opacity: 0.6;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }

  .label-value {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--color-red);
  }

  .label-left .label-value {
    color: var(--color-blue);
  }

  .label-right .label-value {
    color: var(--color-red);
  }

  .label-center .label-title {
    color: var(--color-blue);
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
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.1em;
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
    background-color: var(--color-muted);
    border: 1px solid var(--color-border);
    transition: all 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .bid-history-item:hover {
    border-color: var(--color-red);
  }

  /* Top ranked bid styling — Swiss red accent */
  .bid-history-item.rank-1 {
    background: var(--color-red);
    border: 1px solid var(--color-border);
    position: relative;
    color: white;
  }

  .bid-history-item.rank-1:hover {
    border-color: var(--color-fg);
  }

  .bid-rank {
    font-size: calc(1rem * var(--scale));
    font-weight: 700;
    color: var(--color-blue);
    min-width: calc(35px * var(--scale));
  }

  .bid-history-item.rank-1 .bid-rank {
    color: white;
    font-size: calc(1.2rem * var(--scale));
  }

  .bid-info {
    flex: 1;
  }

  .bid-amount {
    font-size: calc(1.3rem * var(--scale));
    font-weight: 700;
    color: var(--color-fg);
    margin-bottom: calc(0.25rem * var(--scale));
  }

  .bid-details {
    display: flex;
    gap: 1rem;
    font-size: calc(0.9rem * var(--scale));
    color: var(--color-fg);
    opacity: 0.7;
  }

  .bidder-name {
    font-weight: 600;
  }

  .bid-time {
    opacity: 0.8;
  }

  .bid-history-item.rank-1 .bid-amount {
    color: white;
    font-weight: 900;
  }

  .bid-history-item.rank-1 .bidder-name {
    color: white;
  }

  .highest-badge {
    position: absolute;
    top: -0.75rem;
    right: 1rem;
    background: var(--color-red);
    color: white;
    padding: 0.375rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.5px;
    border: 1px solid var(--color-border);
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
    animation: fadeIn 150ms ease-out;
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
    background-color: var(--color-surface);
    max-width: 500px;
    width: 90%;
    max-height: calc(100vh - 2rem);
    overflow-y: auto;
    border: 1px solid var(--color-border);
    position: relative;
    animation: slideUp 150ms ease-out;
    margin: auto;
    border-radius: var(--radius-lg);
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
    border: 1px solid var(--color-border);
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
    transition: all 150ms ease-out;
  }

  .modal-close:hover {
    background-color: var(--color-muted);
    color: var(--color-fg);
    opacity: 1;
  }

  .modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 1.75rem;
    color: var(--color-fg);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .modal-body > p {
    font-size: 1.1rem;
    color: var(--color-fg);
    opacity: 0.7;
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
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .btn-login {
    background-color: var(--color-blue);
    color: white;
  }

  .btn-login:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-register {
    background: var(--color-red);
    color: white;
  }

  .btn-register:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .modal-note {
    font-size: 0.9rem;
    color: var(--color-fg);
    opacity: 0.6;
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
    color: var(--color-fg);
    margin: 0 0 1.5rem 0;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--color-border);
  }

  .bid-confirmation {
    background: rgba(59, 130, 246, 0.1);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    color: var(--color-fg);
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
    color: var(--color-fg);
    opacity: 0.7;
    margin: 0 0 1.5rem 0;
    line-height: 1.6;
  }

  .privacy-toggle {
    background-color: var(--color-muted);
    border: 1px solid var(--color-border);
    padding: 1rem;
    margin-bottom: 1.5rem;
    border-radius: var(--radius-md);
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
    accent-color: var(--color-red);
  }

  .toggle-text {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-fg);
  }

  .toggle-hint {
    margin: 0.75rem 0 0 0;
    padding-left: 2rem;
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-style: italic;
  }

  .btn-cancel-bid,
  .btn-confirm-bid {
    flex: 1;
    padding: 1rem 2rem;
    text-decoration: none;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    cursor: pointer;
    border-radius: var(--radius-md);
  }

  .btn-cancel-bid {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-cancel-bid:hover {
    background-color: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-confirm-bid {
    background: var(--color-blue);
    color: white;
  }

  .btn-confirm-bid:hover {
    background: var(--color-fg);
    color: var(--color-bg);
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
    color: var(--color-fg);
    font-size: 0.95rem;
  }

  .form-group input,
  .form-group textarea,
  .form-group select {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--color-border);
    font-size: 1rem;
    font-family: inherit;
    transition: border-color 150ms ease-out;
  }

  .form-group input:focus,
  .form-group textarea:focus,
  .form-group select:focus {
    outline: none;
    border-color: var(--color-red);
  }

  .form-group input:disabled,
  .form-group textarea:disabled,
  .form-group select:disabled {
    background-color: var(--color-muted);
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
    color: var(--color-fg);
    opacity: 0.7;
    font-style: italic;
  }

  .btn-cancel-edit,
  .btn-save-edit {
    flex: 1;
    padding: 1rem 2rem;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    cursor: pointer;
    border-radius: var(--radius-md);
  }

  .btn-cancel-edit {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-cancel-edit:hover:not(:disabled) {
    background-color: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-save-edit {
    background: var(--color-red);
    color: white;
  }

  .btn-save-edit:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-cancel-edit:disabled,
  .btn-save-edit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Owner Section Styles */
  .owner-section {
    background: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .highest-bid-info {
    text-align: center;
    padding: 1.5rem;
    margin: 1rem 0;
  }

  .info-text {
    font-size: 0.95rem;
    color: var(--color-fg);
    font-weight: 600;
    margin: 0 0 0.5rem 0;
  }

  .bid-amount-large {
    font-size: 2.5rem;
    font-weight: 900;
    color: var(--color-blue);
    margin: 0.5rem 0;
  }

  .bidder-info {
    font-size: 1rem;
    color: var(--color-fg);
    margin: 0.5rem 0 0 0;
  }

  .accept-bid-btn {
    width: 100%;
    padding: 1.25rem;
    font-size: 1.2rem;
    font-weight: 700;
    background: var(--color-blue);
    color: white;
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    margin-top: 1rem;
    border-radius: var(--radius-md);
  }

  .accept-bid-btn:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  /* Accept Bid Modal Styles */
  .accept-confirmation {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid var(--color-blue);
    border-radius: var(--radius-md);
  }

  .warning-message {
    background-color: rgba(239, 68, 68, 0.1);
    border: 1px solid var(--color-red);
    padding: 1rem;
    margin-top: 1.5rem;
    color: var(--color-fg);
    font-weight: 600;
    border-radius: var(--radius-md);
  }

  .btn-accept-bid {
    flex: 1;
    padding: 1rem 2rem;
    font-weight: 600;
    font-size: 1.1rem;
    text-align: center;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    cursor: pointer;
    background: var(--color-blue);
    color: white;
    border-radius: var(--radius-md);
  }

  .btn-accept-bid:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
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
    border-bottom: 1px solid var(--color-border);
  }

  .tab-btn {
    padding: 0.75rem 1.5rem;
    background-color: transparent;
    border: none;
    border-bottom: 3px solid transparent;
    color: var(--color-fg);
    opacity: 0.7;
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease-out;
    margin-bottom: -1px;
  }

  .tab-btn:hover:not(:disabled) {
    color: var(--color-red);
    opacity: 1;
  }

  .tab-btn.active {
    color: var(--color-red);
    border-bottom-color: var(--color-red);
    opacity: 1;
  }

  .tab-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tab-content {
    margin-top: 1.5rem;
  }

  .tab-pane {
    animation: fadeIn 150ms ease-out;
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
    background-color: var(--color-surface);
    border: 1px solid var(--color-red);
    color: var(--color-red);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .duration-btn:hover:not(:disabled) {
    background-color: var(--color-fg);
    color: var(--color-bg);
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
    border: 1px solid var(--color-border);
    font-family: inherit;
  }

  .duration-input:focus {
    outline: none;
    border-color: var(--color-red);
  }

  .duration-unit {
    font-size: 0.875rem;
    color: var(--color-fg);
    opacity: 0.7;
    font-weight: 500;
  }

  .apply-duration-btn {
    padding: 0.625rem 1.5rem;
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .apply-duration-btn:hover:not(:disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .apply-duration-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  /* Success Toast Styles */
  .success-toast {
    position: fixed;
    top: 1.5rem;
    right: 1.5rem;
    z-index: 10000;
    background: var(--color-surface);
    border: 1px solid var(--color-blue);
    overflow: hidden;
    animation: toastSlideIn 150ms ease-out;
    min-width: 320px;
    max-width: 400px;
    border-radius: var(--radius-lg);
  }

  @keyframes toastSlideIn {
    from {
      transform: translateX(120%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
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

  @keyframes confettiFall {
    0% {
      opacity: 1;
      transform: translateY(0) rotate(0deg) scale(1);
    }
    100% {
      opacity: 0;
      transform: translateY(100px) rotate(720deg) scale(0.5);
    }
  }

  .toast-content {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 1rem 1.25rem;
    position: relative;
  }

  .toast-icon {
    width: 44px;
    height: 44px;
    background: rgba(59, 130, 246, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--color-blue);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  .toast-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    flex: 1;
  }

  .toast-title {
    font-weight: 700;
    font-size: 1rem;
    color: var(--color-fg);
  }

  .toast-subtitle {
    font-size: 0.85rem;
    color: var(--color-muted-fg);
  }

  .toast-close {
    background: var(--color-surface-hover);
    border: 1px solid var(--color-border);
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--color-muted-fg);
    transition: all 150ms ease-out;
    flex-shrink: 0;
    border-radius: var(--radius-sm);
  }

  .toast-close:hover {
    background: var(--color-border);
    color: var(--color-fg);
  }

  .toast-progress {
    height: 4px;
    background: var(--color-border);
  }

  .toast-progress::after {
    content: '';
    display: block;
    height: 100%;
    background: var(--color-blue);
    animation: toastProgress 5s linear forwards;
  }

  @keyframes toastProgress {
    from {
      width: 100%;
    }
    to {
      width: 0%;
    }
  }

  @media (max-width: 480px) {
    .success-toast {
      top: 1rem;
      right: 1rem;
      left: 1rem;
      min-width: auto;
      max-width: none;
    }
  }

  /* Live Update Indicator */
  .title-container {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .title-container h1 {
    margin: 0;
    flex: 1;
    min-width: 0;
  }

  .title-badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    padding-top: 0.35rem;
  }

  .live-indicator {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0;
    font-size: 0.65rem;
    font-weight: 700;
    transition: all 150ms ease-out;
    border: none;
    background: none;
    opacity: 0.6;
  }

  /* Connected state */
  .live-indicator.connected {
    color: #22c55e;
    opacity: 0.8;
  }

  .live-indicator.connected .live-dot {
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
    animation: pulse-dot 2s ease-in-out infinite;
  }

  /* Updating state */
  .live-indicator.updating {
    color: var(--color-red);
    opacity: 1;
  }

  .live-indicator.updating .live-dot {
    background: var(--color-red);
    box-shadow: 0 0 6px var(--color-red);
    animation: pulse-dot 0.5s ease-in-out infinite;
  }

  .live-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .live-text {
    letter-spacing: 0.05em;
    text-transform: uppercase;
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
      opacity: 0.5;
    }
    100% {
      opacity: 1;
    }
  }

  /* Label Pulse Animation */
  .label-pulse {
    animation: labelPulse 0.6s ease-out;
  }

  @keyframes labelPulse {
    0%, 100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
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
    background: var(--color-blue);
    color: white;
    padding: 0.25rem 0.625rem;
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    border: 1px solid var(--color-border);
    z-index: 10;
  }

  @keyframes newBidHighlight {
    0% {
      background: var(--color-red);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      background: var(--color-surface);
      opacity: 1;
    }
  }

  /* Removed: newBadgePulse — Swiss flat style */

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
    background: var(--color-red);
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    font-size: 1rem;
    border-radius: var(--radius-md);
  }

  .image-upload-btn:hover:not(.disabled) {
    background: var(--color-fg);
    color: var(--color-bg);
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
    overflow: hidden;
    border: 1px solid var(--color-border);
    background: var(--color-muted);
    border-radius: var(--radius-md);
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
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    font-size: 1.25rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 150ms ease-out;
    font-weight: bold;
    line-height: 1;
    z-index: 2;
  }

  .remove-image-btn:hover:not(:disabled) {
    background: var(--color-fg);
  }

  .remove-image-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .image-number {
    position: absolute;
    bottom: 0.5rem;
    left: 0.5rem;
    background: var(--color-fg);
    color: white;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .image-type {
    position: absolute;
    top: 0.5rem;
    left: 0.5rem;
    background: var(--color-blue);
    color: white;
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  @media (max-width: 768px) {
    .image-preview-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }

  /* Admin unhide button variant (now uses .action-show) */

  /* Admin Confirmation Modal */
  .admin-modal-overlay {
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
    animation: adminOverlayFadeIn 150ms ease-out;
    padding: 1rem;
    backdrop-filter: blur(2px);
  }

  @keyframes adminOverlayFadeIn {
    from { opacity: 0; backdrop-filter: blur(0); }
    to { opacity: 1; backdrop-filter: blur(2px); }
  }

  .admin-modal-content {
    background-color: var(--color-surface);
    max-width: 460px;
    width: 90%;
    border: 1px solid var(--color-border);
    position: relative;
    animation: adminModalSlideUp 150ms ease-out;
    border-radius: var(--radius-lg);
  }

  @keyframes adminModalSlideUp {
    from { transform: translateY(30px) scale(0.97); opacity: 0; }
    to { transform: translateY(0) scale(1); opacity: 1; }
  }

  .admin-modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    background: none;
    border: 1px solid var(--color-border);
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
    transition: background-color 150ms ease-out, opacity 150ms ease-out;
  }

  .admin-modal-close:hover {
    background-color: var(--color-muted);
    opacity: 1;
  }

  .admin-modal-header {
    padding: 2rem 2rem 1rem 2rem;
    text-align: center;
  }

  .admin-modal-header h2 {
    margin: 0;
    font-size: 1.5rem;
    color: var(--color-fg);
  }

  .admin-modal-body {
    padding: 0 2rem 2rem 2rem;
    text-align: center;
  }

  .admin-modal-product-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-fg);
    margin-bottom: 0.75rem;
  }

  .admin-modal-description {
    font-size: 0.95rem;
    color: var(--color-fg);
    opacity: 0.7;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .admin-modal-actions {
    display: flex;
    gap: 1rem;
  }

  .btn-admin-cancel,
  .btn-admin-confirm {
    flex: 1;
    padding: 0.85rem 1.5rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }

  .btn-admin-cancel {
    background-color: var(--color-muted);
    color: var(--color-fg);
  }

  .btn-admin-cancel:hover {
    background-color: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-admin-hide {
    background: var(--color-red);
    color: white;
  }

  .btn-admin-hide:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-admin-unhide {
    background: #198754;
    color: white;
  }

  .btn-admin-unhide:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-admin-confirm:disabled,
  .btn-admin-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Loading spinner */
  .admin-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: adminSpin 0.6s linear infinite;
    vertical-align: middle;
    margin-right: 0.4rem;
  }

  @keyframes adminSpin {
    to { transform: rotate(360deg); }
  }

  /* Report button (legacy — now uses .action-btn .action-report) */

  /* Report modal */
  .report-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .report-modal-content {
    background: var(--color-surface);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    max-width: 480px;
    width: 100%;
    position: relative;
    padding: 2rem;
    border-radius: var(--radius-lg);
  }

  .report-modal-close {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-fg);
    opacity: 0.5;
    line-height: 1;
    padding: 0.25rem;
  }

  .report-modal-close:hover {
    opacity: 1;
  }

  .report-modal-header h2 {
    font-size: 1.3rem;
    font-weight: 700;
    margin-bottom: 1rem;
    color: var(--color-fg);
  }

  .report-modal-product-title {
    font-style: italic;
    color: var(--color-fg);
    opacity: 0.6;
    margin-bottom: 1.25rem;
    font-size: 0.95rem;
  }

  .report-label {
    display: block;
    font-weight: 600;
    margin-bottom: 0.4rem;
    font-size: 0.9rem;
    color: var(--color-fg);
  }

  .report-select {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border);
    font-size: 0.95rem;
    margin-bottom: 1rem;
    background: var(--color-bg);
    color: var(--color-fg);
  }

  .report-textarea {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--color-border);
    font-size: 0.95rem;
    margin-bottom: 1rem;
    resize: vertical;
    font-family: inherit;
    background: var(--color-bg);
    color: var(--color-fg);
  }

  .report-error {
    color: var(--color-red);
    font-size: 0.85rem;
    margin-bottom: 0.75rem;
    font-weight: 600;
  }

  .report-success {
    text-align: center;
    padding: 1rem 0;
  }

  .report-success p {
    margin-bottom: 1.25rem;
    color: var(--color-fg);
    opacity: 0.7;
  }

  .report-modal-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .btn-report-cancel {
    padding: 0.6rem 1.25rem;
    background: var(--color-muted);
    color: var(--color-fg);
    border: 1px solid var(--color-border);
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .btn-report-cancel:hover {
    opacity: 0.8;
  }

  .btn-report-submit,
  .btn-report-done {
    padding: 0.6rem 1.25rem;
    background: var(--color-red);
    color: white;
    border: 1px solid var(--color-border);
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms ease-out, color 150ms ease-out;
    border-radius: var(--radius-md);
  }

  .btn-report-submit:hover,
  .btn-report-done:hover {
    background: var(--color-fg);
    color: var(--color-bg);
  }

  .btn-report-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  /* Sticky right column on desktop */
  .product-details {
    align-self: start;
    position: sticky;
    top: 5rem;
  }

  @media (max-width: 768px) {
    .product-details {
      position: static;
    }
  }
</style>
